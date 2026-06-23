# STATUS — MMORPG Project

_Dernière mise à jour : 2026-06-23_
_Session : 2026-06-23 (session 7 — Studio SDK : actions, Command Palette, overlays)_
_Branche : main_
_État : développement local_

---

## État général

Backend NestJS + PostgreSQL opérationnels. Frontend React/Vite + Phaser connecté
via Socket.IO. Combat animal complet. Panneau admin fonctionnel avec console de
commandes, hiérarchie deux niveaux (template → instances), drag-and-drop vers la
map, suppression d'entités et vue d'ensemble temps réel (joueurs connectés,
personnages enregistrés, animaux actifs, templates, spawns).

Migration WU Phase 2 terminée. Infrastructure DevTools complète : shell, panel,
store centralisé, bridge React ↔ Phaser, module World, HUD admin-only.

Studio SDK en construction : ActionRegistry, CapabilityRegistry, providers d'actions
(Focus Camera, Copy Info, Force Respawn), OverlayControls global, Command Palette,
sélection CreatureSpawn depuis la map Phaser. Projection WU → écran centralisée
dans `wuProjection.ts`.

---

## Derniers changements importants

- **OverlayControls global** : `OverlayControls.tsx` liste tous les overlays via
  `getAllOverlayDefinitions()`, avec toggles ON/OFF centralisés. Les boutons overlay
  locaux des modules (Resources, Animals, CreatureSpawns) ont été supprimés.
- **Command Palette** : `CommandPalette.tsx` dans le panneau Studio — input filtrant
  les actions par label/id, Enter exécute la première action visible, clic exécute
  l'action choisie. `filterActions()` fonction pure exportée et testée.
- **Sélection CreatureSpawn depuis Phaser** : `DevToolsOverlayManager` crée un
  `Phaser.GameObjects.Zone` 28×28 par spawn quand l'overlay est ON. Clic → 
  `setSelectedWorldObject(spawn)` via callback. Zones détruites quand overlay OFF.
  Surbrillance automatique dans `CreatureSpawnsModule`.
- **ActionRegistry — Focus Camera** : `PositionActionProvider` (capability `transform`) →
  action `worldObject.focusCamera` : convertit WU en screen, appelle `camera.pan()`
  via `DevToolsBridge`. Disabled si `position null`.
- **ActionRegistry — Copy Info** : `WorldObjectActionProvider` (capability `transform`) →
  action `worldObject.copyInfo` : copie un résumé `category:type#id\nmapId=...\n...`
  dans le presse-papiers via `navigator.clipboard`.
- **Projection WU centralisée** : `src/phaser/utils/wuProjection.ts` — `wuToScreen()`
  unique source de vérité. `DevToolsOverlayManager` et `PositionActionProvider` utilisent
  ce helper ; `_wu2px()` supprimée.
- **Backend — Force Respawn** : `ResourcesService.forceRespawn()` + endpoint
  `POST /admin/resources/:id/force-respawn`. Tokens de génération
  (`pendingRespawnTokens`) pour invalider les timers legacy après un force respawn.
- **Action Force Respawn** : `ResourceActionProvider` (capability `harvestable`) →
  `SelectedActionsPanel` et `CommandPalette`. Bouton local retiré de
  `ResourceTemplateControls`.

---

## Fonctionnalités actuellement opérationnelles

