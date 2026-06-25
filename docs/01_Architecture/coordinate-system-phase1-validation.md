# Validation — Phase 1 de la migration WU

_Date de validation initiale : 2026-06-22 (commit `9bdd4b3`)_  
_Mise à jour de clôture : 2026-06-22 (backfill exécuté, ADR-0001 accepté)_  
_Branche : main_

---

## 1. Documentation

### ADRs

| ADR | Statut déclaré | Unité logique | Noms canoniques |
|---|---|---|---|
| ADR-0001 | **Accepted** (2026-06-22) | `1 WU = 1/1024 tile` — décidé | `worldX / worldY` (WU) |
| ADR-0002 | Draft / Proposed | WU (cohérent ADR-0001) | `worldX / worldY` (WU) |
| ADR-0003 | Draft / Proposed | WU (cohérent ADR-0001) | `worldX / worldY` (WU) |

ADR-0001 est **accepté** : le système de coordonnées WU est implémenté, testé
(65 tests `world-coordinates.ts`) et validé par le backfill. ADR-0002 et ADR-0003
restent `Proposed` car leurs décisions (WebSocket payload `{ worldX, worldY }`,
validation distance gate) ne sont pas encore implémentées.

### Résolution de fait

Le code implémenté tranche la question ouverte de l'unité sans attendre l'approbation
formelle des ADRs :

- `TILE_SIZE_WU = 1024` (`world-coordinates.ts:4`)
- `WORLD_ORIGIN_X_PX = 1000` (`world-coordinates.ts:31`)
- Projection : `screenX = 1000 + (worldX − worldY) / 16`
- Inverse : `worldX = 8*(sx−1000) + 16*sy`

L'unité logique de fait est **1 WU = 1/1024 tile**. Les colonnes DB et la structure
`ConnectedPlayer` utilisent `worldX / worldY` (pas `worldTileX / worldTileY`).

### État documentaire

Les ADRs sont des **propositions non ratifiées** ; ils décrivent une intention, pas
l'implémentation courante. Aucune contradiction documentaire ne bloque le code existant
tant que l'implémentation reste cohérente avec elle-même.

---

## 2. Infrastructure

### Modules créés

| Fichier | Contenu | Tests |
|---|---|---|
| `src/common/world-coordinates.ts` | Constantes, projections iso, métriques distance, bit-ops tile/WU | 65 |
| `src/common/legacy-pixel-position.adapter.ts` | `pixelToWUWithMap`, `legacyRadiusToWU` | 18 |
| `src/common/world-position.adapter.ts` | `readWorldPosition`, `hasCompleteWorldPosition`, `hasPartialWorldPosition` | 32 |
| `src/common/wu-backfill-report.ts` | Rapport dry-run, 6 anomalies : MISSING_PIXEL_COORDS, NON_FINITE_PIXEL, PARTIAL_WU_FILL, MAPID_MISSING_FOR_WU, OUT_OF_INT32, OUT_OF_MAP_BOUNDS | 36 |
| `src/world/world.service.spec.ts` | Tests `updatePlayer` (WU-first, NaN/Infinity, cohérence projection) | 16 |
| `tools/scripts/wu-backfill-dry-run.ts` | Audit lecture seule, 10 entités TypeORM chargées | — |
| `tools/scripts/wu-backfill-real.ts` | Backfill idempotent, arrêt sur anomalie | — |

**Total tests WU : 167 / suite globale 198/199** (1 échec préexistant sans lien WU :
`auth.controller.spec.ts` — DI NestJS manquant dans le module de test).

### Constantes validées

```
TILE_SIZE_WU   = 1024   (2^10, TILE_SHIFT = 10)
CHUNK_SIZE_WU  = 65536  (64 tiles × 1024 WU)
DEFAULT_MAP_ID = 1
WORLD_ORIGIN_X_PX = 1000
WORLD_ORIGIN_Y_PX = 0
WU_PER_PX_X = 16        (TILE_SIZE_WU / 64)
WU_PER_PX_Y = 32        (TILE_SIZE_WU / 32)
```

Formules vérifiées par tests unitaires avec vecteurs de référence :
`pixel(400, 300) → WU(0, 9600)`, `pixel(600, 300) → WU(1600, 8000)`,
`pixel(600, 580) → WU(6080, 12480)`.

---

## 3. Base de données

### Colonnes WU

| Entité | Table | Colonnes legacy | Colonnes WU ajoutées |
|---|---|---|---|
| `character` | `character` | `positionX`, `positionY` | `worldX`, `worldY`, `mapId` (nullable int) |
| `creature` | `creatures` | `x`, `y` | `worldX`, `worldY`, `mapId` (nullable int) |
| `resource` | `resources` | `x`, `y` | `worldX`, `worldY`, `mapId` (nullable int) |
| `creature_spawn` | `creature_spawn` | `spawnX`, `spawnY` | `worldX`, `worldY`, `mapId` (nullable int) |
| `respawn_point` | `respawn_point` | `x`, `y` | `worldX`, `worldY`, `mapId` (nullable int) |

