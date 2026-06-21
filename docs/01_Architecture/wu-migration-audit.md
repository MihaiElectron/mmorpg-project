# Audit de migration WU — état du dépôt

_Rédigé le 2026-06-21. Basé sur l'état du commit `f5aae0b` (migration `respawnCharacter`)._  
_Audit lecture seule — aucune modification de code, de DB ni de documentation._

---

## 1. Sources de vérité — où vivent les coordonnées

### Entités TypeORM (DB)

| Entité | Colonnes legacy | Colonnes WU (nullable) | Note |
|---|---|---|---|
| `character` | `positionX`, `positionY` (INT NOT NULL) | `worldX`, `worldY`, `mapId` | Double-écriture active |
| `animal` | `x`, `y` (INT) | `worldX`, `worldY`, `mapId` | WU jamais écrits au runtime |
| `resource` | `x`, `y` (INT) | `worldX`, `worldY`, `mapId` | WU jamais écrits au runtime |
| `creature_spawn` | `spawnX`, `spawnY` (INT) | `worldX`, `worldY`, `mapId` | WU jamais utilisés au runtime |
| `respawn_point` | `x`, `y` (INT) | `worldX`, `worldY`, `mapId` | WU lus via `readWorldPosition()` |

### État en mémoire — `ConnectedPlayer`

```
worldX, worldY, mapId  ← vérité serveur WU (mis à jour à chaque player_move reçu)
x, y                   ← cache pixel Phaser (destiné uniquement au frontend)
```

### `client.data.player` (partagé entre gateways)

Contient uniquement `{ characterId, name, sex, x, y, direction }` — **pas de worldX/Y**.  
Les gateways `AnimalsGateway` et `ResourcesGateway` accèdent à `player.x/y` (pixels) pour les calculs de portée.

---

## 2. Utilisation de worldX/worldY dans le backend

### Lecture

| Fichier | Appel | Source |
|---|---|---|
| `world.service.ts:joinPlayer()` | `readWorldPosition(character, legacyGetter)` | DB character (WU ou pixel fallback) |
| `world.service.ts:respawnCharacter()` | `readWorldPosition(character, ...)` + `readWorldPosition(p, ...)` | DB character + respawn_point |

### Écriture en mémoire

| Fichier | Méthode | Mise à jour |
|---|---|---|
| `world.service.ts` | `joinPlayer()` | `player.worldX/Y/mapId` ← depuis DB |
| `world.service.ts` | `updatePlayer()` | `player.worldX/Y` ← `isoScreenToWorldWU(payload.x, y)` |
| `world.service.ts` | `respawnCharacter()` | `player.worldX/Y/mapId` ← point calculé |
| `world.service.ts` | `teleportCharacter()` | `player.worldX/Y` ← `isoScreenToWorldWU(rx, ry)` |

### Écriture en DB (double-écriture)

| Méthode | positionX/Y | worldX/Y/mapId |
|---|---|---|
| `persistPlayerPosition()` | ✅ | ✅ |
| `respawnCharacter()` | ✅ | ✅ |
| `teleportCharacter()` | ✅ | ❌ **manquant** |

`teleportCharacter()` (ligne 378) écrit seulement `{ positionX: rx, positionY: ry }` — les colonnes WU ne sont pas persistées.  
La mémoire reste cohérente mais la DB diverge jusqu'au prochain `persistPlayerPosition()` (déconnexion).

### Calculs utilisant les WU

- `chebyshevDistanceWU(charWU, pWU)` — sélection du point de respawn le plus proche (`world.service.ts:107`)
- `wuToIsoScreenX/Y(worldX, worldY)` — position Phaser dérivée depuis WU (`world.service.ts:127-128`)
- `isoScreenToWorldWU(px, py)` — inverse : pixels → WU (`updatePlayer`, `teleportCharacter`, `persistPlayerPosition` fallback)

---

## 3. Calculs gameplay encore en pixels

