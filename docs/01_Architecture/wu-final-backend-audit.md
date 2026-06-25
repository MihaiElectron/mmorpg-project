# Audit final — coordonnées pixels restantes dans le backend WU

_Date : 2026-06-22_
_Branche : main_
_Portée : backend NestJS uniquement — aucun code modifié_

---

## 1. Usages restants de coordonnées pixels (hors DTO WebSocket et rendu frontend)

### `world.service.ts` — Joueurs

| Ligne | Fonction | Variable | L/É | Encore nécessaire | Legacy temp. | À migrer |
|---|---|---|---|---|---|---|
| 86–87 | `joinPlayer` | `character.positionX/Y` | Lecture | Oui — fallback si worldX/Y absents | Oui | Oui — après backfill complet |
| 102–103, 116–117 | `respawnCharacter` | `rp.x/y` (RespawnPoint) | Lecture | Oui — fallback via readWorldPosition | Oui | Oui — après backfill RespawnPoint |
| 130–131 | `respawnCharacter` | `nearest.radius` (px) | Lecture | Oui — drift aléatoire en pixels | Oui | Oui — convertir `radius` en WU |
| 147–148 | `respawnCharacter` | `positionX/Y` (DB update) | Écriture | Oui — double-write legacy | Oui | Oui — supprimer après drop colonne |
| 157–158 | `respawnCharacter` | `player.x/y` (mémoire) | Écriture | Oui — cache pixel ConnectedPlayer | Permanent | Non — cache de rendu |
| 212–213 | `joinPlayer` | `character.positionX/Y` | Lecture | Oui — fallback exception | Oui | Oui |
| 222–223 | `joinPlayer` | `positionX/Y`, `payload.x/y` | Lecture | Oui — fallback sans WU | Oui | Oui |
| 247–248 | `joinPlayer` | `player.x/y` (payload) | Écriture | Oui — cache pixel | Permanent | Non |
| 265 | `updatePlayer` | `payload.x/y` | Lecture | Oui — protocole client actuel | Oui | Oui — quand player_move envoie WU |
| 273–274 | `updatePlayer` | `player.x/y` | Écriture | Oui — cache pixel | Permanent | Non |
| 285–286 | `updatePlayer` | `player.x/y` (client.data) | Écriture | Oui — cache pixel | Permanent | Non |
| 309 | `persistPlayerPosition` | `player.x/y` | Lecture | Oui — fallback défensif | Oui | Oui — supprimer après stabilisation |
| 322–323 | `persistPlayerPosition` | `positionX/Y` (DB) | Écriture | Oui — double-write | Oui | Oui — drop colonne |
| 380–381 | `teleportCharacter` | `rx/ry` pixels | Écriture | Oui — commande admin `/tp x y` | Oui | Oui — quand protocole admin envoie WU |
| 394 | `teleportCharacter` | `positionX/Y` (DB) | Écriture | Oui — double-write | Oui | Oui — drop colonne |

---

### `creatures.service.ts` — Animaux

