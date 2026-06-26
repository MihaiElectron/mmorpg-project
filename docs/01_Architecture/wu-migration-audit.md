# Audit de migration WU — état du dépôt

_Rédigé le 2026-06-21 (commit `f5aae0b`). Mis à jour 2026-06-22 : C1 et C4 soldés, backfill exécuté. Mis à jour 2026-06-24 : C2, C3, I1, protocole WebSocket P0–P6 soldés. Mis à jour 2026-06-26 : **P7-A à P7-D soldés — migration entièrement terminée**._  
_Audit lecture seule — aucune modification de code ou de DB._

> **✅ MIGRATION WU ENTIÈREMENT TERMINÉE (2026-06-26).**  
> Source de vérité unique : `worldX / worldY / mapId` pour toutes les entités en DB et en protocole.  
> Colonnes legacy DB supprimées. Pixel cache `x/y` dans `ConnectedPlayer` uniquement pour le rendu Phaser.  
> Dettes résiduelles intentionnelles : `RespawnPoint.radius` en pixels ; templates IA (`aggroRadius`, `patrolRadius`, `speedMin/Max`) en pixels.

---

## 1. Sources de vérité — où vivent les coordonnées

### Entités TypeORM (DB)

| Entité | Colonnes legacy (supprimées P7-D) | Colonnes WU (seule vérité) | Note |
|---|---|---|---|
| `character` | ~~`positionX`, `positionY`~~ | `worldX`, `worldY`, `mapId` | ✅ Legacy supprimées — WU seule source |
| `creature` | ~~`x`, `y`~~ | `worldX`, `worldY`, `mapId` | ✅ WU écrits au runtime, legacy supprimées |
| `resource` | ~~`x`, `y`~~ | `worldX`, `worldY`, `mapId` | ✅ WU via `buildResourceBroadcast`, legacy supprimées |
| `creature_spawn` | ~~`spawnX`, `spawnY`~~ | `worldX`, `worldY`, `mapId` | ✅ WU via backfill, legacy supprimées |
| `respawn_point` | ~~`x`, `y`~~ | `worldX`, `worldY`, `mapId`, `radius` | ✅ WU source ; `radius` en pixels (dette mineure intentionnelle) |

### État en mémoire — `ConnectedPlayer`

```
worldX, worldY, mapId  ← vérité serveur WU (mis à jour à chaque player_move reçu)
x, y                   ← cache pixel Phaser dérivé de WU (rendu frontend uniquement, jamais persisté)
```

`x/y` pixel cache dans `ConnectedPlayer` : présents en mémoire pour que le serveur puisse
les inclure dans les broadcasts de rendu (`world_joined`, `player_moved`, etc.). Non utilisés
pour la logique métier. Calculés via `wuToIsoScreenX/Y()` à chaque mise à jour WU.

### `client.data.player` (partagé entre gateways)

✅ `worldX/Y/mapId` seule source de vérité pour la logique métier.  
`CreaturesGateway` et `ResourcesGateway` utilisent `player.worldX/Y` pour les range checks.  
`player.x/y` = cache pixel mémoire uniquement (non persisté, non autoritaire).

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

### Écriture en DB (WU uniquement — colonnes legacy supprimées P7-D)

| Méthode | worldX/Y/mapId |
|---|---|
| `persistPlayerPosition()` | ✅ |
| `respawnCharacter()` | ✅ |
| `teleportCharacter()` | ✅ |

### Calculs utilisant les WU

- `chebyshevDistanceWU(charWU, pWU)` — sélection du point de respawn le plus proche (`world.service.ts:107`)
- `wuToIsoScreenX/Y(worldX, worldY)` — pixel cache dérivé depuis WU (`world.service.ts`, `creatures.service.ts`, `admin.service.ts`)
- ~~`isoScreenToWorldWU(px, py)`~~ — supprimé de `updatePlayer` (P5). Plus utilisé côté serveur.

---

## 3. Calculs gameplay — état actuel

### ~~`creatures.service.ts` — entièrement non migré~~  — ✅ SOLDÉ (session 3)

Boucle IA (patrol, fighting, escaping) WU-authoritative. `aggroRadius`, `patrolRadius`, `MELEE_RANGE` en WU. Pixel cache dérivé de WU à chaque tick.

### ~~`resources.gateway.ts` — interaction range non migrée~~  — ✅ SOLDÉ (session 3)

`RESOURCE_INTERACT_RANGE` migré en WU. `Math.hypot` utilise `player.worldX/Y`.

### `world.service.ts:respawnCharacter()` — drift partiellement en pixels