### `animals.service.ts` — entièrement non migré

| Calcul | Lignes | Type | Unité |
|---|---|---|---|
| Aggro range check | 34 | `Math.hypot(p.x − animal.x, p.y − animal.y) ≤ aggroRadius` | pixels |
| Patrol movement | 211-224 | `animal.x += dirX * speed * dt`, clamp `patrolRadius` | pixels |
| Pursuit movement | 247-262 | `dx = target.x − animal.x`, `Math.hypot`, clamp `MELEE_RANGE` | pixels |
| Escape movement | 302-321 | `dx = animal.x − nearest.player.x`, clamp `patrolRadius * mult` | pixels |
| Leash check | 251 | `Math.hypot(animal.x − spawnX, animal.y − spawnY) > patrolRadius * LEASH_MULTIPLIER` | pixels |
| Attack range | 375-379 | `Math.hypot(animal.x − attackerPosition.x, ...)` | pixels |
| Riposte range | 397 | `distance ≤ MELEE_RANGE` | pixels |
| Respawn reset | 337-338 | `animal.x = spawn.spawnX` | pixels |
| Spawn init | 124-125 | `a.x = spawn.spawnX` | pixels |

Constantes pixel dans `creatures-template.entity.ts` : `patrolRadius`, `aggroRadius`.  
Constantes hardcodées dans `animals.service.ts` : `MELEE_RANGE = 60`, `RANGED_RANGE_DEFAULT`.  
Seeds dans `animals.service.ts` : `patrolRadius: 200`, `aggroRadius: 50/120`.

### `resources.gateway.ts` — interaction range non migrée

- `RESOURCE_INTERACT_RANGE = 100` (pixels, ligne 25)
- `Math.hypot(target.x − player.x, target.y − player.y)` — utilise `player.x/y` du cache pixel (ligne 248)
- Vérification anti-cheat distance joueur/ressource : **pas encore en WU**

### `world.service.ts:respawnCharacter()` — drift partiellement en pixels

- Base position : calculée en WU ✅
- Drift aléatoire : `Math.random() * nearest.radius` — `radius` est en pixels (colonne non migrée)

---

## 4. Événements WebSocket — x/y : rendu vs autorité

### Pixel uniquement (rendu client, acceptable à court terme)

| Événement | Direction | Payload x/y | Autorité |
|---|---|---|---|
| `world_joined` | S→C | `ConnectedPlayer` (x/y + worldX/Y/mapId) | Rendu + info |
| `player_joined` | S→C | `ConnectedPlayer` | Rendu uniquement |
| `player_moved` | S→C | `ConnectedPlayer` | Rendu uniquement |
| `current_players` | S→C | `ConnectedPlayer[]` | Rendu uniquement |
| `character_respawn` | S→C | `{ x, y, health, maxHealth }` | Rendu uniquement |
| `character_teleport` | S→C | `{ x, y }` | Rendu uniquement |
| `animal_update` | S→C | `AnimalDto { x, y, health, ... }` | Rendu uniquement |
| `resource_update` | S→C | `{ id, x, y, state, ... }` | Rendu uniquement |

### Client→Serveur (authoritative sur le serveur)

| Événement | Payload | Traitement serveur |
|---|---|---|
| `player_move` | `{ x, y, direction }` | Converti en WU via `isoScreenToWorldWU()` dans `updatePlayer()` |
| `attack_animal` | `{ targetId }` | `player.x/y` extrait de `client.data.player` pour le range check |
| `gather_start` | `{ targetId }` | `player.x/y` extrait pour le range check |

### Événements sans coordonnées — déjà propres

`gather_tick`, `resource_loot`, `gather_stopped`, `player_left`, `animal_hit`, `character_damaged`.

---

## 5. Fichiers frontend encore en pixels

