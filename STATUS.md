# STATUS — MMORPG Project

_Dernière mise à jour : 2026-06-24_
_Session : 2026-06-24 (sessions 14–18 — Crafting Stations, runtime craft joueur, overlays debug)_
_Branche : main_
_État : développement local_

---

## État général

Backend NestJS + PostgreSQL opérationnels. Frontend React/Vite + Phaser connecté
via Socket.IO. Combat animal complet. Panneau admin fonctionnel avec console de
commandes, hiérarchie deux niveaux (template → instances), drag-and-drop vers la
map, suppression d'entités et vue d'ensemble temps réel (joueurs connectés,
personnages enregistrés, animaux actifs, templates, spawns).

Migration WU P0–P6 terminée : protocole WebSocket entièrement WU. `player_move`
WU-only (plus de `x/y` dans le payload). Tous les événements admin (`admin:spawn`,
`admin:teleport`, `admin:move_animal`, `admin:spawn_resource`, `admin:update_animal`,
`admin:update_resource`) acceptent `worldX/worldY` exclusivement. Pixel cache dérivé
côté serveur via `wuToIsoScreenX/Y`. Drag-to-map et boutons Tp du panneau admin
passent en WU via `screenToWorldWU`. Infrastructure DevTools complète : shell, panel,
store centralisé, bridge React ↔ Phaser, module World, HUD admin-only.

**AdminPanelWOM** opérationnel avec Skills et CraftingRecipes : création/édition
de `SkillDefinition`, sélects dynamiques pour categories/stations, `requiredSkillKey`
avec labels lisibles, affichage recettes structuré. Panneau DevTools redimensionnable.
Onglet Skills joueur dans le panneau personnage (barre XP par catégorie).
Onglets Talents/Succès placeholder actifs.

**Crafting Stations runtime** opérationnel : `CraftingStationTemplate` et
`CraftingStation` sont persistés, administrables via WOM/AdminPanel, rendus en
debug dans `WorldScene` et utilisables par le joueur depuis l'ActionPanel. Les
recettes avec `stationType != "none"` sont validées côté serveur par distance
euclidienne WU à une station compatible proche. Le client affiche un indicateur
estimatif de portée et les erreurs structurées serveur, sans jamais devenir
autoritaire.

---

## Derniers changements importants

- **Crafting Stations + runtime craft joueur** : ajout de `CraftingStationTemplate`
  et `CraftingStation` (templates + instances WU), seeds non destructifs
  (`forge`, `workbench`, `sawmill`, `alchemy_table`, `cooking_station`),
  adapter WOM avec capabilities `crafting_station`, `placement`, `validation`,
  AdminPanel/WOM pour templates et instances, drag-to-map et bouton TP station.
  `CraftingService.craft()` valide les recettes `stationType != "none"` par
  station enabled/template enabled, même `mapId`, `stationType` compatible et
  distance euclidienne WU <= `interactionRadiusWU`.
- **Rendu debug stations et Station Radius Overlay** : `WorldScene` affiche les
  stations enabled en carrés debug (`forge` orange, `workbench` bleu, `sawmill`
  vert, `alchemy_table` violet, `cooking_station` rouge, fallback gris). Le
  toggle DevTools `Station Radius` affiche le rayon issu de
  `interactionRadiusWU`. Ces rendus sont visuels uniquement : pas de collision,
  pas de validation gameplay.
- **Runtime Crafting UI** : clic station → `ActionPanel` → ouverture du panneau
  craft runtime, chargement des recettes compatibles via `stationType`, puis
  `POST /crafting/craft { recipeId, quantity }`. Le client n'envoie ni
  `characterId`, ni `stationId`; le serveur résout le personnage et choisit la
  station valide. Après succès, inventaire et skills sont rafraîchis.
- **UX portée estimée et erreurs station structurées** : le client affiche
  `Station à portée` ou `Hors de portée estimée` à partir des coordonnées WU
  locales, sans bloquer le craft. Les refus serveur station renvoient
  `CRAFTING_STATION_REQUIRED` ou `CRAFTING_STATION_OUT_OF_RANGE` avec
  `stationType`, et si calculable `nearestDistanceWU` + `requiredRadiusWU`.
- **Migration WU P5 — `player_move` WU-only** : `x/y` pixels supprimés du payload
  `player_move` (client → serveur). `WorldScene.syncLocalPlayer` envoie désormais
  `{ worldX, worldY, mapId, direction }`. `updatePlayer` accepte uniquement WU,
  dérive le pixel cache via `wuToIsoScreenX/Y`. Fallback `isoScreenToWorldWU` supprimé.
  Suite "métriques passives mouvement" de `world.service.spec.ts` mise à jour.
