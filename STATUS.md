# STATUS — MMORPG Project

_Dernière mise à jour : 2026-06-22_
_Session : 2026-06-22 (session 3)_
_Branche : main_
_État : développement local_

---

## État général

Backend NestJS + PostgreSQL opérationnels. Frontend React/Vite + Phaser connecté
via Socket.IO. Combat animal complet. Panneau admin fonctionnel avec console de
commandes, hiérarchie deux niveaux (template → instances), drag-and-drop vers la
map, suppression d'entités et vue d'ensemble temps réel (joueurs connectés,
personnages enregistrés, animaux actifs, templates, spawns).

Migration WU Phase 2 terminée : backend et frontend utilisent worldX/worldY/mapId
en priorité pour toutes les entités (joueurs, animaux, ressources). Le protocole
WebSocket player_move est additif (x/y conservés en fallback). Audits et plan de
migration WebSocket documentés.

---

## Derniers changements importants

- **Phase 2 migration WU — clôturée** : `animals.service.ts` entièrement WU (IA,
  combat, range checks). Frontend positionne joueurs, animaux et ressources depuis
  `worldX/worldY` avec fallback `x/y`. Helper `resolveScreen` dans `WorldScene.js`.
- **Protocole WebSocket — player_move additif** : client envoie `x/y + worldX/worldY/mapId`.
  Backend WU-first (6 nouveaux tests, 24 total dans `world.service.spec.ts`).
- **P0 — join_world** : `payload.x/y` supprimés de `JoinWorldPayload`. Le serveur ne fait
  plus confiance aux coordonnées envoyées à la connexion.
- **Backfill secondaire validé** : `wu:dry-run` confirme `creature_spawn` et `respawn_point`
  1/1 WU — prérequis B1/B2 de l'audit satisfaits.
- **Audits et plan** : `wu-final-backend-audit.md` (~60 % migration globale estimée) et
  `websocket-wu-migration-study.md` (plan P0-P7) créés dans `docs/01_Architecture/`.
- **Phase 1 migration WU — clôturée** (session précédente) : backfill exécuté (0 anomalie),
  ADR-0001 accepté, `world.service.ts` entièrement migré.

---

## Fonctionnalités actuellement opérationnelles

| Domaine | Ce qui fonctionne |
|---|---|
| Combat | Aggro, fuite, auto-attaque, poursuite, états `alive/fighting/escaping/dead` |
| Respawn | Animal (20 s) et personnage (point le plus proche à 0 PV) |
| Récolte | Gathering avec timer serveur, anti-cheat distance (`WorldService.checkInteraction`) |
| UI | ActionPanel, barre de vie flottante, panneau personnage, onglets Perso/Inventaire/Admin |
| Admin — commandes | `/spawn`, `/tp`, `/sethp`, `/aggro`, `/respawn all`, `/help` — voir `docs/07_Admin/admin-tool.md` |
| Admin — panneau | Vue d'ensemble live, hiérarchie template → instances, drag-and-drop map, suppression, pagination, recherche |
| Templates | Animaux (turkey, goblin) et ressources (dead_tree, ore) seedés au démarrage |
| Terrain | Tilemap isométrique grass 64×64 rendue dans Phaser via TMJ natif Tiled |
| Tests | 27 tests `AnimalsService` + 32 `world-position.adapter` + 36 `wu-backfill-report` + 24 `world.service` (verts — 1 préexistant KO sans lien WU) |
| Migration WU | Backend : `world.service.ts` + `animals.service.ts` entièrement migrés. Frontend : `resolveScreen()` WU-first pour joueurs, animaux et ressources. Protocole `player_move` additif. |

---

## Décisions et règles à ne pas oublier

- **Système de coordonnées WU (ADR-0001 Accepted)** : `1 tile = 1024 WU`, `CHUNK_SIZE=64`,
  `CHUNK_SIZE_WU=65536`, `DEFAULT_MAP_ID=1`. Projection isométrique :
  `screenX = 1000 + (worldX − worldY) / 16`, `screenY = (worldX + worldY) / 32`.
  Inverse : `worldX = 8*(sx−1000) + 16*sy`, `worldY = −8*(sx−1000) + 16*sy`.
  Phase 1 clôturée : backfill OK, `world.service.ts` entièrement migré.
  Voir `docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md` et
  `docs/01_Architecture/wu-migration-audit.md`.