| Fichier | Usage | Migrable sans changement protocole ? |
|---|---|---|
| `WorldScene.js` | `player.setPosition(player.x, player.y)` — positionnement Phaser | Non — dépend du protocole x/y |
| `WorldScene.js` | `animal.x/y` → `sprite.setPosition` | Non — dépend du DTO |
| `WorldScene.js` | `resource.x/y` → `sprite.setPosition` | Non — dépend du DTO |
| `WorldScene.js` | `data.x/y` pour `character_respawn` et `character_teleport` | Non — dépend des payloads |
| `WorldScene.js` | Emission `player_move` avec `{ x: player.x, y: player.y }` | Bloquant — à migrer vers worldX/Y |
| `PlayerController.js` | Pathfinding via `player.x/y`, grille tile 32px | Non applicable (Phaser natif) |
| `CoordinatesLayer.jsx` | Affiche `player.x`, `player.y` en pixels bruts | Optionnel — afficher tileX/Y |

Le frontend est **entièrement non migré** : toute la couche de rendu repose légitimement sur les pixels Phaser. La migration frontend dépend du changement de protocole `player_move` (étape 8 ci-dessous).

---

## 6. Dette technique classée

### CRITIQUE

**C1. `teleportCharacter()` — double-écriture DB manquante**  
`world.service.ts:378` écrit `{ positionX, positionY }` uniquement.  
`worldX/Y/mapId` sont à jour en mémoire mais pas en DB.  
Si le serveur redémarre avant une déconnexion, la position WU du joueur téléporté est perdue.  
Correction : ajouter `worldX, worldY, mapId` au `characterRepository.update()`.

**C2. `animals.service.ts` — boucle IA entièrement en pixels**  
L'ensemble du système combat/AI (60+ lignes, ~8 fonctions) utilise des pixels.  
Les constantes `aggroRadius`, `patrolRadius`, `MELEE_RANGE` sont des pixels.  
Tant que les animaux sont en pixels, les coordonnées WU des animaux ne peuvent être vérifiées.

**C3. `resources.gateway.ts` — anti-cheat range en pixels**  
`RESOURCE_INTERACT_RANGE = 100` pixels. C'est la barrière anti-triche du gathering.  
Utilise `player.x/y` (cache pixel) — risque d'imprécision après migration protocole.

**C4. Anomalies OUT_OF_MAP_BOUNDS bloquent le backfill**  
Le dry-run détecte des entités avec pixel(140, 365) → WU(-1040, 12720) (worldX < 0).  
`wu-backfill-real.ts` s'arrête sur toute anomalie — le backfill réel ne peut pas encore tourner.

### IMPORTANT

**I1. Animaux — worldX/Y jamais écrits au runtime**  
`animals.service.ts` met à jour `animal.x/y` en mémoire mais ne persiste jamais `worldX/Y/mapId`.  
La colonne DB reste NULL jusqu'au backfill initial. Après, elle dérive dès le premier mouvement.

**I2. `client.data.player` sans worldX/Y**  
Les gateways `AnimalsGateway` et `ResourcesGateway` accèdent aux coordonnées joueur via `client.data.player.x/y`.  
Ces pixels peuvent diverger de la vérité serveur `ConnectedPlayer.worldX/Y`.  
Conséquence : le range check d'attaque (`animals.gateway.ts:62`) utilise le cache pixel, pas les WU.

**I3. `creature_spawn.worldX/Y` — colonnes présentes, jamais lues**  
La colonne WU existe mais aucun chemin runtime ne la lit ni ne l'écrit.  
Les spawns restent en `spawnX/Y` (pixels) pour toute la logique IA.

**I4. `RespawnPoint.radius` en pixels**  
La colonne `radius` n'a pas d'équivalent WU. Le drift de respawn est calculé en pixels.  
`legacyRadiusToWU()` existe dans `legacy-pixel-position.adapter.ts` (ligne 44).

### OPTIONNEL

**O1. `CoordinatesLayer.jsx` affiche des pixels Phaser**  
Affiche `player.x`, `player.y` bruts. Peu utile pour le debug une fois en WU.  
À remplacer par `(worldX >> TILE_SHIFT)`, `(worldY >> TILE_SHIFT)` quand le protocole change.