- **Migration WU P6 — Protocole admin WU pur** : `admin:spawn`, `admin:teleport`,
  `admin:move_animal`, `admin:spawn_resource`, `admin:update_animal`,
  `admin:update_resource` — tous les payloads de coordonnées en `worldX/worldY`.
  `AnimalsService.createAdminSpawn/moveAnimal/adminUpdateAnimal`,
  `AdminService.createResource/updateResource` dérivent le pixel cache côté serveur.
  `commandRegistry.ts` utilise `lastClickedWorldPoint` (WU). `adminPanel.shared.tsx`
  : `toWorldWU()` via `screenToWorldWU`, drag-to-map et boutons Tp passent en WU.
  `admin.actions.ts` : signatures WU. Tests : `admin.service.spec.ts` + tests
  `teleportCharacter` WU mis à jour.
- **Migration WU P4–P4.5** : `character_respawn` et `character_teleport` transportent
  désormais `worldX/worldY/chunkX/chunkY + characterId`. Champs `x/y` pixels legacy
  supprimés des deux payloads. `WorldScene.js` utilisait déjà `resolveScreen()` WU-first.
  7 nouveaux tests `world.service.spec.ts` (suites `teleportCharacter` + `respawnCharacter`).
- **CraftingRecipe administrable (WOM)** : adapter WOM, `AdminService` CRUD + ingrédients/
  résultats + validation, 7 événements `AdminGateway`, 4 endpoints REST. `RecipesSection.tsx`
  avec sélects dynamiques (category, stationType, requiredSkillKey avec labels). 65 tests
  `admin.service.spec.ts`, 14 tests adapter.
- **SkillDefinition admin amélioré** : labels lisibles dans le form création, hint sous
  le champ Key, sélects catégorie. `optionLabels` ajouté à `FieldDef` + `StatField`.
- **Onglet Skills joueur** : `GET /characters/me/skills` (level, xp, nextLevelXp),
  `loadSkills()` dans `character.store`, `SkillsTab.tsx` (groupé par catégorie, barre XP,
  niveau max). Onglets Talents/Succès placeholders cliquables dans le panneau personnage.
- **DevTools UX** : panneau redimensionnable (`resize: both`, min/max), `template-stats`
  responsive (`flex: 1 + min-width: 72px`), header recette à deux lignes, sélects
  category/station, classes SCSS manquantes (`__recipe-subtext`, `__instance-row`, etc.).

---

## Fonctionnalités actuellement opérationnelles