| Domaine | Ce qui fonctionne |
|---|---|
| Combat | Aggro, fuite, auto-attaque, poursuite, états `alive/fighting/escaping/dead` |
| Respawn | Animal (20 s) et personnage (point le plus proche à 0 PV) |
| Récolte | Gathering avec timer serveur, anti-cheat distance (`WorldService.checkInteraction`) |
| UI | ActionPanel, barre de vie flottante, panneau personnage onglet Perso, HUD DevTools admin-only |
| DevTools — commandes | `/spawn`, `/tp`, `/sethp`, `/aggro`, `/respawn all`, `/help` — voir `docs/07_Admin/admin-tool.md` |
| DevTools — panneau | Panneau flottant draggable : module World + OverlayControls + modules WOM + WorldObjectInspector + SelectedActionsPanel + CommandPalette + ValidationPanel + AdminPanel legacy |
| DevTools — store | `DevToolsStore` singleton `__GLOBAL_DEVTOOLS_STORE__` : console, historique, ouverture HUD, mode edit, position panneau, lastClickedPos, contexte coordonnées (world click px/WU/tile/chunk) |
| DevTools — bridge | `DevToolsBridge` minimal : getters tolérants pour `window.game`, `WorldScene`, socket, mapId courant et caméra principale |
| DevTools — World | `CoordinateInspector` lecture seule : activeTool, dernier clic monde Phaser en pixels, WU, tile, chunk |
| DevTools — overlays | Overlays Resources / Animals / CreatureSpawns avec sélection au clic (Resources, Animals via interactionTargets ; CreatureSpawns via Zone Phaser) |
| DevTools — Command Palette | Input filtré par label/id, Enter = première action, liste cliquable, pending state |
| Studio SDK — ActionRegistry | `PositionActionProvider` (Focus Camera), `WorldObjectActionProvider` (Copy Info), `ResourceActionProvider` (Force Respawn) |
| Studio SDK — projection | `wuToScreen()` centralisée dans `phaser/utils/wuProjection.ts` |
| Backend — admin | `POST /admin/resources/:id/force-respawn` avec invalidation token de génération |
| Templates | Animaux (turkey, goblin) et ressources (dead_tree, ore) seedés au démarrage |
| Terrain | Tilemap isométrique grass 64×64 rendue dans Phaser via TMJ natif Tiled |
| Tests | 27 `AnimalsService` + 32 `world-position.adapter` + 36 `wu-backfill-report` + 24 `world.service` + 138 tests frontend (verts) |
| Migration WU | Backend : `world.service.ts` + `animals.service.ts` entièrement migrés. Frontend : `resolveScreen()` WU-first pour joueurs, animaux et ressources. Protocole `player_move` additif. |

---

## Décisions et règles à ne pas oublier

- **Système de coordonnées WU (ADR-0001 Accepted)** : `1 tile = 1024 WU`, `CHUNK_SIZE=64`,
  `CHUNK_SIZE_WU=65536`, `DEFAULT_MAP_ID=1`. Projection isométrique :
  `screenX = 1000 + (worldX − worldY) / 16`, `screenY = (worldX + worldY) / 32`.
  Inverse : `worldX = 8*(sx−1000) + 16*sy`, `worldY = −8*(sx−1000) + 16*sy`.
  Helper TS partagé : `src/phaser/utils/wuProjection.ts` (`wuToScreen`).
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
- `admin.store.ts` est un alias de compatibilité vers `devtools.store.ts`. Ne pas y
  ajouter de nouvelle logique. Supprimer quand tous les imports sont migrés.
- **Studio SDK — ActionRegistry** : les providers d'actions sont déclenchés par
  capabilities WOM. Un provider peut partager une capability avec un autre (ex.
  `PositionActionProvider` et `WorldObjectActionProvider` utilisent tous deux `transform`).
  L'ordre d'enregistrement dans `index.ts` détermine l'ordre d'affichage.
- **Tokens de génération respawn** : `ResourcesService.pendingRespawnTokens` invalide
  les timers legacy après un `forceRespawn`. Tout nouveau timer doit capturer son
  token au moment de `armRespawnTimer` et le vérifier dans `doRespawn`.
- Les maps Tiled utilisent exclusivement le format TMJ (natif JSON). Les tilesets
  utilisent TSX. Aucun convertisseur TMX → JSON autorisé. Le tileset doit être inliné
  dans le TMJ (pas de référence TSX externe) pour que Phaser le charge correctement.
  Lors d'un export Tiled, vérifier qu'aucun tileset externe parasite n'est ajouté
  — voir `docs/05_World/tiled.md`.

---

## Dette technique connue

- ~~**[CRITIQUE] `animals.service.ts` entièrement en pixels**~~ — **SOLDÉ**.
- ~~**[CRITIQUE] Anomalies OUT_OF_MAP_BOUNDS**~~ — **SOLDÉ**.
- ~~**[CRITIQUE] `resources.gateway.ts` range check en pixels**~~ — **SOLDÉ**.
- ~~**[IMPORTANT] Animaux — worldX/Y jamais écrits au runtime**~~ — **SOLDÉ**.
- **[IMPORTANT] `resources.gateway.ts` MOVE_TOLERANCE en pixels** : détection de mouvement pendant la récolte encore basée sur `player.x/y` (4 px). Faible criticité (anti-exploit seulement).
- **[IMPORTANT] `RespawnPoint.radius` en pixels** : drift de respawn en pixels ;
  `legacyRadiusToWU()` disponible dans `legacy-pixel-position.adapter.ts`.
- **[IMPORTANT] `player_move` — x/y fallback à supprimer** : protocole additif (P1). Suppression définitive des champs `x/y` dans le payload possible une fois le frontend entièrement migré (P2 fait, reste character_respawn / character_teleport côté frontend).
- **[IMPORTANT] `character_respawn` et `character_teleport`** : payloads encore en pixels côté client (`WorldScene.js:player.setPosition(data.x, data.y)`). Backend émet `x/y` pixels — migration prévue en P3-suites / P4 de l'étude WebSocket.
- **[IMPORTANT] `admin.store.ts` alias legacy** : `WorldScene.js`, `PlayerController.js`,
  `AdminPanel.tsx`, `ActionPanel.tsx` importent encore `admin.store`. À migrer vers
  `devtools.store` fichier par fichier.