| Ligne | Fonction | Variable | L/É | Encore nécessaire | Legacy temp. | À migrer |
|---|---|---|---|---|---|---|
| 54–55 | `toDto()` | `creature.x/y` | Lecture | Oui — payload socket client | **Permanent** | Non — cache pixel pour frontend |
| 131–132 | `onModuleInit` | `spawn.spawnX/Y` | Lecture | Oui — init cache pixel | Oui | Oui — utiliser `spawn.worldX/Y` après backfill spawn |
| 133 | `onModuleInit` | `pixelToWUSafe(a.x, a.y)` | Lecture | Oui — calcule WU au démarrage | Oui | Oui |
| 223, 271, 336 | `doPatrol/doFighting/doEscaping` | `spawn.spawnX/Y` | Lecture | Oui — fallback si `spawn.worldX/Y` null | Oui | Oui — après backfill creature_spawn |
| 244–245, 291–292, 361–362 | `doPatrol/doFighting/doEscaping` | `creature.x/y = wuToIsoScreen(...)` | Écriture | Oui — cache pixel dérivé de WU | **Permanent** | Non — cache de rendu |
| 389–390 | `respawnCreature` | `spawn.spawnX/Y` | Lecture | Oui — reset position | Oui | Oui — utiliser `spawn.worldX/Y` |
| 391 | `respawnCreature` | `pixelToWUSafe(a.x, a.y)` | Lecture | Oui — calcule WU depuis spawn | Oui | Oui |
| 397–398 | `respawnCreature` | `spawn.spawnX/Y` (DB update) | Écriture | Oui — double-write legacy | Oui | Oui |
| 541–542 | `adminSpawnCreature` | `spawnX/Y` (DB write) | Écriture | Oui — création spawn depuis admin pixels | Oui | Oui — quand admin envoie WU |
| 547 | `adminSpawnCreature` | `pixelToWUSafe(x, y)` | Lecture | Oui — convertit entrée admin | Oui | Oui |
| 614–615 | `adminUpdateCreature` | `creature.x/y` | Écriture | Oui — admin modifie position pixel | Oui | Oui |
| 625 | `adminUpdateCreature` | `pixelToWUSafe(creature.x, creature.y)` | Lecture | Oui — double-write après admin update | Oui | Oui |
| 640–641 | `moveCreature` | `creature.x/y` | Écriture | Oui — drag-and-drop admin pixel | Oui | Oui |
| 643, 646 | `moveCreature` | `pixelToWUSafe` + `x/y` (DB) | L+É | Oui — double-write drag-drop | Oui | Oui |
| 662–663 | `forceRespawnAll` | `spawn.spawnX/Y` | Lecture | Oui — même que `respawnCreature` | Oui | Oui |
| 664, 673–674 | `forceRespawnAll` | `pixelToWUSafe` + `spawn.spawnX/Y` (DB) | L+É | Oui — double-write | Oui | Oui |
| 718 | `seedInstances` | `pixelToWUSafe(spawn.spawnX, spawn.spawnY)` | Lecture | Oui — WU pour le seed initial | Oui | Oui — après creature_spawn natif WU |

---

### `resources.gateway.ts` — Ressources

| Ligne | Fonction | Variable | L/É | Encore nécessaire | Legacy temp. | À migrer |
|---|---|---|---|---|---|---|
| 128, 243 | `onInteract / runGatherCycle` | `player.x/y` → `startGatherCycle` | Lecture | Oui — stocké pour MOVE_TOLERANCE | Oui | Oui — migrer vers WU |
| 170–171 | `runGatherCycle` | `player.x/y`, `session.lastX/Y` | Lecture | Oui — détection de mouvement pixel | Oui | Oui — comparer en WU |
| 252 | `isInRange` | `target.x/y` | Lecture | Oui — fallback readWorldPosition | Oui | Oui — après backfill ressources |

---

### `admin.service.ts` — Admin

| Ligne | Fonction | Variable | L/É | Encore nécessaire | Legacy temp. | À migrer |
|---|---|---|---|---|---|---|
| 39 | `getTemplates` | `spawn.spawnX/Y` | Lecture | Oui — affichage panneau | Permanent UI | Non |
| 108–113 | `updateResource` | `resource.x/y` → `isoScreenToWorldWU` | L | Oui — validation+conversion | Oui | Oui — si admin envoie WU |
| 130–132 | `createResource` | `isoScreenToWorldWU(rx, ry)` | L | Oui — entrée admin pixels | Oui | Oui — si admin envoie WU |

---

### `world.gateway.ts` — Protocole réseau

| Ligne | Fonction | Variable | L/É | Encore nécessaire | Legacy temp. | À migrer |
|---|---|---|---|---|---|---|
| 114–115 | `player_move` handler | `payload.x/y` | Lecture | Oui — protocole actuel client→serveur | **Oui** | Oui — quand client envoie worldX/Y |

---

## 2. Conversions restantes

### `pixelToWUSafe` — CreaturesService uniquement