| Domaine | Ce qui fonctionne |
|---|---|
| Combat | Aggro, fuite, auto-attaque, poursuite, états `alive/fighting/escaping/dead` |
| Respawn | Animal (20 s), personnage (point le plus proche à 0 PV), resource (timer template) |
| Récolte | Gathering avec timer serveur, anti-cheat distance (`WorldService.checkInteraction`) |
| UI | ActionPanel, barre de vie flottante, panneau personnage onglet Perso, HUD DevTools admin-only |
| DevTools — commandes | `/spawn`, `/tp`, `/sethp`, `/aggro`, `/respawn all`, `/help` — voir `docs/07_Admin/admin-tool.md` |
| DevTools — panneau | Panneau flottant draggable : module World + OverlayControls + AdminPanel WOM (onglet toggle Legacy) |
| DevTools — store | `DevToolsStore` singleton `__GLOBAL_DEVTOOLS_STORE__` : console, historique, ouverture HUD, mode edit, position panneau, lastClickedPos, contexte coordonnées (world click px/WU/tile/chunk) |
| DevTools — bridge | `DevToolsBridge` minimal : getters tolérants pour `window.game`, `WorldScene`, socket, mapId courant et caméra principale |
| DevTools — World | `CoordinateInspector` lecture seule : activeTool, dernier clic monde Phaser en pixels, WU, tile, chunk |
| DevTools — overlays | Overlays Resources / Animals / CreatureSpawns avec sélection au clic, Station Radius Overlay pour les stations de craft |
| DevTools — Command Palette | Input filtré par label/id, Enter = première action, liste cliquable, pending state |
| AdminPanelWOM | Resources (instances WOM + templates dérivés, respawnDelayMs éditable, lootPool lecture seule, WU/respawnAt affichés, Reset template). Animals (instances WOM, templates REST). CraftingRecipes et CraftingStations (templates + instances WU, drag-to-map, TP). Players/Overview REST. Console identique legacy. |
| Studio SDK — ActionRegistry | `PositionActionProvider` (Focus Camera), `WorldObjectActionProvider` (Copy Info), `ResourceActionProvider` (Force Respawn + Reset Template) |
| Studio SDK — projection | `wuToScreen()` centralisée dans `phaser/utils/wuProjection.ts` |
| Backend — admin | `POST /admin/resources/:id/force-respawn`, `POST /admin/resources/:id/reset-from-template`, `PATCH admin:update_resource_template` (defaultRemainingLoots + respawnDelayMs) |
| Templates | Animaux (turkey, goblin) et ressources (dead_tree, ore) seedés au démarrage |
| Terrain | Tilemap isométrique grass 64×64 rendue dans Phaser via TMJ natif Tiled |
| Tests | Suites backend/frontend locales mises à jour régulièrement ; dernier passage ciblé craft : `npm --workspace api-gateway run test -- crafting`, client complet : `npm --workspace client run test` |
| Migration WU | **P0–P6 soldés.** Protocole WebSocket entièrement WU. `player_move` WU-only, tous les événements admin en `worldX/worldY`. `resolveScreen()` WU-first côté client. Reste : P7 drop colonnes legacy DB (`positionX/Y`, `animal.x/y`). |
| Skills joueur | `GET /characters/me/skills` — niveau, XP, nextLevelXp par skill. Onglet Skills dans le panneau personnage. Talents/Succès placeholders. |
| Crafting | `CraftingRecipe` administrable via WOM/Admin. `CraftingStationTemplate` et `CraftingStation` administrables et placées en WU. Craft runtime joueur via stations, ActionPanel, validation serveur distance WU, refresh inventaire/skills, erreurs station structurées. |

---

## Décisions et règles à ne pas oublier

- **Système de coordonnées WU (ADR-0001 Accepted)** : `1 tile = 1024 WU`, `CHUNK_SIZE=64`,
  `CHUNK_SIZE_WU=65536`, `DEFAULT_MAP_ID=1`. Projection isométrique :
  `screenX = 1000 + (worldX − worldY) / 16`, `screenY = (worldX + worldY) / 32`.
  Inverse : `worldX = 8*(sx−1000) + 16*sy`, `worldY = −8*(sx−1000) + 16*sy`.
  Helper TS partagé : `src/phaser/utils/wuProjection.ts` (`wuToScreen`).
  P0–P6 soldés : protocole WebSocket WU pur, pixel cache dérivé côté serveur.
  Voir `docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md` et
  `docs/01_Architecture/wu-migration-audit.md`.
- **Navigation client — NavGrid / Pathfinder** : `NAV_CELL_SIZE_WU = 128` (8×8 nav
  cells par tile, `NAV_CELLS_PER_TILE = 8`). `WalkabilityGrid` (résolution tile) →
  `createNavGridFromWalkabilityGrid(wg, 8)` → `NavGrid` (512×512 pour une map 64×64 tiles).
  Format : `grid[y][x]`, `0` = walkable, `1` = bloqué. A\* 8 directions, coût `hypot`,
  résultat `{x: navX, y: navY}[]`. `smoothPath` (string-pulling greedy Bresenham LOS).
  `findNearestWalkableCell` (Chebyshev rings) : si la cible est bloquée, `wasSnapped=true`
  supprime le fallback mouvement direct. Modules : `walkabilityGrid.ts`, `pathfinding.js`.
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
- **`buildResourceBroadcast`** : tout broadcast `resource_update` depuis le service
  doit utiliser ce helper pour inclure `type`/`x`/`y`/`worldX`/`worldY`/`mapId`.
  Sans ces champs, le client ne peut pas recréer le sprite après un état `dead`.
- **`lootPool` non éditable via socket** : `admin:update_resource_template` n'accepte
  que `defaultRemainingLoots` et `respawnDelayMs`. `lootPool` est affiché en lecture
  seule dans AdminPanelWOM.
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
- ~~**[IMPORTANT] Cycle respawn resource invisible après dead**~~ — **SOLDÉ** (`buildResourceBroadcast`).
- **[IMPORTANT] `auth.controller.spec.ts` en échec** : 1 test pré-existant échoue
  (dépendance `AuthService` manquante dans le module de test). Non bloquant en dev,
  à corriger avant CI/prod.
