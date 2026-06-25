# Étude — État monde des animaux

_Date : 2026-06-22_
_Branche : main_
_Fichier principal : `apps/api-gateway/src/creatures/creatures.service.ts`_

---

## 1. Source de vérité

### Situation actuelle

| Coordonnée | Colonne DB | Type | Null ? | En mémoire (`liveCreatures`) |
|---|---|---|---|---|
| `creature.x` | `creatures.x` | `int NOT NULL` | Non | Oui — mis à jour chaque tick IA |
| `creature.y` | `creatures.y` | `int NOT NULL` | Non | Oui — mis à jour chaque tick IA |
| `creature.worldX` | `creatures.worldX` | `int NULLABLE` | **Toujours NULL** | Jamais écrit |
| `creature.worldY` | `creatures.worldY` | `int NULLABLE` | **Toujours NULL** | Jamais écrit |
| `creature.mapId` | `creatures.mapId` | `int NULLABLE` | **Toujours NULL** | Jamais écrit |

### Ce qui fait foi

**`creature.x` / `creature.y` en mémoire (`liveCreatures` Map) sont la vérité serveur.**

La DB reflète la dernière position sauvegardée explicitement (respawn, mort, admin), pas la position courante. Entre deux événements, la DB et la mémoire divergent — c'est le comportement voulu pour le temps réel.

`worldX/worldY/mapId` sont des colonnes préparées pour la migration WU mais entièrement inutilisées. Elles sont `NULL` pour toutes les entités creatures depuis leur création.

---

## 2. Écritures de `creature.x` / `creature.y`

### En mémoire uniquement (pas de persistance DB immédiate)

| Fonction | Fichier | Raison |
|---|---|---|
| `doPatrolMovement` | `creatures.service.ts:215–228` | Déplacement aléatoire dans `patrolRadius` chaque tick |
| `doFighting` | `creatures.service.ts:265–266` | Poursuite vers la cible si dist > MELEE_RANGE |
| `doEscaping` | `creatures.service.ts:321–325` | Fuite du joueur le plus proche |

### En mémoire + persistance DB

| Fonction | Fichier | Colonnes DB écrites | Raison |
|---|---|---|---|
| `onModuleInit` | `:128–130` | `x, y, state, health` | Remise à zéro des animaux morts au démarrage |
| `respawnCreature` | `:341–349` | `x, y, state, health` | Respawn automatique après mort |
| `forceRespawnAll` | `:608–620` | `x, y, state, health` | Commande admin `/respawn all` |
| `adminUpdateCreature` | `:565–578` | `x, y, health, state` (via `.save`) | Admin — modification directe en panneau |
| `moveCreature` | `:589–593` | `x, y` | Admin — drag-and-drop sur la map |
| `attack` | `:402` | `x, y, health, state` (via `.save`) | Sauvegarde HP + state après coup |
| `seedInstances` | `:664–670` | `x, y, health, state` | Création initiale au démarrage |
| `adminSpawnCreature` | `:500–508` | `x, y, health, state` | Création admin via drag-and-drop |

**Observation critique** : dans aucun de ces appels `worldX`, `worldY` ou `mapId` ne sont écrits.

---

## 3. Lectures de `creature.x` / `creature.y`

### Déplacement / IA

| Fonction | Usage | Lignes |
|---|---|---|
| `doPatrolMovement` | Calcul nouvelle position, vérification `patrolRadius` | 215–228 |
| `doFighting` | Distance à la cible, leash check, avance vers cible | 251–266 |
| `doEscaping` | Direction de fuite, vérification rayon max | 306–325 |

### Aggro

| Fonction | Usage | Lignes |
|---|---|---|
| `findNearestPlayer` | `Math.hypot(p.x - creature.x, p.y - creature.y)` — pixels | 34 |

Les `p.x/p.y` utilisés ici sont le cache pixel de `ConnectedPlayer` (pas `worldX/worldY`).

### Combat

| Fonction | Usage | Lignes |
|---|---|---|
| `attack` | `isoScreenToWorldWU(creature.x, creature.y)` — conversion temporaire WU | 382 |
| `doFighting` | `dist <= MELEE_RANGE` — auto-attaque IA | 271 |

### Sockets / broadcast

| Fonction | Usage | Lignes |
|---|---|---|
| `toDto` | `x: creature.x, y: creature.y` — payload envoyé aux clients | 47–48 |
| `server.emit('creature_update', toDto(creature))` | Broadcast à chaque tick et événement | 194, 352, 581, 596, 623 |

### Persistance

Voir section 2 — toutes les fonctions qui lisent `x/y` pour les réécrire en DB.

---

## 4. Cycle de vie complet

### Spawn (démarrage serveur)

```
seedInstances()
  → creatureRepository.save({ x: spawn.spawnX, y: spawn.spawnY, ... })
  → worldX/worldY/mapId : NULL

onModuleInit()
  → creature mort en DB : creature.x = spawnX, creature.y = spawnY, save()
  → liveCreatures.set(a.id, a)   ← charge tous les animaux en mémoire
  → startPatrol(server)        ← arme le setInterval (200 ms)
```