- Base position : calculée en WU ✅
- Drift aléatoire : `Math.random() * nearest.radius` — `radius` est en pixels (colonne non migrée) — dette mineur connue

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
| `creature_update` | S→C | `CreatureDto { x, y, health, ... }` | Rendu uniquement |
| `resource_update` | S→C | `{ id, x, y, state, ... }` | Rendu uniquement |

### Client→Serveur (authoritative sur le serveur)

| Événement | Payload | Traitement serveur |
|---|---|---|
| `player_move` | `{ worldX, worldY, mapId, direction }` ✅ P5 | `updatePlayer()` — WU direct, pixel cache dérivé |
| `attack_creature` | `{ targetId }` | `player.worldX/Y` depuis `ConnectedPlayer` pour le range check ✅ |
| `gather_start` | `{ targetId }` | `player.worldX/Y` pour le range check ✅ |

### Événements sans coordonnées — déjà propres

`gather_tick`, `resource_loot`, `gather_stopped`, `player_left`, `creature_hit`, `character_damaged`.

---

## 5. État frontend — migration P2–P3 soldée

| Fichier | Usage | État |
|---|---|---|
| `WorldScene.js` | `resolveScreen()` pour joueurs, animaux, ressources | ✅ WU-first (P2–P3) |
| `WorldScene.js` | `character_respawn` + `character_teleport` | ✅ WU pur (P4–P4.5) |
| `WorldScene.js` | Emission `player_move` | ✅ WU-only `{ worldX, worldY, mapId }` (P5) |
| `WorldScene.js` | pixel cache `player.x/y` | Maintenu localement pour Phaser sprite position |
| `adminPanel.shared.tsx` | Drag-to-map, boutons Tp | ✅ WU via `toWorldWU()` (P6) |
| `PlayerController.js` | Pathfinding NavGrid | Phaser natif — coordonnées nav cell (non WU) |
| `CoordinatesLayer.jsx` | Affiche `player.x`, `player.y` en pixels bruts | Optionnel — afficher tileX/Y |

Le frontend utilise les pixels Phaser pour le rendu — ce qui est la couche légitime. Les payloads reçus du serveur exposent `worldX/worldY/mapId`. `resolveScreen()` WU-first est en place. La projection isométrique est effectuée par le client uniquement pour positionner les sprites.

---

## 6. Dette technique classée

### CRITIQUE

~~**C1. `teleportCharacter()` — double-écriture DB manquante**~~ — **SOLDÉ** (commit `b751bad`). `worldX/Y/mapId` sont désormais persistés sur téléportation.

~~**C2. `creatures.service.ts` — boucle IA entièrement en pixels**~~ — **SOLDÉ** (session 3). Boucle IA WU-authoritative, `findNearestPlayer` WU + filtre mapId, `attack()` en WU.

~~**C3. `resources.gateway.ts` — anti-cheat range en pixels**~~ — **SOLDÉ** (session 3). `RESOURCE_INTERACT_RANGE` migré en WU.

~~**C4. Anomalies OUT_OF_MAP_BOUNDS bloquent le backfill**~~ — **SOLDÉ**. Entités repositionnées, backfill exécuté avec succès. `wu:dry-run` retourne 0 anomalie / 0 entité à backfiller.

### IMPORTANT

~~**I1. Animaux — worldX/Y jamais écrits au runtime**~~ — **SOLDÉ** (session 3). `creatures.service.ts` écrit `worldX/Y/mapId` à chaque mouvement. Pixel cache dérivé de WU.

~~**I2. `client.data.player` sans worldX/Y**~~ — **SOLDÉ** (session 3). `client.data.player` = `ConnectedPlayer` avec `worldX/Y/mapId`. Les range checks utilisent WU.

~~**I3. `creature_spawn.worldX/Y` — colonnes présentes, jamais lues**~~ — **SOLDÉ** (P7-D).
`spawnX/Y` legacy supprimées. `worldX/worldY/mapId` sont la seule source en DB.
La logique IA lit `spawn.worldX/worldY` depuis `CreatureSpawn`.

**I4. `RespawnPoint.radius` en pixels** — **dette intentionnelle persistante**  
La colonne `radius` n'a pas d'équivalent WU. Le drift aléatoire de respawn est calculé
en pixels. `legacyRadiusToWU()` existe dans `legacy-pixel-position.adapter.ts`.
Faible criticité gameplay — migration future si besoin.

**I5. Templates IA en pixels** — **dette intentionnelle persistante**  
`aggroRadius`, `patrolRadius`, `speedMin/Max` dans `CreatureTemplate` stockés en pixels.
`legacyRadiusToWU()` convertit à la volée dans `creatures.service.ts`.
Migration vers colonnes WU natives : future décision, nécessite une migration DB.

