# STATUS — MMORPG Project

_Dernière mise à jour : 2026-06-22_
_Session : 2026-06-22_
_Branche : main_
_État : développement local_

---

## État général

Backend NestJS + PostgreSQL opérationnels. Frontend React/Vite + Phaser connecté
via Socket.IO. Combat animal complet. Panneau admin fonctionnel avec console de
commandes, hiérarchie deux niveaux (template → instances), drag-and-drop vers la
map, suppression d'entités et vue d'ensemble temps réel (joueurs connectés,
personnages enregistrés, animaux actifs, templates, spawns).

---

## Derniers changements importants

- **`updatePlayer()` WU-first** : `player_move` convertit désormais les pixels en WU
  en priorité (`isoScreenToWorldWU`) ; `player.x/y` ne sont mis à jour que si la
  conversion réussit. Garde-fous NaN/Infinity : position conservée sans mutation.
  16 tests (`world.service.spec.ts`).
- **`teleportCharacter()` double-écriture** : DB écrit `positionX/Y` + `worldX/Y/mapId`
  (conditionnel sur validité de la conversion WU). Bug CRITIQUE soldé (`b751bad`).
- **Migration WU — world.service.ts** : `ConnectedPlayer` porte `worldX/worldY/mapId`
  (vérité serveur) + `x/y` (cache pixel Phaser). Toutes les fonctions runtime migrées :
  `joinPlayer`, `updatePlayer`, `persistPlayerPosition`, `respawnCharacter`, `teleportCharacter`.
- **Infrastructure WU** : `world-coordinates.ts`, `world-position.adapter.ts` (32 tests),
  `wu-backfill-report.ts` (36 tests), scripts `wu:dry-run` / `wu:backfill`.
- **Audit WU** : `docs/01_Architecture/wu-migration-audit.md` — état complet de la
  migration, checklist ordonnée.

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
| Tests | 15 tests `AnimalsService` + 32 `world-position.adapter` + 36 `wu-backfill-report` + 16 `world.service` (198/199 verts — 1 préexistant KO sans lien WU) |
| Migration WU | `world.service.ts` entièrement migré (joinPlayer, updatePlayer, persist, respawn, teleport) ; scripts backfill prêts (anomalies OUT_OF_MAP_BOUNDS à corriger avant exécution) |

---

## Décisions et règles à ne pas oublier

- **Système de coordonnées WU** : `1 tile = 1024 WU`, `CHUNK_SIZE=64`,
  `CHUNK_SIZE_WU=65536`, `DEFAULT_MAP_ID=1`. Projection isométrique :
  `screenX = 1000 + (worldX − worldY) / 16`, `screenY = (worldX + worldY) / 32`.
  Inverse : `worldX = 8*(sx−1000) + 16*sy`, `worldY = −8*(sx−1000) + 16*sy`.
  Pixels jamais persistés comme vérité (double-écriture = transitoire).
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

- **[CRITIQUE] `animals.service.ts` entièrement en pixels** : boucle IA/combat complète
  (aggro, patrol, pursuit, escape, leash, MELEE_RANGE=60, patrolRadius, aggroRadius)
  non migrée vers WU. Bloc le plus large restant.
- **[CRITIQUE] Anomalies OUT_OF_MAP_BOUNDS** : entités avec pixel(140, 365) → WU(-1040, 12720)
  (worldX < 0). Bloquent l'exécution du backfill réel.
- **[CRITIQUE] `resources.gateway.ts` range check en pixels** : `RESOURCE_INTERACT_RANGE=100`
  px + `Math.hypot` — anti-cheat gathering non migré.
- **[IMPORTANT] Animaux — worldX/Y jamais écrits au runtime** : colonnes présentes mais
  non maintenues par `animals.service.ts` (mouvements, respawns).
- **[IMPORTANT] `client.data.player` sans worldX/Y** : `AnimalsGateway` et
  `ResourcesGateway` utilisent `player.x/y` (pixels) pour les range checks.
- **[IMPORTANT] `RespawnPoint.radius` en pixels** : drift de respawn en pixels ;
  `legacyRadiusToWU()` disponible dans `legacy-pixel-position.adapter.ts`.
- **Offset tilemap** : `TILEMAP_TEST_OFFSET_X = 936` temporaire dans `WorldScene.js`.
- `server.emit` broadcast global — prévoir rooms/zones à la montée en charge.
- Pathfinder peut échouer si un animal est sur une tuile bloquante.
- `synchronize: true` — migrations TypeORM à prévoir pour la prod.
- Sprite goblin utilise `textureKey: 'turkey'` en placeholder.
- Le tileset grass ne contient qu'une seule tuile — variété visuelle à construire.

---

## Prochaines priorités possibles

### Migration WU (en cours)
- [x] Fix `teleportCharacter()` double-écriture (`b751bad`)
- [x] `updatePlayer()` WU-first + garde-fous NaN/Infinity (`9bdd4b3`)
- [ ] Corriger les anomalies OUT_OF_MAP_BOUNDS (entités hors [0, 65536)) puis `npm run wu:backfill`
- [ ] Migrer `animals.service.ts` vers WU (aggroRadius, patrolRadius, MELEE_RANGE, Math.hypot → chebyshev)
- [ ] Double-écriture animaux : `worldX/Y/mapId` dans les `animalRepository.update()`
- [ ] Migrer `resources.gateway.ts` : `RESOURCE_INTERACT_RANGE` + range check en WU
- [ ] Exposer `worldX/Y/mapId` dans `client.data.player`
- [ ] Migrer `player_move` client→serveur vers `{ worldX, worldY, direction }`

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

- [ ] `docs/04_Server/websockets.md` — documenter les payloads WU (`world_joined` inclut `worldX/Y/mapId`)
- [ ] `docs/06_Database/schema.md` — colonnes WU ajoutées aux 5 entités (character, animal, resource, creature_spawn, respawn_point)
- [ ] `docs/05_World/chunks.md` — après validation ADR-0001
- [ ] `docs/05_World/maps-and-collisions.md` — après validation ADR-0001
- [ ] `docs/03_Client/phaser-world.md` — après migration protocole player_move

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

### 2026-06-22

- **`updatePlayer()` WU-first** : pixels → WU en priorité, x/y mis à jour seulement
  si conversion réussit, garde-fous NaN/Infinity. 16 tests (`world.service.spec.ts`).
- **`teleportCharacter()` double-écriture** : bug CRITIQUE soldé — DB écrit désormais
  `positionX/Y` + `worldX/Y/mapId` sur téléportation.
- **STATUS.md** mis à jour.

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