- Le client ne fait jamais autorité sur les dégâts, positions critiques, loot ou
  ownership — voir `docs/02_Security/client-server-trust.md`.
- Les actions admin doivent être autorisées côté serveur. Les événements admin observés
  vérifient `client.data.role`, mais l'authentification indépendante de `AdminGateway`
  et la provenance garantie de `client.data.role` restent à auditer — voir
  `docs/02_Security/admin-permissions.md`.
- `WorldService.checkInteraction` est la barrière anti-cheat de distance ; toute
  nouvelle interaction doit la réutiliser — voir `docs/01_Architecture/client-server-boundaries.md`.
- `server.emit` broadcast à tous les clients (pas de rooms) — acceptable maintenant,
  dette de scalabilité — voir `docs/01_Architecture/realtime-socketio.md`.
- `synchronize: true` en développement local uniquement — colonnes NOT NULL
  nécessitent `{ default: x }` — voir `docs/04_Server/typeorm.md`.
- Le socket Socket.IO est un singleton créé dans `WorldPage.jsx`, partagé via
  `window.game.socket`. Les stores Zustand sont des singletons `window.__GLOBAL_*_STORE__`.
- Les maps Tiled utilisent exclusivement le format TMJ (natif JSON). Les tilesets
  utilisent TSX. Aucun convertisseur TMX → JSON autorisé. Le tileset doit être inliné
  dans le TMJ (pas de référence TSX externe) pour que Phaser le charge correctement.
  Lors d'un export Tiled, vérifier qu'aucun tileset externe parasite n'est ajouté
  — voir `docs/05_World/tiled.md`.

---

## Dette technique connue

- ~~**[CRITIQUE] `animals.service.ts` entièrement en pixels**~~ — **SOLDÉ**. Boucle IA entièrement WU (A2-A7). `attack()` utilise `animal.worldX/Y` directement.
- ~~**[CRITIQUE] Anomalies OUT_OF_MAP_BOUNDS**~~ — **SOLDÉ**. Backfill exécuté, `wu:dry-run` retourne 0/0.
- ~~**[CRITIQUE] `resources.gateway.ts` range check en pixels**~~ — **SOLDÉ**. `RESOURCE_INTERACT_RANGE_WU = 1600` + `chebyshevDistanceWU`.
- ~~**[IMPORTANT] Animaux — worldX/Y jamais écrits au runtime**~~ — **SOLDÉ**. Double-write + cache pixel dérivé de WU à chaque tick IA.
- **[IMPORTANT] `resources.gateway.ts` MOVE_TOLERANCE en pixels** : détection de mouvement pendant la récolte encore basée sur `player.x/y` (4 px). Faible criticité (anti-exploit seulement).
- **[IMPORTANT] `RespawnPoint.radius` en pixels** : drift de respawn en pixels ;
  `legacyRadiusToWU()` disponible dans `legacy-pixel-position.adapter.ts`.
- **[IMPORTANT] `player_move` — x/y fallback à supprimer** : protocole additif (P1). Suppression définitive des champs `x/y` dans le payload possible une fois le frontend entièrement migré (P2 fait, reste character_respawn / character_teleport côté frontend).
- **[IMPORTANT] `character_respawn` et `character_teleport`** : payloads encore en pixels côté client (`WorldScene.js:player.setPosition(data.x, data.y)`). Backend émet `x/y` pixels — migration prévue en P3-suites / P4 de l'étude WebSocket.
- **Offset tilemap** : `TILEMAP_TEST_OFFSET_X = 936` temporaire dans `WorldScene.js`.
- `server.emit` broadcast global — prévoir rooms/zones à la montée en charge.
- Pathfinder peut échouer si un animal est sur une tuile bloquante.
- `synchronize: true` — migrations TypeORM à prévoir pour la prod.
- Sprite goblin utilise `textureKey: 'turkey'` en placeholder.
- Le tileset grass ne contient qu'une seule tuile — variété visuelle à construire.

---

## Prochaines priorités possibles