**O2. `character_teleport` payload pixels**  
`{ x, y }` en pixels — acceptable car usage admin uniquement et le client repositionne via `setPosition()`.

---

## 7. Checklist de migration — ordre recommandé

### Phase immédiate (avant backfill)

- [ ] **Corriger les anomalies OUT_OF_MAP_BOUNDS** : identifier et repositionner les entités avec pixel(140, 365) ou autres coords hors map. Relancer `npm run wu:dry-run` pour vérifier zéro anomalie.
- [ ] **Fix `teleportCharacter()` double-écriture** (`world.service.ts:378`) : ajouter `worldX`, `worldY`, `mapId` au `characterRepository.update()`. *(~3 lignes)*

### Phase backfill

- [ ] **Exécuter `npm run wu:backfill`** une fois zéro anomalie détectée.
- [ ] **Vérifier le rapport post-backfill** : toutes les entités doivent être à `toBackfill=0`.

### Phase gameplay serveur

- [ ] **Migrer `animals.service.ts`** : remplacer `Math.hypot` + pixels par `chebyshevDistanceWU` + WU. Convertir `patrolRadius`, `aggroRadius`, `MELEE_RANGE` en WU (ou introduire des constantes WU parallèles). Mettre à jour les seeds. *(bloc le plus large)*
- [ ] **Double-écriture animaux** : dans `animals.service.ts`, écrire `worldX/Y/mapId` lors de chaque `animalRepository.update()` (mouvements, respawn, spawn).
- [ ] **Migrer `resources.gateway.ts`** : remplacer `RESOURCE_INTERACT_RANGE` + `Math.hypot` par `chebyshevDistanceWU` en WU. Lire `player.worldX/Y` depuis `ConnectedPlayer` via le service.
- [ ] **Migrer `RespawnPoint.radius`** : ajouter colonne `radiusWU` ou appliquer `legacyRadiusToWU()` à la lecture.

### Phase protocole

- [ ] **Exposer `worldX/Y/mapId` dans `client.data.player`** : nécessaire pour que `AnimalsGateway` et `ResourcesGateway` lisent la vérité serveur WU.
- [ ] **Migrer `player_move` client→serveur** vers `{ worldX, worldY, direction }`. Coordonner frontend (`WorldScene.js:480`) et backend (`world.gateway.ts`, `updatePlayer()`).
- [ ] **Migrer les payloads S→C** : `animal_update`, `character_respawn`, `character_teleport` — ajouter `worldX/Y` optionnels sans supprimer `x/y` (compatibilité).

### Phase frontend

- [ ] **`WorldScene.js`** : lire `worldX/Y` du payload `player_moved`, convertir en pixels via projection isométrique côté client.
- [ ] **`CoordinatesLayer.jsx`** : afficher les coordonnées tile `(worldX >> 10)` au lieu des pixels Phaser.

---

## Estimations de migration

| Domaine | État | % migré |
|---|---|---|
| Backend — world.service | joinPlayer, updatePlayer, persist, respawn ✅ ; teleport ❌ DB | ~85% |
| Backend — animals.service | Entièrement en pixels | ~0% |
| Backend — resources.gateway | Range check en pixels | ~0% |
| DB — colonnes WU | Toutes présentes (5/5 entités) | 100% |
| DB — backfill | Scripts prêts, anomalies bloquantes | ~0% (non exécuté) |
| Double-écriture runtime | character ✅ ; teleport ❌ ; animaux ❌ | ~40% |
| Gameplay calculs | Respawn ✅ ; combat ❌ ; gathering ❌ | ~15% |
| Protocole WebSocket | player_move encore en pixels | ~0% |
| Frontend | Non démarré | ~0% |
| **Global estimé** | | **~25–30%** |

---

_Prochain audit recommandé : après exécution du backfill et migration de `animals.service.ts`._