Coordonnées : `x/y` depuis `spawn.spawnX/spawnY` (pixels). `worldX/Y/mapId` jamais écrits.

---

### Patrol (tick 200 ms)

```
tickPatrol()
  → pour chaque creature alive :
      findNearestPlayer(players, creature)
        → Math.hypot(p.x - creature.x, p.y - creature.y)   ← pixels
      si dist ≤ aggroRadius → changeCreatureState('fighting')

      doPatrolMovement()
        → creature.x = Math.round(newX)    ← mémoire seulement
        → creature.y = Math.round(newY)

      server.emit('creature_update', toDto(creature))   ← broadcast x/y pixels
```

La DB n'est **pas** mise à jour pendant la patrouille. Divergence mémoire/DB en continu.

---

### Aggro

```
findNearestPlayer(players, creature)
  → pour chaque ConnectedPlayer :
      d = Math.hypot(p.x - creature.x, p.y - creature.y)   ← p.x/y = cache pixel
  → retourne { player, dist }

si dist ≤ template.aggroRadius (pixels) :
  → changeCreatureState(creature, 'fighting')
  → state.targetCharacterId = nearest.player.characterId
```

Dépend de `p.x/y` (cache pixel `ConnectedPlayer`) **et** de `creature.x/y` pixels.

---

### Pursuit (`doFighting`)

```
doFighting()
  → target = player ciblé (ConnectedPlayer)
  → dx = target.x - creature.x       ← pixels des deux côtés
  → dy = target.y - creature.y
  → dist = Math.hypot(dx, dy)

  leash check : Math.hypot(creature.x - spawnX, ...) > patrolRadius × 2
    → si vrai : changeCreatureState('alive')

  si dist > MELEE_RANGE (60 px) :
    → creature.x = Math.round(creature.x + dx/dist × speedMax × dt)   ← mémoire
    → creature.y = Math.round(creature.y + dy/dist × speedMax × dt)

  si dist ≤ MELEE_RANGE et cooldown OK :
    → auto-attaque : character.health -= dmg, update DB joueur
```

Entièrement en pixels. `MELEE_RANGE = 60` est la constante IA (pas `MELEE_RANGE_WU`).

---

### Attack joueur → creature (`attack()`)

```
attack(id, characterId, { worldX, worldY, mapId })
  → resolveAttackRange(character) → WU via legacyRadiusToWU()
  → creatureWU = isoScreenToWorldWU(creature.x, creature.y)   ← conversion temporaire
  → distance = chebyshevDistanceWU(attackerPosition, creatureWU)
  → si distance > range : 'Target out of range'
  → creature.health -= damage
  → creatureRepository.save(creature)   ← persiste x/y courant + health + state
  → riposte si distance ≤ MELEE_RANGE_WU (960)
```

Seule fonction dont le range check est en WU. La position de l'creature reste en pixels en mémoire.

---

### Escape (`doEscaping`)

```
doEscaping()
  → nearest = findNearestPlayer(players, creature)   ← pixels
  → si nearest.dist > patrolRadius : retour 'alive'
  → dx = creature.x - nearest.player.x               ← pixels
  → dy = creature.y - nearest.player.y
  → dist = Math.hypot(dx, dy)
  → newX = creature.x + dx/dist × speedMax × dt
  → si escDist > patrolRadius × 2 : clampe au bord
    sinon : creature.x = Math.round(newX)             ← mémoire
            creature.y = Math.round(newY)
```

---

### Respawn (automatique)

```
respawnCreature(id)
  → creature.state = 'alive'
  → creature.health = template.baseHealth
  → creature.x = spawn.spawnX           ← reset position pixels
  → creature.y = spawn.spawnY
  → creatureRepository.update(id, { state, health, x, y })   ← DB sans worldX/Y
  → server.emit('creature_update', toDto(creature))
```

`worldX/worldY/mapId` non écrits. La DB reste avec NULL.

---

## 5. Base de données — colonnes `worldX` / `worldY` / `mapId`

### Creature entity

Colonnes déclarées dans `creature.entity.ts` :

```typescript
@Column({ type: 'int', nullable: true })
worldX: number | null;

@Column({ type: 'int', nullable: true })
worldY: number | null;

@Column({ type: 'int', nullable: true })
mapId: number | null;
```

### État réel

**Les colonnes sont complètement ignorées.**

- Jamais écrites par `CreaturesService` (aucun `.worldX =` ni `worldX:` dans les saves/updates).
- Jamais lues par `CreaturesService` (la seule variable `creatureWU` dans `attack()` est locale).
- `NULL` pour toutes les lignes de la table `creatures`.

### Creature_spawn entity

Même situation : colonnes `worldX/worldY/mapId` déclarées, nullable, jamais écrites ni lues par `CreaturesService`.

---

## 6. Proposition de migration

### Objectif final