### Migration WU — Phase 2 (animaux et ressources) — **CLÔTURÉE**
- [x] Fix `teleportCharacter()` double-écriture (`b751bad`)
- [x] `updatePlayer()` WU-first + garde-fous NaN/Infinity (`9bdd4b3`)
- [x] Backfill exécuté — 0 anomalie / 0 entité restante
- [x] Migrer `animals.service.ts` vers WU (A2-A7 — IA, combat, range checks)
- [x] Double-écriture animaux : `worldX/Y/mapId` dans tous les `animalRepository.update()`
- [x] Migrer `resources.gateway.ts` : `RESOURCE_INTERACT_RANGE_WU` + `chebyshevDistanceWU`
- [x] `AnimalsGateway.attack()` utilise `player.worldX/Y/mapId` (client.data.player WU)
- [x] Migrer `player_move` : payload additif `x/y + worldX/worldY/mapId` (P1)

### Migration WU — Phase 3 (protocole WebSocket)
- [x] P0 — `join_world` : supprimer fallback `payload.x/y`
- [x] P1 — `player_move` additif : backend WU-first, fallback x/y conservé
- [x] P2 — Frontend joueurs : `resolveScreen()` WU-first pour `world_joined`, `player_joined`, `current_players`, `player_moved`
- [x] P3 — Frontend animaux + ressources : `resolveScreen()` WU-first
- [ ] P4 — `character_respawn` et `character_teleport` : ajouter `worldX/Y` dans payload, frontend lit WU
- [ ] P5 — `player_move` : supprimer fallback `x/y` (après stabilisation P1)
- [ ] P6 — Admin protocol : `admin:spawn`, `admin:teleport`, `admin:move_animal` en WU
- [ ] P7 — Drop colonnes legacy DB (`positionX/Y`, `animal.x/y` en cache pur)

### Gameplay / contenu
- [ ] Système de loot sur les animaux tués
- [ ] Barre de vie des joueurs distants (envoyer HP dans `player_moved`)
- [ ] Import sprite goblin (textureKey propre)
- [ ] Autres tuiles terrain (chemins, eau, transition herbe/terre…)
- [ ] Autres types d'animaux (loup, sanglier…)
- [ ] Section Décor dans le panneau admin
- [ ] Migrations TypeORM pour la prod

---

## Documents potentiellement impactés

Cette liste indique les documents à vérifier après une session de code. Elle ne signifie pas qu'ils doivent tous être modifiés.

- [ ] `docs/04_Server/websockets.md` — `player_move` payload additif (worldX/worldY/mapId) + P0 join_world
- [ ] `docs/03_Client/phaser-world.md` — `resolveScreen()`, migration WU frontend complète
- [ ] `docs/06_Database/schema.md` — colonnes WU : déjà documentées, vérifier cohérence
- [ ] `docs/05_World/chunks.md` — après validation ADR-0001 (déjà fait, vérifier)
- [ ] `docs/05_World/maps-and-collisions.md` — après validation ADR-0001 (déjà fait, vérifier)

---

## Règle de mise à jour

Après une session de code :

1. Mettre à jour `STATUS.md`.
2. Résumer ce qui a changé.
3. Ajouter ou retirer les dettes techniques.
4. Lister les documents `docs/` potentiellement impactés.
5. Ne modifier les documents `docs/` que si le changement affecte une règle, une architecture, une API, une sécurité, une base de données ou un workflow durable.

---

## Historique court des sessions

### 2026-06-22 (session 3 — Phase 2 + protocole WebSocket)

- **`animals.service.ts` — migration WU complète** : boucle IA (doPatrolMovement,
  doFighting, doEscaping) WU-authoritative, pixel cache dérivé de WU. `findNearestPlayer`
  WU + filtre `mapId`. `attack()` utilise `animal.worldX/Y` directement. 27/27 tests.
- **Backfill secondaire validé** : `wu:dry-run` confirme `creature_spawn` et
  `respawn_point` 1/1 WU — prérequis B1/B2 de l'audit satisfaits.
- **P0** : `join_world` ne fait plus confiance aux coordonnées client — `x/y` supprimés
  de `JoinWorldPayload`, fallback serveur contrôlé uniquement.
- **P1** : `player_move` payload additif — client envoie `x/y + worldX/worldY/mapId`,
  backend WU-first. 6 nouveaux tests (24 total `world.service.spec.ts`).
- **P2** : Frontend positionne joueurs depuis `worldX/worldY` — helper `resolveScreen`
  (renommé depuis `resolvePlayerScreen`), fallback `x/y` conservé.