- **[IMPORTANT] `resources.gateway.ts` MOVE_TOLERANCE en pixels** : détection de mouvement pendant la récolte encore basée sur `player.x/y` (4 px). Faible criticité (anti-exploit seulement).
- **[IMPORTANT] `RespawnPoint.radius` en pixels** : drift de respawn en pixels ;
  `legacyRadiusToWU()` disponible dans `legacy-pixel-position.adapter.ts`.
- ~~**[IMPORTANT] `character_respawn` et `character_teleport` en pixels**~~ — **SOLDÉ** (P4–P4.5 : WU + chunkX/Y, x/y supprimés).
- ~~**[IMPORTANT] `player_move` — x/y fallback à supprimer**~~ — **SOLDÉ** (P5 : payload WU-only, fallback pixel supprimé, pixel cache dérivé côté serveur).
- ~~**[IMPORTANT] Protocole admin en pixels**~~ — **SOLDÉ** (P6 : `admin:spawn`, `admin:teleport`, `admin:move_animal`, `admin:spawn_resource`, `admin:update_animal/resource` en `worldX/worldY`).
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
- **[MINEUR] Double console admin** : `ActionPanel.tsx` et `AdminPanelWOM.tsx`
  dupliquent la logique `runCommand`/`onKeyDown`/autocomplete (~80 lignes chacun).
- **[MINEUR] `window.game` résiduel** : les attachements restent dans `WorldPage.jsx`
  et `WorldScene.js`, et `CoordinatesLayer.jsx` lit encore directement `window.game`.
  Migration progressive via `DevToolsBridge` prévue.
- **[MINEUR] Zone hit spawn rectangulaire** : les Zones Phaser pour la sélection
  CreatureSpawn sont 28×28 rectangulaires (pas circulaires). Un clic dans le coin
  hors du cercle visuel déclenche quand même la sélection — acceptable pour un outil admin.
- **[MINEUR] Copy Info sans feedback visuel** : action `worldObject.copyInfo` silencieuse
  si clipboard indisponible (HTTP sans HTTPS). Pas de toast / confirmation prévue.
- **[MINEUR] `lootPool` non éditable dans AdminPanelWOM** : affiché en lecture seule.
  Édition nécessiterait un nouveau socket event ou endpoint REST avec validation JSON.
- **Offset tilemap** : `TILEMAP_TEST_OFFSET_X = 936` temporaire dans `WorldScene.js`.
- `server.emit` broadcast global — prévoir rooms/zones à la montée en charge.
- Pathfinder peut échouer si un animal est sur une tuile bloquante.
- `synchronize: true` — migrations TypeORM à prévoir pour la prod.
- Sprite goblin utilise `textureKey: 'turkey'` en placeholder.
- Le tileset grass ne contient qu'une seule tuile — variété visuelle à construire.

---

## Prochaines priorités possibles

### DevTools — Admin WOM (en cours)
- [x] AdminPanelWOM — pipeline WOM pour ressources et animaux
- [x] Overlay Creature Spawns corrigé (URL + auth + fallback legacy)
- [x] `respawnDelayMs` éditable dans les templates resource
- [x] `respawnAt` exposé dans les Resource WorldObjects
- [x] Coordonnées WU et respawnAt affichés sur les instances resource
- [x] Bouton "Reset template" sur les instances resource
- [ ] Étape 7 — migrer les imports `admin.store` → `devtools.store` dans les 4 consommateurs
- [ ] Phase A — voir `docs/01_Architecture/admin-tool-roadmap.md` (auth WS admin, pagination serveur, spawns éditables)
- [ ] Phase B — overlays debug (chunks, collisions, aggro, pathfinding)

### Migration WU — Phase 3 (protocole WebSocket)
- [x] P0 — `join_world` : supprimer fallback `payload.x/y`
- [x] P1 — `player_move` additif : backend WU-first, fallback x/y conservé
- [x] P2 — Frontend joueurs : `resolveScreen()` WU-first
- [x] P3 — Frontend animaux + ressources : `resolveScreen()` WU-first
- [x] P4 — `character_respawn` et `character_teleport` : `worldX/worldY/chunkX/chunkY/characterId`, frontend WU-first via `resolveScreen()`
- [x] P4.5 — supprimer `x/y` legacy de `character_respawn` et `character_teleport`
- [x] P5 — `player_move` : supprimer fallback `x/y` dans payload client + `updatePlayer` serveur
- [x] P6 — Admin protocol : `admin:spawn`, `admin:teleport`, `admin:move_animal`, `admin:spawn_resource`, `admin:update_animal`, `admin:update_resource` en WU
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