```
creature.worldX / creature.worldY → vérité serveur (IA, range checks, persistance)
creature.x / creature.y           → cache de rendu pour le frontend uniquement
```

### Étapes

#### A0 — Backfill DB (pré-requis)

Calculer `worldX/Y/mapId` pour toutes les lignes `creatures` et `creature_spawn` existantes à partir de leurs `x/y` pixels via `isoScreenToWorldWU`. Utiliser le script backfill existant ou en créer un analogue.

Sans ce backfill, A1 ne peut pas démarrer proprement.

#### A1 — Double-écriture DB

Dans toutes les fonctions qui écrivent `x/y` en DB, ajouter `worldX/worldY/mapId` calculés via `isoScreenToWorldWU` :

- `respawnCreature` — `creatureRepository.update`
- `forceRespawnAll` — `creatureRepository.update`
- `adminUpdateCreature` — `creatureRepository.save`
- `moveCreature` — `creatureRepository.update`
- `seedInstances` — `creatureRepository.save`
- `adminSpawnCreature` — `creatureRepository.save`
- `attack` — `creatureRepository.save`
- `onModuleInit` — `creatureRepository.save`

Analogue à ce qui a été fait pour `resources` (R1).

#### A2 — Vérité mémoire dans `liveCreatures`

Après chaque modification de `creature.x/y` en mémoire (patrol, pursuit, escape), mettre à jour `creature.worldX/worldY/mapId` :

```typescript
const wu = isoScreenToWorldWU(creature.x, creature.y);
creature.worldX = wu.worldX;
creature.worldY = wu.worldY;
creature.mapId  = DEFAULT_MAP_ID;
```

À faire dans `doPatrolMovement`, `doFighting`, `doEscaping`.

#### A3 — Migrer `findNearestPlayer` vers WU

Remplacer `Math.hypot(p.x - creature.x, p.y - creature.y)` par `chebyshevDistanceWU` avec `player.worldX/worldY` (déjà disponibles sur `ConnectedPlayer`) et `creature.worldX/worldY` (disponibles après A2).

Dépend de A2.

#### A4 — Migrer `doFighting` vers WU

Remplacer :
- `dx = target.x - creature.x` → `dx = target.worldX - creature.worldX`
- `dist = Math.hypot(dx, dy)` → `chebyshevDistanceWU`
- `dist > MELEE_RANGE` → `dist > MELEE_RANGE_WU`
- Leash check en WU
- Déplacement en WU

Dépend de A2 et A3.

#### A5 — Migrer `doPatrolMovement` vers WU

Vecteur déplacement en WU (`patrolRadius` en WU via `legacyRadiusToWU`), mise à jour de `creature.worldX/worldY`. `creature.x/y` deviennent un cache dérivé (`wuToIsoScreenX/Y`).

Dépend de A2.

#### A6 — Migrer `doEscaping` vers WU

Analogue à A4 pour la boucle fuite.

Dépend de A2 et A3.

#### A7 — Supprimer la conversion temporaire dans `attack()`

La ligne `creatureWU = isoScreenToWorldWU(creature.x, creature.y)` sera remplacée par `creature.worldX/worldY` directement (disponibles après A2).

Dépend de A2.

#### A8 — Déprécier `creature.x/y` comme source de vérité

Une fois toutes les fonctions IA en WU, les colonnes `x/y` deviennent cache de rendu :
- Calculées depuis `worldX/worldY` via `wuToIsoScreenX/Y` avant le broadcast `toDto`.
- Les colonnes DB `x/y` peuvent être marquées legacy puis supprimées ultérieurement.

---

### Séquence recommandée

```
A0 (backfill DB)
  ↓
A1 (double-écriture DB)
  ↓
A2 (worldX/worldY en mémoire — tous les mouvements)
  ↓
A3 (findNearestPlayer WU)   A7 (supprimer conversion attack)
  ↓
A4 (doFighting WU)
A5 (doPatrolMovement WU)
A6 (doEscaping WU)
  ↓
A8 (x/y → cache seul)
```

A3 et A7 peuvent être faits en parallèle après A2.
A4, A5, A6 sont indépendants entre eux après A3.

---

### Risques identifiés

| Risque | Étape | Mitigation |
|---|---|---|
| Drift mémoire/DB si A1 partiel | A1 | Faire en une seule PR, vérifier par dry-run |
| `findNearestPlayer` avec `worldX/Y = null` | A3 | Garder le fallback `Math.hypot(p.x, creature.x)` ou exiger A0+A1+A2 d'abord |
| `patrolRadius`, `aggroRadius` encore en pixels | A3–A6 | Convertir via `legacyRadiusToWU()` dans les comparaisons |
| `ConnectedPlayer.x/y` utilisé dans doFighting | A4 | `ConnectedPlayer.worldX/worldY` déjà disponibles (R0 terminé) |
| Aucun test unitaire pour patrol/pursuit/escape | A2–A6 | Écrire les tests avant chaque étape |