- **P3** : Frontend positionne animaux et ressources depuis `worldX/worldY` via `resolveScreen`.
- **Audits créés** : `wu-final-backend-audit.md` (migration ~60 % backend estimée) et
  `websocket-wu-migration-study.md` (plan P0-P7).

### 2026-06-22 (session 2 — clôture Phase 1)

- **Phase 1 WU — clôturée** : backfill exécuté (0 anomalie), ADR-0001 accepté.
- **Documentation alignée** : `worldTileX/Y` → `worldX/Y` dans glossaire, ROADMAP,
  `movement-authority-audit.md`. Formule bounds ADR-0003 corrigée (`CHUNK_SIZE` → `CHUNK_SIZE_WU`).
- **`coordinate-system-phase1-validation.md`** mis à jour : section backfill, section ADR, critères de sortie.
- **`wu-migration-audit.md`** : C1 et C4 marqués soldés, estimations mises à jour (~35–40%).

### 2026-06-22 (session 1)

- **`updatePlayer()` WU-first** : pixels → WU en priorité, x/y mis à jour seulement
  si conversion réussit, garde-fous NaN/Infinity. 16 tests (`world.service.spec.ts`).
- **`teleportCharacter()` double-écriture** : bug CRITIQUE soldé — DB écrit désormais
  `positionX/Y` + `worldX/Y/mapId` sur téléportation.

### 2026-06-21 (session 2)

- **Migration WU — infrastructure** : `world-coordinates.ts` (module central),
  `legacy-pixel-position.adapter.ts`, `world-position.adapter.ts` (32 tests),
  `wu-backfill-report.ts` (36 tests, 6 anomalies dont OUT_OF_MAP_BOUNDS).
- **Scripts backfill** : `wu-backfill-dry-run.ts` et `wu-backfill-real.ts`
  (`npm run wu:dry-run` / `npm run wu:backfill`). Entités TypeORM complètes.
- **Migration WU — world.service.ts** : `ConnectedPlayer` avec `worldX/Y/mapId`
  requis + `x/y` cache pixel. `joinPlayer`, `updatePlayer`, `persistPlayerPosition`
  (double-écriture), `respawnCharacter` (Chebyshev WU + filtre mapId) migrés.
- **Audit** : `docs/01_Architecture/wu-migration-audit.md` créé.

### 2026-06-21 (session 1)

- ADR-0001 créé (Draft/Proposed) : système de coordonnées monde tile-first,
  `CHUNK_SIZE=64`, formules de projection isométrique, responsabilités par couche.
- Relecture ADR-0001 : contradiction option B / question ouverte corrigée.
- Documentation coordonnées mise à jour : `phaser-world.md`, `maps-and-collisions.md`,
  `chunks.md` — dette de conversion documentée.
- `WorldScene.js` : constantes renommées `TILEMAP_TEST_OFFSET_X/Y`, commentaire
  simplifié.

### 2026-06-19 (suite)

- Pipeline graphique isométrique : workspace `assets/source/` créé, templates GIMP,
  masques PNG, SVG géométrique, guides, art-direction.
- Décision d'architecture Tiled : TMJ natif + TSX, pas de convertisseur.
- Tilemap grass intégrée dans Phaser (64×64, isométrique 128×64 px).
- Correction SCSS `lighten()` → `color.adjust()`.
- Renommage `phaser/map/` → `phaser/world/`.

### 2026-06-18 / 2026-06-19

- Documentation projet restructurée et complétée dans `docs/`.
- Documents client, serveur, sécurité, monde, base de données, admin et workflow complétés.
- `STATUS.md` transformé en tableau de bord synthétique.
- Vue d'ensemble admin enrichie : joueurs connectés (temps réel) et personnages enregistrés.
- Panneau admin : mises à jour temps réel via socket, suppression définitive en DB,
  sélecteur d'état sur les instances, templates ressources éditables.

### 2026-06-17 et avant

- Boucle combat complète (aggro, fuite, auto-attaque, respawn).
- Panneau admin : hiérarchie deux niveaux, drag-and-drop map, console de commandes.
- Entités `ResourceTemplate`, `CreatureTemplate`, `CreatureSpawn`, `RespawnPoint` seedées.