Toutes les colonnes legacy sont conservées (migration additive, aucune suppression).

### Backfill

| État | Détail |
|---|---|
| Scripts prêts | `npm run wu:dry-run` / `npm run wu:backfill` |
| Dry-run post-backfill | **0 anomalie / 0 entité à backfiller** |
| Backfill réel | **Exécuté avec succès** — toutes les entités backfillées |

Toutes les colonnes WU en DB sont renseignées. Le fallback legacy de `readWorldPosition()`
reste actif comme filet de sécurité (par exemple si une entité est ajoutée sans WU).

### Double-écriture active

| Méthode | positionX/Y | worldX/Y/mapId |
|---|---|---|
| `persistPlayerPosition()` | ✅ | ✅ (fallback défensif si NaN) |
| `respawnCharacter()` | ✅ | ✅ |
| `teleportCharacter()` | ✅ | ✅ (conditionnel : si conversion réussit) |
| `joinPlayer()` | — lecture seule | — lecture seule |
| `updatePlayer()` | — mémoire seulement | — mémoire seulement |

La double-écriture assure qu'une fois un joueur actif, ses colonnes WU sont renseignées
en DB même sans backfill préalable.

---

## 4. Cycle de vie joueur

### Login — `joinPlayer()`

1. Cherche un `previousSocketId` pour le même `characterId` → persiste et supprime l'ancienne session.
2. Charge `character` depuis DB.
3. `readWorldPosition(character, legacyGetter)` :
   - Si `worldX/Y/mapId` non NULL → retourne les WU directement.
   - Si NULL → convertit `positionX/Y` en WU via `isoScreenToWorldWU`.
   - Si échec → `worldX=0, worldY=0, mapId=1`, `x/y` depuis `positionX/Y` ou payload.
4. Construit `ConnectedPlayer` avec `worldX/Y/mapId` requis.

**Vérité WU présente dès la connexion, avec ou sans backfill.**

### Déplacement — `updatePlayer()` via `player_move`

1. Guard : `Number.isFinite(payload.x) && Number.isFinite(payload.y)` — si faux, position conservée.
2. `isoScreenToWorldWU(payload.x, payload.y)` → `wu`.
3. Si succès : `player.worldX = wu.worldX`, `player.worldY = wu.worldY` **avant** `player.x = payload.x`.
4. Si échec (try/catch) : rien n'est muté, ancienne position conservée.
5. `client.data.player` reçoit `{ x, y }` pour le broadcast WebSocket (protocole inchangé).

**worldX/worldY sont mis à jour en premier. x/y ne sont mis à jour que si la conversion WU réussit.**

### Téléportation — `teleportCharacter()`

1. Convertit `(x, y)` → WU via `isoScreenToWorldWU`.
2. Mise à jour mémoire : `player.worldX/Y` si conversion valide.
3. DB : `characterRepository.update({ positionX, positionY, worldX, worldY, mapId })` — conditionnel sur `Number.isFinite`.
4. Émet `character_teleport { x, y }` au joueur, `player_moved` aux autres.

**Double-écriture DB active. Divergence mémoire/DB impossible.**

### Respawn — `respawnCharacter()`

1. Lit la position WU du personnage via `readWorldPosition` (fallback legacy).
2. Pour chaque `RespawnPoint` : lit la position WU via `readWorldPosition`, filtre par `mapId`.
3. Sélectionne le point le plus proche via `chebyshevDistanceWU`.
4. Calcule la position finale en pixels (base WU → pixels via `wuToIsoScreenX/Y` + drift aléatoire).
5. Reconvertit en WU (`isoScreenToWorldWU`).
6. DB : double-écriture `positionX/Y + worldX/Y/mapId`.
7. Mise à jour mémoire `player.worldX/Y/mapId`.

**Sélection du point de respawn en WU. Persistance double-écriture.**

### Persistance — `persistPlayerPosition()`

Appelée à la déconnexion (`handleDisconnect`).

1. Lit `player.worldX/Y/mapId` (vérité serveur).
2. Fallback défensif si NaN : recalcule depuis `player.x/y`.
3. DB : `positionX/Y + worldX/Y/mapId`.

**Assure que toute session active laisse des colonnes WU renseignées en DB.**

### Reconnexion