- [ ] `docs/03_Client/phaser-world.md` — `DevToolsShell`, `devtools.store`, `DevToolsBridge`, module World, HUD DevTools, ActionRegistry, wuProjection, AdminPanelWOM, NavGrid/Pathfinder
- [ ] `docs/04_Server/websockets.md` — `player_move` WU-only (P5), protocole admin WU (P6), `buildResourceBroadcast`
- [ ] `docs/07_Admin/admin-tool.md` — AdminPanelWOM, admin protocol WU, drag-to-map WU, Tp WU
- [ ] `docs/06_Database/schema.md` — colonnes WU : déjà documentées, vérifier cohérence
- [ ] `docs/05_World/maps-and-collisions.md` — NavGrid 8×8, `NAV_CELL_SIZE_WU=128`, pathfinding WU
- [ ] `docs/01_Architecture/websocket-wu-migration-study.md` — marquer P0–P6 soldés (fait dans cette session)

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

### 2026-06-24 (sessions 16–18 — Crafting Stations et runtime craft joueur)

- **Crafting Stations Phase 1** : `CraftingStationTemplate` et `CraftingStation`
  ajoutés comme World Objects persistés, administrables via WOM/AdminPanel. Seeds
  non destructifs minimum : `forge`, `workbench`, `sawmill`, `alchemy_table`,
  `cooking_station`. Validation serveur dans `CraftingService.craft()` pour
  `stationType != "none"` : station compatible enabled, template enabled, même
  `mapId`, distance euclidienne WU <= `interactionRadiusWU`.
- **Crafting Stations Phase 2 + 2.5** : rendu debug in-world des stations enabled
  dans `WorldScene`, bouton TP station dans AdminPanel, live refresh via
  `crafting_station_update`, toggle DevTools `Station Radius` basé sur
  `interactionRadiusWU`.
- **Runtime Crafting UI joueur** : clic station → `ActionPanel` → panneau craft,
  liste recettes compatibles, `POST /crafting/craft { recipeId, quantity }`,
  refresh inventaire/skills. Le client n'envoie jamais `characterId` ni
  `stationId`.
- **UX portée et erreurs structurées** : indicateur purement informatif de portée
  estimée côté client. Erreurs serveur station enrichies :
  `CRAFTING_STATION_REQUIRED` et `CRAFTING_STATION_OUT_OF_RANGE` avec distance/rayon
  si calculables.

### 2026-06-24 (sessions 14–15 — migration WU P5 + P6)

- **Migration WU P5 — `player_move` WU-only** : `x/y` supprimés du payload
  `player_move`. `WorldScene.syncLocalPlayer` envoie `{ worldX, worldY, mapId,
  direction }`. `world.gateway.ts` : validation WU uniquement. `world.service.ts`
  `updatePlayer` : accepte uniquement `worldX/worldY/mapId`, dérive pixel cache via
  `wuToIsoScreenX/Y`, supprime appel `isoScreenToWorldWU`. Suite "métriques passives
  mouvement" mise à jour (retrait `x/y` des payloads de test). 572 tests backend.
- **Migration WU P6 — Protocole admin WU pur** :
  - Backend : `AnimalsService.createAdminSpawn`, `moveAnimal`, `adminUpdateAnimal` —
    signatures `(worldX, worldY)`, pixel cache dérivé. `AdminService.createResource`,
    `updateResource` — idem, guard `isFinite`. `admin.gateway.ts` : types payload
    `worldX/worldY` pour les 6 événements admin de coordonnées.
  - Frontend `admin.actions.ts` : `spawnCreature/teleportCharacter/moveAnimal` en WU.
    `commandRegistry.ts` : `getLastClickedWorldPoint()`, `resolvePos` utilise WU.
    `/spawn` et `/tp` passent `worldX/worldY`. `adminPanel.shared.tsx` : `toWorldWU()`
    via `screenToWorldWU`, drag-to-map et boutons Tp en WU. `AdminPanelWOM.tsx` :
    `getDragPayload` et `getTpPosition/getInstanceTpPosition` en `worldX/worldY`.
  - Tests : `teleportCharacter` mis à jour (WU input, guard NaN, pixel cache), nouveaux
    tests `admin.service.spec.ts` (`createResource WU`, `updateResource WU`, guard Infinity).