- **[IMPORTANT] `mapId` hardcodé à `1` dans DevToolsStore/WorldScene** : le contexte
  de clic alimente `mapId: 1` statique. À rendre dynamique quand le multi-cartes arrive.
- **[IMPORTANT] DevTools HUD — rôle admin côté client uniquement pour l'affichage** :
  le bouton HUD reprend la visibilité client-side existante. Les actions sensibles
  restent à valider côté serveur comme avant.
- **[MINEUR] `wuToScreen` encore dupliquée dans `WorldScene.js`** : `resolveScreen()`
  local n'utilise pas encore `wuProjection.ts`. Migration possible quand `WorldScene`
  sera partiellement converti en TS ou quand le besoin se représente.
- **[MINEUR] Double console admin** : `ActionPanel.tsx` et `AdminPanel.tsx` dupliquent
  la logique `runCommand`/`onKeyDown`/autocomplete (~80 lignes chacun).
- **[MINEUR] `window.game` résiduel** : les attachements restent dans `WorldPage.jsx`
  et `WorldScene.js`, et `CoordinatesLayer.jsx` lit encore directement `window.game`.
  Migration progressive via `DevToolsBridge` prévue.
- **[MINEUR] Zone hit spawn rectangulaire** : les Zones Phaser pour la sélection
  CreatureSpawn sont 28×28 rectangulaires (pas circulaires). Un clic dans le coin
  hors du cercle visuel déclenche quand même la sélection — acceptable pour un outil admin.
- **[MINEUR] Copy Info sans feedback visuel** : action `worldObject.copyInfo` silencieuse
  si clipboard indisponible (HTTP sans HTTPS). Pas de toast / confirmation prévue.
- **Offset tilemap** : `TILEMAP_TEST_OFFSET_X = 936` temporaire dans `WorldScene.js`.
- `server.emit` broadcast global — prévoir rooms/zones à la montée en charge.
- Pathfinder peut échouer si un animal est sur une tuile bloquante.
- `synchronize: true` — migrations TypeORM à prévoir pour la prod.
- Sprite goblin utilise `textureKey: 'turkey'` en placeholder.
- Le tileset grass ne contient qu'une seule tuile — variété visuelle à construire.

---

## Prochaines priorités possibles

### DevTools — Studio SDK (en cours)
- [x] OverlayControls global (toggles centralisés)
- [x] Supprimer les boutons overlay locaux des modules WOM
- [x] Command Palette (input filtré, Enter, clic)
- [x] Sélection CreatureSpawn depuis overlay Phaser
- [x] Action Focus Camera (`worldObject.focusCamera`)
- [x] Action Copy Info (`worldObject.copyInfo`)
- [x] Action Force Respawn (`resource.forceRespawn`) via ActionRegistry
- [x] Projection WU centralisée (`wuProjection.ts`)
- [ ] Étape 7 — migrer les imports `admin.store` → `devtools.store` dans les 4 consommateurs
- [ ] Phase A — voir `docs/01_Architecture/admin-tool-roadmap.md` (auth WS admin, pagination serveur, spawns éditables)
- [ ] Phase B — overlays debug (chunks, collisions, aggro, pathfinding)

### Migration WU — Phase 3 (protocole WebSocket)
- [x] P0 — `join_world` : supprimer fallback `payload.x/y`
- [x] P1 — `player_move` additif : backend WU-first, fallback x/y conservé
- [x] P2 — Frontend joueurs : `resolveScreen()` WU-first
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
- [ ] Section Décor dans le panneau DevTools
- [ ] Migrations TypeORM pour la prod

---

## Documents potentiellement impactés

- [ ] `docs/03_Client/phaser-world.md` — `DevToolsShell`, `devtools.store`, `DevToolsBridge`, module World, HUD DevTools, ActionRegistry, wuProjection
- [ ] `docs/04_Server/websockets.md` — `player_move` payload additif (worldX/worldY/mapId) + P0 join_world
- [ ] `docs/07_Admin/admin-tool.md` — DevTools hors panneau personnage, AdminPanel legacy, architecture modules, Command Palette, ActionRegistry
- [ ] `docs/06_Database/schema.md` — colonnes WU : déjà documentées, vérifier cohérence
- [ ] `docs/05_World/chunks.md` — après validation ADR-0001 (déjà fait, vérifier)

---

## Règle de mise à jour