| Site d'appel | Raison | Peut être supprimé quand |
|---|---|---|
| `onModuleInit` | Init WU depuis spawn pixels | creature_spawn.worldX/Y backfillés et utilisés directement |
| `respawnCreature` | WU depuis spawn pixels | idem |
| `forceRespawnAll` | WU depuis spawn pixels | idem |
| `doPatrol/doFighting/doEscaping` (×3) | Fallback spawn WU | creature_spawn.worldX/Y garantis non null |
| `adminSpawnCreature` | Entrée admin pixels → WU | Admin envoie WU nativement |
| `adminUpdateCreature` | Entrée admin pixels → WU | idem |
| `moveCreature` | Drag-and-drop admin pixels | idem |
| `seedInstances` | Seed pixels → WU | creature_spawn natif WU |

**Résidu permanent** : fonctions admin recevant des pixels depuis le panneau (3 fonctions). `pixelToWUSafe` ne peut pas être supprimé tant que le protocole admin reste en pixels.

---

### `isoScreenToWorldWU`

| Fichier | Fonction | Peut être supprimé quand |
|---|---|---|
| `creatures.service.ts` | `pixelToWUSafe` (interne) | Voir ci-dessus |
| `world.service.ts` | `updatePlayer` | `player_move` client envoie `worldX/Y` |
| `world.service.ts` | `persistPlayerPosition` (fallback) | Colonne `positionX/Y` supprimée et WU stable |
| `world.service.ts` | `respawnCharacter` (drift pixel→WU) | `RespawnPoint.radius` migré en WU |
| `world.service.ts` | `teleportCharacter` | Protocole admin `/tp` envoie WU |
| `admin.service.ts` | `createResource`, `updateResource` | Protocole admin envoie WU |

---

### `legacyRadiusToWU`

| Usage | Peut être supprimé quand |
|---|---|
| Vitesses IA (`state.speed * dt`) | Templates CreatureTemplate en WU nativement |
| Rayons (`patrolRadius`, `aggroRadius`) | idem |
| Portées d'équipement (`item.range`) | Items en WU nativement |
| Portée mêlée résiduelle | idem |

**Résidu long terme** : `legacyRadiusToWU` est structurellement présent jusqu'à ce que les templates et items stockent des valeurs WU directement.

---

### `pixelToWUWithMap`

Utilisé uniquement dans `wu-backfill-report.ts` (outil de diagnostic). Jamais sur un chemin de production. Peut être supprimé après la fin des migrations de backfill.

---

## 3. Endroits où `worldX/worldY` sont désormais la vérité

| Domaine | Source de vérité WU | État |
|---|---|---|
| **Joueurs en mémoire** | `ConnectedPlayer.worldX/Y/mapId` | ✅ — vérité depuis R0 |
| **Joueurs en DB** | `character.worldX/Y/mapId` | ✅ — double-write depuis R0, backfill Phase 1 ✅ |
| **Animaux en mémoire** | `creature.worldX/Y/mapId` | ✅ — vérité depuis A2+A4 |
| **Animaux en DB** | `creature.worldX/Y/mapId` | ✅ — double-write depuis A1 |
| **IA — mouvement** | `creature.worldX/Y` (patrol, fight, escape) | ✅ — depuis A4 |
| **IA — aggro/portée** | `chebyshevDistanceWU` sur `worldX/Y` | ✅ — depuis A3 |
| **Combat joueur→creature** | `attack()` → `creature.worldX/Y` direct | ✅ — depuis A7 |
| **Ressources en DB** | `resource.worldX/Y/mapId` | ✅ — double-write depuis R1 |
| **Ressources — portée de récolte** | `chebyshevDistanceWU` via `readWorldPosition` | ✅ — depuis R2 |
| **Respawn personnage — sélection du point** | `chebyshevDistanceWU` via `readWorldPosition` | ✅ — WU logic |
| **Spawns animaux (creature_spawn)** | `spawn.worldX/Y/mapId` nullable | ⚠️ — colonnes présentes, backfill A0 fait sur `creatures`, statut spawn incertain |
| **Points de respawn (RespawnPoint)** | `rp.worldX/Y/mapId` nullable | ⚠️ — colonnes présentes, backfill non confirmé |

---

## 4. Estimation du pourcentage de migration backend