`joinPlayer()` détecte `previousSocketId` via `findSocketIdByCharacterId()` :
- Persiste la session précédente (`persistPlayerPosition`).
- Supprime l'entrée du socket précédent.
- Relit la position depuis DB (qui contient les WU de la session précédente).

**Continuité WU garantie entre sessions.**

---

## 5. Source de vérité

### Serveur runtime

**`ConnectedPlayer.worldX / worldY / mapId`** est officiellement la vérité serveur.

- Type : `number` requis (non nullable dans le type TypeScript).
- Initialisé dès `joinPlayer()`, maintenu par `updatePlayer()`, `teleportCharacter()`, `respawnCharacter()`.
- `ConnectedPlayer.x / y` = cache de rendu Phaser, valide uniquement pour les broadcasts WebSocket.

### Base de données

**`character.worldX / worldY / mapId`** — colonnes WU, double-écriture active sur tous les événements persistants.

Pour les entités non joueurs (creature, resource, creature_spawn, respawn_point), les colonnes WU existent mais ne sont pas maintenues au runtime. La source de vérité de ces entités reste leurs colonnes legacy (`x/y`, `spawnX/Y`, `positionX/Y`).

### Protocole WebSocket

Les payloads émis par le serveur contiennent encore `x / y` en pixels Phaser. `world_joined` et `player_moved` émettent le `ConnectedPlayer` entier (qui inclut `worldX/Y/mapId` comme champs additionnels non documentés dans le protocole).  
`player_move` client → serveur envoie encore `{ x, y }`, converti en WU par le serveur à réception.

---

## 6. Dette restante

### Gameplay et IA

| Domaine | Dette | Impact |
|---|---|---|
| `creatures.service.ts` | Toute la boucle IA en pixels : aggro, patrol, pursuit, escape, leash. `MELEE_RANGE=60`, `patrolRadius`, `aggroRadius` en pixels. | Portée visuelle asymétrique en isométrique |
| `resources.gateway.ts` | `RESOURCE_INTERACT_RANGE=100` pixels + `Math.hypot` — anti-cheat range check | Précision dégradée en isométrique |
| `client.data.player` | Pas de `worldX/Y` — `CreaturesGateway` et `ResourcesGateway` utilisent `player.x/y` pour les range checks | Décalage possible entre vérité WU et check pixels |

### Entités non joueurs

| Entité | Dette |
|---|---|
| `creature` | `worldX/Y` jamais écrits au runtime (mouvements, respawn) |
| `resource` | `worldX/Y` jamais écrits au runtime |
| `creature_spawn` | `worldX/Y` jamais lus ni écrits au runtime |
| `respawn_point` | `radius` en pixels (pas de `radiusWU`) |

### Frontend

- `WorldScene.js` : positionnement Phaser entièrement en pixels.
- `PlayerController.js` : pathfinding sur grille tile pixels.
- `CoordinatesLayer.jsx` : affiche `player.x/y` bruts.
- Protocole `player_move` : client envoie `{ x, y }`, pas `{ worldX, worldY }`.

### Suppression des colonnes legacy

Aucune colonne legacy supprimée. Phase différée après stabilisation complète et validation humaine de l'unité WU.

### Documentation

ADR-0001 est `Accepted`. ADR-0002 et ADR-0003 restent `Proposed` (décisions non encore implémentées). Le nommage `worldTileX/Y` dans les documents de référence non-ADR (glossaire, ROADMAP, `movement-authority-audit.md`) est mis à jour en session de clôture Phase 1.

---

## 7. Critères de sortie

### La Phase 1 est-elle terminée ?

**Oui.**

La Phase 1 couvre : module central de coordonnées, adapters, backfill scripts, migration runtime des joueurs (`ConnectedPlayer` WU-first, cycle de vie complet). Tout cela est en place, compilé, testé. Le backfill DB a été exécuté avec succès (0 anomalie / 0 entité à backfiller). ADR-0001 accepté.

### Prochain jalon — Phase 2 : migration animaux et ressources

Périmètre suggéré :

1. Migrer `creatures.service.ts` : remplacer `Math.hypot` + pixels par `chebyshevDistanceWU` + WU. Convertir `MELEE_RANGE`, `patrolRadius`, `aggroRadius` en WU. Écrire `worldX/Y/mapId` dans `creatureRepository.update()`.
2. Exposer `worldX/Y/mapId` dans `client.data.player`.
3. Migrer `resources.gateway.ts` : `RESOURCE_INTERACT_RANGE` en WU, range check via `chebyshevDistanceWU`.
4. (Optionnel, parallélisable) Résoudre les anomalies backfill et exécuter `wu:backfill`.

Avant de démarrer la Phase 2, aligner ADR-0002 sur le nommage `worldX/Y` adopté en production pour éviter toute confusion lors de la révision du code.