Mettre à jour `STATUS.md` uniquement quand demandé explicitement ou quand une
évolution structurante doit être reflétée. Garder ce fichier synthétique.

Quand une mise à jour est demandée :

1. Mettre à jour `STATUS.md`.
2. Résumer ce qui a changé.
3. Ajouter ou retirer les dettes techniques.
4. Lister les documents `docs/` potentiellement impactés.
5. Ne modifier les documents `docs/` que si le changement affecte une règle, une architecture, une API, une sécurité, une base de données ou un workflow durable.

---

## Historique court des sessions

### 2026-06-23 (session 7 — Studio SDK : actions, Command Palette, overlays)

- **OverlayControls global** : panneau centralisé listant tous les overlays via
  `getAllOverlayDefinitions()`. Boutons overlay locaux supprimés des modules WOM.
- **Command Palette** : `CommandPalette.tsx` avec `filterActions()` pure, input filtré,
  Enter = première action, clic = action choisie. 10 tests.
- **Sélection CreatureSpawn depuis Phaser** : `Phaser.GameObjects.Zone` 28×28 au
  centre de chaque spawn quand overlay ON. Callback → `setSelectedWorldObject`.
  Cleanup automatique quand overlay OFF ou destroy.
- **Action Focus Camera** : `PositionActionProvider` (capability `transform`),
  `wuToScreen()` + `camera.pan(x, y, 400, "Power2")` via `DevToolsBridge`. 8 tests.
- **Action Copy Info** : `WorldObjectActionProvider` (capability `transform`),
  `formatWorldObjectInfo()` pure + `navigator.clipboard.writeText`. 12 tests.
- **Action Force Respawn** : backend `ResourcesService.forceRespawn()` + tokens de
  génération + endpoint `POST /admin/resources/:id/force-respawn`. Frontend
  `ResourceActionProvider` (capability `harvestable`). Bouton local retiré de
  `ResourceTemplateControls`.
- **Projection WU centralisée** : `wuProjection.ts` + `wuProjection.spec.ts` (8 tests).
  `DevToolsOverlayManager._wu2px()` supprimée, `PositionActionProvider` inline supprimée.
- **Tests frontend** : 138 tests (10 fichiers) tous verts.

### 2026-06-22 (session 6 — DevTools HUD et module World)

- **DevTools hors panneau personnage** : entrée déplacée dans un HUD admin-only
  monté depuis `GameLayout`, avec panneau flottant draggable et reset de position
  à la fermeture.
- **Module World** : premier module DevTools indépendant, avec `CoordinateInspector`
  lecture seule (`World Click (px)`, WU, tile, chunk).
- **AdminPanel legacy** : toujours accessible dans le panneau DevTools flottant,
  sans modification fonctionnelle.

### 2026-06-22 (session 5 — DevToolsBridge minimal)

- **`devtoolsBridge.ts`** : premier bridge tolérant React ↔ Phaser côté DevTools
  (`getPhaserGame`, `getWorldScene`, `getDevToolsSocket`, `getCurrentMapId`,
  `getMainCamera`), sans état React et sans exception si Phaser n'est pas prêt.
- **`AdminPanel.tsx`** : accès socket, clavier Phaser et caméra drag-to-map passés
  par le bridge.
- **`ActionPanel.tsx`** : accès socket, clavier Phaser et scène WorldScene passés
  par le bridge.
- **Validation** : `npm run build` dans `apps/client` OK (warning Vite de taille
  de chunk uniquement).

### 2026-06-22 (session 4 — DevTools infrastructure)

- **DevToolsShell + DevToolsPanel** : créés dans `src/components/DevTools/`. `CharacterLayout`
  branché sur `DevToolsShell`. Onglet "Admin" → "DevTools". `AdminPanel` inchangé.
- **devtools.store.ts** : store Zustand singleton `__GLOBAL_DEVTOOLS_STORE__` avec
  `isConsoleActive`, `lastClickedPos`, `commandHistory`, `historyIndex`. `admin.store.ts`
  transformé en alias de compatibilité (re-export).
- **DevToolsStore enrichi** : `activeTool` (défaut `"legacy-admin"`), types
  `DevToolsScreenPoint / WorldPoint / TilePoint / ChunkPoint`, setters individuels +
  `setLastClickedContext` composite + `clearLastClickedContext`.
- **WorldScene.js** : au pointerdown sans cible, calcule et alimente les quatre espaces
  de coordonnées via l'inverse ADR-0001. `lastClickedPos` legacy conservé.
- **Documentation** : `admin-tool-roadmap.md`, `project-audit.md`, 6 documents `docs/10_AI/`,
  `docs/00_Project/domains.md`.

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