### OPTIONNEL

**O1. `CoordinatesLayer.jsx` affiche des pixels Phaser**  
Affiche `player.x`, `player.y` bruts. Peu utile pour le debug une fois en WU.  
À remplacer par `(worldX >> TILE_SHIFT)`, `(worldY >> TILE_SHIFT)` quand le protocole change.

~~**O2. `character_teleport` payload pixels**~~ — **SOLDÉ** (P4.5 + P6). Payload `{ worldX, worldY, chunkX, chunkY, characterId }` WU pur. Protocole admin WU pur (P6).

---

## 7. Checklist de migration — ordre recommandé

### Phase immédiate (avant backfill) — COMPLÈTE

- [x] **Corriger les anomalies OUT_OF_MAP_BOUNDS** : entités repositionnées. `wu:dry-run` retourne 0 anomalie.
- [x] **Fix `teleportCharacter()` double-écriture** : `worldX`, `worldY`, `mapId` ajoutés au `characterRepository.update()` (commit `b751bad`).

### Phase backfill — COMPLÈTE

- [x] **Exécuter `npm run wu:backfill`** : exécuté avec succès.
- [x] **Vérifier le rapport post-backfill** : `toBackfill=0` pour toutes les entités.

### Phase gameplay serveur — COMPLÈTE

- [x] **Migrer `creatures.service.ts`** : boucle IA WU-authoritative (session 3).
- [x] **Double-écriture animaux** : `creatures.service.ts` écrit `worldX/Y/mapId` (session 3).
- [x] **Migrer `resources.gateway.ts`** : `RESOURCE_INTERACT_RANGE` WU (session 3).
- [ ] **Migrer `RespawnPoint.radius`** : colonne `radiusWU` ou `legacyRadiusToWU()` à la lecture. *(reste)*

### Phase protocole — COMPLÈTE (P0–P6)

- [x] **Exposer `worldX/Y/mapId` dans `client.data.player`** : résolu via `ConnectedPlayer`.
- [x] **Migrer `player_move` client→serveur** vers WU (P5).
- [x] **Migrer payloads S→C** : `character_respawn`, `character_teleport` WU pur (P4–P4.5).
- [x] **Migrer protocole admin** : 6 événements admin en WU (P6).

### Phase frontend — COMPLÈTE (P2–P3)

- [x] **`WorldScene.js`** : `resolveScreen()` WU-first pour joueurs, animaux, ressources.

### Phase P7 — COMPLÈTE (2026-06-26)

- [x] **Drop colonnes legacy DB** : `character.positionX/Y`, `creature.x/y`, `resource.x/y`,
  `creature_spawn.spawnX/Y`, `respawn_point.x/y` supprimées des entités TypeORM.
- [x] **Migration TypeORM** : `1782432000000-DropLegacyPixelColumns.ts` créée (prod-safe, `IF EXISTS`, `down()` restauratrice).
- [x] **Backfill scripts** : `wu-backfill-dry-run.ts` et `wu-backfill-real.ts` supprimés (tâche one-time terminée).
- [x] **`world-position.adapter.ts`** : réduit à `WUPositionRecord` (interface minimale), fonctions de conversion supprimées.
- [x] **Specs** : 6 fichiers mis à jour pour retirer fixtures x/y/spawnX/Y.

---

## Estimations de migration (2026-06-26 — FINALE)

| Domaine | État | % migré |
|---|---|---|
| Backend — world.service | joinPlayer, updatePlayer, persist, respawn, teleport ✅ | 100% |
| Backend — creatures.service | Boucle IA WU, double-écriture ✅ | 100% |
| Backend — resources.gateway | Range check WU, MOVE_TOLERANCE_WU ✅ | 100% |
| Backend — admin.gateway/service | Protocole admin WU (P6) ✅ | 100% |
| DB — colonnes WU | Toutes présentes (5/5 entités) | 100% |
| DB — backfill | Exécuté avec succès (0 anomalie) | 100% |
| DB — colonnes legacy supprimées | P7-D ✅ | 100% |
| Gameplay calculs | Respawn ✅ ; combat ✅ ; gathering ✅ | 100% |
| Protocole WebSocket | P0–P7 soldés ✅ | 100% |
| Frontend | resolveScreen() WU-first ✅ | 100% |
| **Global** | | **100%** |

Dettes résiduelles intentionnelles (hors scope migration WU) :
- `RespawnPoint.radius` en pixels (I4 — faible criticité)
- Templates IA (`aggroRadius`, `patrolRadius`, `speedMin/Max`) en pixels (I5 — future migration DB)

---

_Migration WU complète. Cet audit est désormais un document historique._
