# STATUS — MMORPG Project

_Dernière mise à jour : 2026-06-21_
_Session : 2026-06-21_
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

- **ADR-0002** : système de coordonnées monde défini (Draft/Proposed) —
  hiérarchie World → Map → Chunk → Tile, `CHUNK_SIZE=64`, coordonnées officielles
  `mapId / worldTileX / worldTileY`, formules de projection isométrique client,
  responsabilités serveur / client / Tiled. Questions ouvertes : type de stockage,
  migration, unités des vitesses et distances.
- **Documentation coordonnées** : `phaser-world.md` (section Coordinate systems),
  `maps-and-collisions.md`, `chunks.md` mis à jour pour documenter la dette de
  conversion et la distinction entre espaces logique / tile / pixel.
- **WorldScene.js** : commentaire tilemap simplifié, constantes renommées
  `TILEMAP_TEST_OFFSET_X / TILEMAP_TEST_OFFSET_Y` — offset clairement marqué
  comme temporaire.
- **Pipeline graphique isométrique** : workspace `apps/client/src/assets/source/`
  créé avec templates GIMP, masques PNG, vecteurs SVG (`iso_diamond.svg`), guides
  et documentation de pipeline (`art-direction.md`).
- **Format Tiled officiel** : décision d'architecture — maps en TMJ, tilesets en TSX,
  aucun convertisseur autorisé. Documenté dans `docs/05_World/tiled.md`.
- **Tilemap terrain test** : `terrain_pipeline_test.tmj` intégré dans Phaser
  (`public/assets/maps/`), tileset `grass` inliné, chargement via `tilemapTiledJSON`.
  Layer chargé dynamiquement (`map.layers[0].name`) pour résister aux renommages Tiled.
- **Correction SCSS** : `lighten()` déprécié remplacé par `color.adjust()` dans
  `_admin-panel.scss`.

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
| Tests | 15 tests Jest `AnimalsService` (verts) |

---

## Décisions et règles à ne pas oublier

- **Système de coordonnées (ADR-0002, Draft/Proposed)** : coordonnées officielles
  `mapId / worldTileX / worldTileY` (unité = 1 tile). `CHUNK_SIZE = 64`. Projection
  isométrique cliente uniquement. Pixels jamais persistés. Questions ouvertes : type
  de stockage, migration, unités des constantes gameplay — voir
  `docs/01_Architecture/adr/ADR-0002-world-coordinate-system.md`.
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

- **Coordonnées** : entités serveur encore en unités pixel-équivalentes ; migration
  vers `worldTileX/worldTileY` (ADR-0002) non encore implémentée. Type de stockage
  et facteur de conversion non décidés.
- **Offset tilemap** : `TILEMAP_TEST_OFFSET_X = 936` temporaire dans `WorldScene.js` —
  à remplacer par l'origin par-map défini dans ADR-0002 après validation.
- `server.emit` broadcast global — prévoir rooms/zones à la montée en charge.
- Pathfinder peut échouer si un animal est sur une tuile bloquante (contournement actuel : steering direct).
- Un seul `RespawnPoint` hardcodé (x=600, y=300) ; pas d'UI de gestion.
- `synchronize: true` — migrations TypeORM à prévoir pour la prod.
- Sprite goblin utilise `textureKey: 'turkey'` en placeholder.
- Le tileset grass ne contient qu'une seule tuile (tilecount=1) — variété visuelle
  à construire avec d'autres tiles.
- `assets/source/work/`, `tests/`, `exports/` gitignorés — la tuile grass validée
  est dans `public/assets/maps/tilesets/grass_01.png`.

---

## Prochaines priorités possibles

- [ ] Valider ADR-0002 (approbation humaine) puis implémenter la migration de coordonnées
- [ ] Autres tuiles terrain (chemins, eau, transition herbe/terre…)
- [ ] Import sprite goblin (textureKey propre)
- [ ] Système de loot sur les animaux tués
- [ ] Barre de vie des joueurs distants (envoyer HP dans `player_moved`)
- [ ] Dégâts au joueur visibles (animation flash, son)
- [ ] Zones / rooms Socket.IO pour limiter les broadcasts
- [ ] Autres types d'animaux (loup, sanglier…)
- [ ] Section Décor dans le panneau admin
- [ ] Migrations TypeORM pour la prod
- [ ] Audit log des actions admin

---

## Documents potentiellement impactés

Cette liste indique les documents à vérifier après une session de code. Elle ne signifie pas qu'ils doivent tous être modifiés.

- [ ] `docs/05_World/chunks.md` — à mettre à jour après validation ADR-0002
- [ ] `docs/05_World/maps-and-collisions.md` — à mettre à jour après validation ADR-0002
- [ ] `docs/03_Client/phaser-world.md` — à mettre à jour après validation ADR-0002
- [ ] `docs/04_Server/websockets.md` — payloads `mapId/worldTileX/worldTileY` à documenter
- [ ] `docs/06_Database/schema.md` — après décision du type de stockage

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

### 2026-06-21

- ADR-0002 créé (Draft/Proposed) : système de coordonnées monde tile-first,
  `CHUNK_SIZE=64`, formules de projection isométrique, responsabilités par couche.
- Relecture ADR-0002 : contradiction option B / question ouverte corrigée.
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