### 2026-06-24 (sessions 9–13 — Skills, Crafting, UX DevTools, migration WU P4–P5)

- **SkillDefinition admin** : `SkillDefinition` entité, endpoints REST, gateway events,
  `AdminPanelWOM` section Skills avec formulaire création (labels, hint snake_case, sélect catégorie).
  `FieldDef.optionLabels?: string[]` ajouté pour sélects avec labels lisibles (`StatField`).
- **CraftingRecipe admin** : `CraftingRecipe` entité (ingrédients JSON, résultats JSON,
  requiredSkillKey, category, stationType). `craft-recipe-world-object.adapter.ts` (14 tests).
  `AdminService` : `CraftingRecipeRepository` injecté, 7 méthodes CRUD. 65 tests
  `admin.service.spec.ts`. 7 events `AdminGateway`. 4 endpoints REST `AdminController`.
- **RecipesSection.tsx** : `skillDefinitions` prop → sélects dynamiques `requiredSkillKey`
  avec labels. Constantes `RECIPE_CATEGORIES`, `STATION_TYPES`. Header recette deux lignes
  (nom+badge / key·category·skill). Sélects create form.
- **SkillsTab joueur** : `GET /characters/me/skills` (level, xp, nextLevelXp).
  `character.store.loadSkills()`. `SkillsTab.tsx` (groupé par catégorie, barre XP,
  niveau max). Onglets Talents/Succès placeholders cliquables.
- **DevTools UX** : panneau `resize: both` (min 280 px), `overflow: auto`, `__body: flex: 1`.
  `template-stat` responsive (`flex: 1 + min-width: 72px + width: 100%`), SCSS sélects.
  Classes `.admin-panel__recipe-*` et `__field-hint` ajoutées.
- **Migration WU P4** : `character_respawn` et `character_teleport` — ajout `chunkX/chunkY`
  + `characterId` (téléport). 7 nouveaux tests `world.service.spec.ts` (31 total).
- **Migration WU P5** : `x/y` legacy supprimés des deux payloads. `resolveScreen()` WU-first
  dans `WorldScene.js` déjà en place — aucun consommateur ne dépendait des champs supprimés.

### 2026-06-23 (session 8 — AdminPanelWOM, fixes overlays et respawn)

- **AdminPanelWOM** : `adminPanel.shared.tsx` extrait GroupedSection, EntitySection,
  useDraft, usePagination, InstanceAction des composants partagés. `AdminPanel.tsx`
  refactorisé pour importer depuis shared. `AdminPanelWOM.tsx` pipeline WOM pour
  ressources (instances + templates dérivés) et animaux (instances WOM, templates REST).
  `DevToolsPanel.tsx` onglet toggle Legacy/WOM.
- **Overlay Creature Spawns corrigé** : `WorldScene.js` — URL relative `/admin/...`
  corrigée en `${VITE_API_URL}/admin/...` avec header `Authorization`. Fallback
  `spawnX/spawnY` legacy dans `resolveWomScreen` de `DevToolsOverlayManager.js`.
- **Resource templates enrichis** : `admin:update_resource_template` accepte
  `respawnDelayMs`. `AdminPanelWOM` ajoute `respawnDelayMs` dans groupFields,
  `lootPoolItems` en lecture seule. `_admin-panel.scss` règle `.admin-panel__info-line`.
- **Resource instances enrichies** : `wosToResourceInstances` expose `worldX/Y/mapId`
  et `respawnAt`. `getInstanceInfoLine` + `formatRespawnAt()`. Bouton "Reset template"
  via `instanceActions`. `GroupedSectionConfig` étendu avec `getGroupInfoLine`,
  `getInstanceInfoLine`, `instanceActions`, `InstanceActionButton`.
- **`respawnAt` dans Resource WorldObjects** : `ResourceMetadata.respawnAt: Date | null`.
  2 tests adapter. Type frontend `WorldObject.metadata.respawnAt?: string | null`.
- **Cycle respawn resource corrigé** : `buildResourceBroadcast()` dans
  `ResourcesService` — payload complet (`type`, `x`, `y`, `worldX`, `worldY`, `mapId`)
  utilisé dans `armRespawnTimer`, `forceRespawn`, `resetInstanceFromTemplate`.
  Cause : le client supprime le sprite à `dead` ; sans position/type au respawn,
  la garde `x !== undefined` empêchait `upsertResource` de recréer le sprite.
  Tests : 51 `resources.service.spec.ts` (2 nouveaux sur payload).

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