| Domaine | Logique serveur | Persistance DB | Protocole réseau | **Estimé global** |
|---|---|---|---|---|
| **Joueurs** | 95% (drift respawn en px) | 80% (double-write, positionX/Y legacy) | 0% (player_move envoie {x,y}) | **~60%** |
| **Animaux** | 95% (admin + seed en px) | 90% (double-write complet) | 20% (toDto envoie x/y, nécessaire) | **~75%** |
| **Ressources** | 80% (MOVE_TOLERANCE en px) | 80% (double-write admin) | 10% | **~55%** |
| **Admin** | 30% (spawn/move encore pixels) | 80% (ressources OK) | 0% (panneau envoie pixels) | **~40%** |
| **Respawn** | 70% (sélection WU, drift px) | 60% (RespawnPoint backfill incertain) | 10% | **~55%** |
| **Spawns (creature_spawn)** | 40% (colonnes WU présentes, fallback actif) | 40% | — | **~40%** |
| **Combat** | 100% (attack, mêlée, riposte WU) | 100% | 50% (résultat OK, entrée client px) | **~90%** |
| **Récolte** | 70% (portée WU, MOVE_TOLERANCE px) | 70% | 0% | **~55%** |
| **Réseau (protocole)** | — | — | 30% (world_joined envoie WU, player_move non) | **~30%** |

**Migration backend globale estimée : ~60%**

La logique métier serveur est largement migrée. Les 40% restants sont concentrés sur :
- le protocole réseau client→serveur (player_move encore en pixels),
- les fonctions admin (input encore en pixels),
- les backfills secondaires (creature_spawn, RespawnPoint),
- les colonnes legacy (`positionX/Y`) non encore supprimées.

---

## 5. Ordre optimal des derniers travaux backend

### Prérequis : backfills secondaires

```
B1 — Backfill creature_spawn.worldX/Y/mapId
     → débloque onModuleInit, respawnCreature, forceRespawnAll, les 3 fallbacks IA

B2 — Backfill RespawnPoint.worldX/Y/mapId
     → débloque respawnCharacter (drift radius WU)
```

### Phase A — Cleanup animaux

```
A8 — creature_spawn : utiliser spawn.worldX/Y comme source primaire
     dans onModuleInit, respawnCreature, forceRespawnAll, seedInstances
     → supprime 4× pixelToWUSafe(spawn.spawnX/Y)
     → supprime les 3 fallbacks dans doPatrol/doFighting/doEscaping
     Dépend de B1.
```

### Phase B — Respawn propre

```
B3 — RespawnPoint.radius → radiusWU
     Calcul drift en WU dans respawnCharacter
     → supprime isoScreenToWorldWU dans respawnCharacter
     Dépend de B2.
```

### Phase C — Protocole réseau client→serveur

```
C1 — player_move : ajouter worldX/worldY dans le payload client
     → updatePlayer utilise directement les WU du client
     → supprime isoScreenToWorldWU dans updatePlayer
     → nettoie persistPlayerPosition (fallback inutile)
     Condition : migration frontend correspondante.

C2 — Supprimer positionX/Y des colonnes DB character
     → nettoie double-write persistPlayerPosition, respawnCharacter, teleportCharacter
     → schéma migration TypeORM
     Dépend de C1 + stabilité prod.
```

### Phase D — Admin protocol

```
D1 — adminSpawnCreature, adminUpdateCreature, moveCreature :
     accepter worldX/Y depuis le panneau admin
     → supprime pixelToWUSafe dans les 3 fonctions admin
     → admin panel frontend correspondant
     Condition : refactoring panneau admin.
```

### Phase E — Colonnes legacy animaux

```
E1 — creature.x/y : passer de double-write à cache dérivé pur
     wuToIsoScreenX/Y avant chaque toDto uniquement
     → supprimer creature.x/y des DB saves (ne garder que worldX/Y)
     Dépend de A8 + stabilité prod.
```

### Récapitulatif séquentiel recommandé

```
B1 (backfill spawn) → A8 (utiliser spawn.worldX/Y)
B2 (backfill RespawnPoint) → B3 (radius WU)
C1 (player_move WU) → C2 (drop positionX/Y)
D1 (admin WU, optionnel)
E1 (drop creature.x/y legacy, optionnel)
```

B1+B2 et C1 sont indépendants et peuvent avancer en parallèle.
D1 est optionnel tant que le panneau admin reste interne.
E1 est le travail le plus risqué (schema + rendu) — à garder pour dernier.
