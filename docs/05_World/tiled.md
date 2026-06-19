# Tiled

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-19
- Depends on: docs/README.md, docs/05_World/maps-and-collisions.md, docs/03_Client/phaser-world.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes Tiled format decisions, observed Tiled-related files, exported map or tileset artifacts, Phaser integration points, collision data, asset workflow gaps, and server authority implications.

## Official format decisions

These decisions are final and apply to all maps and tilesets in this project.

| Asset type | Official format | Extension | Notes |
|------------|----------------|-----------|-------|
| Maps | Tiled Map JSON | `.tmj` | Native Tiled JSON format — saved directly from Tiled |
| Tilesets | Tiled Tileset XML | `.tsx` | Native Tiled tileset format |

Rules:
- No custom TMX → JSON converters exist or are allowed in this project.
- No project-generated JSON map files are allowed.
- Maps are authored in Tiled and saved as TMJ.
- TMJ files for runtime use are placed in `apps/client/public/assets/maps/`.
- TSX files are Tiled authoring artifacts; Phaser does not load them at runtime.
- Tileset images are placed in `apps/client/public/assets/maps/tilesets/`.
- Phaser loads TMJ files via `this.load.tilemapTiledJSON()` and tileset images via `this.load.image()`.

Tileset name resolution: when a TMJ references an external TSX tileset, Phaser uses the basename of the source filename as the tileset name. For `"source": "grass.tsx"`, the name is `"grass"`. Pass this name to `map.addTilesetImage('grass', phaserTextureKey)`.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: present as a static file or project layout.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

Tiled can be used as a content authoring tool for maps, tilesets, layers, and custom properties. In this project, Tiled-related files exist, but the active world scene was not verified to render a Tiled map.

This document prevents a common mistake: treating a client-exported Tiled file as gameplay authority.

## Tiled overview

Observed Tiled-related files:

- `apps/client/src/phaser/world/tiles.tsx`;
- `apps/client/src/phaser/world/tileset_spawn.tsx`;
- `apps/client/public/assets/maps/world.json`;
- `apps/client/public/assets/maps/Grass_03_64w.webp`;
- `apps/client/public/assets/maps/collisions.json`;
- `apps/client/src/phaser/world/collisions.json`;
- `apps/client/src/phaser/world/MapLoader.js`.

These files show that Tiled-style assets and helpers are present. A complete active Tiled map pipeline was Not verified.

## Project usage

The active `WorldPage.jsx` creates a Phaser game with `PreloadScene` and `WorldScene`. `PreloadScene` loads direct image assets but does not load observed Tiled map files in the inspected code.

`WorldScene` renders direct Phaser objects rather than an observed Tiled tilemap. `MapLoader` exists as a helper that can create a tilemap, add a tileset named `tiles`, set collision indexes, and create layers.

Active `MapLoader` use from `WorldScene` was Not verified.

## Map orientation and tile size

The observed TSX tileset descriptor `tiles.tsx` declares tile width and height of `32`.

The observed TSX tileset descriptor `tileset_spawn.tsx` declares tile width and height of `64`.

`MapLoader` uses `tileSize = 32`. `PlayerController` also uses `32` as the tile size when converting player and target coordinates for pathfinding.

Final map orientation, final tile size, final multi-tileset strategy, and active use of the `64` tile descriptor are Not verified.

## Layers and properties

| Layer or property | Purpose | Consumer observed | Authority level | Status |
|---|---|---|---|---|
| Tiled layer names passed to `createFullMap` | Create Phaser layers by supplied names | `MapLoader.createFullMap` helper only | Client rendering helper, not gameplay authority | Implemented / Not verified |
| Tileset name `tiles` | Match Tiled tileset name when adding image | `MapLoader.loadMap` expects it | Client rendering helper, not gameplay authority | Implemented / Not verified |
| Collision tile indexes | Mark blocking tile indexes in helper setup | `MapLoader.setupCollisions` imports local collision JSON | Client collision helper, not gameplay authority | Implemented / Not verified |
| `walkable` property | Possible mobility property | No property observed in inspected TSX files | Not authoritative; not implemented | Not verified |
| Spawn tileset descriptor | Possible spawn-related tileset | No active consumer observed | Not authoritative | Not verified |
| Object layers | Possible entities or collision objects | No active object-layer consumer observed | Not authoritative unless server rebuilds it | Not verified |

## Exported files

| Exported file | Format | Produced by | Consumed by | Status |
|---|---|---|---|---|
| `apps/client/src/phaser/world/tiles.tsx` | TSX XML tileset descriptor | Tiled or compatible editor is implied by file format; exact export step Not verified | No active import observed | Not verified |
| `apps/client/src/phaser/world/tileset_spawn.tsx` | TSX XML tileset descriptor | Tiled or compatible editor is implied by file format; exact export step Not verified | No active import observed | Not verified |
| `apps/client/public/assets/maps/world.json` | JSON map file, currently empty | Export source Not verified | No active loader observed | Not verified |
| `apps/client/public/assets/maps/Grass_03_64w.webp` | WebP image | Export or asset source Not verified | No active loader observed | Not verified |
| `apps/client/public/assets/maps/collisions.json` | JSON array | Export or manual source Not verified | No active consumer observed | Not verified |
| `apps/client/src/phaser/world/collisions.json` | JSON array | Export or manual source Not verified | `MapLoader` imports it | Implemented / Not verified |

## Integration with Phaser

`MapLoader` shows the intended integration shape:

- create a tilemap from a cache key;
- add a tileset image using the Tiled tileset name `tiles`;
- set collision indexes from local collision JSON;
- create named layers;
- return map, tileset, and layer objects.

However, `PreloadScene` does not show active map JSON or tileset image preloading, and `WorldScene` does not show active `MapLoader` usage in the inspected code.

Current active Phaser world behavior is therefore direct scene rendering, not verified Tiled map rendering.

## Collision and mobility data

Two collision JSON files are present:

- `apps/client/public/assets/maps/collisions.json` contains a short array of tile indexes.
- `apps/client/src/phaser/world/collisions.json` contains a larger array and is imported by `MapLoader`.

`Pathfinder` uses a grid convention where `0` means walkable and `1` means blocked. Generation of that grid from Tiled exports was Not verified.

No server-side conversion from Tiled exports to authoritative mobility data was verified.

## Server authority implications

Tiled is an authoring tool, not runtime authority. Tiled exports stored on the client are modifiable by the user.

Phaser can use Tiled data for rendering, local collision, and local path prediction. Those uses must remain client-side aids unless a server-owned representation is built and verified.

If collisions or mobility become gameplay-sensitive, the server must possess, generate, or reconstruct its own authoritative representation. No exported client file should be used as proof that a player has a right to enter an area, cross a tile, receive loot, attack a target, or submit a valid movement.

The authoritative server map, server collision validation, and conversion from Tiled data to server data are Not verified.

## Asset workflow

| Workflow step | Tool or file | Output | Verified? | Status |
|---|---|---|---|---|
| Tileset descriptor export | `tiles.tsx` | TSX descriptor with `32` by `32` tiles | Partially; file exists | Configured / Not verified |
| Spawn tileset descriptor export | `tileset_spawn.tsx` | TSX descriptor with `64` by `64` tiles | Partially; file exists | Configured / Not verified |
| Map JSON export | `world.json` | Empty JSON file | File exists but usable export is Not verified | Not verified |
| Collision export or authoring | `collisions.json` files | Tile-index arrays | File existence verified; source process Not verified | Implemented / Not verified |
| Phaser map loading | `MapLoader.js` | Tilemap, tileset, layers, collision indexes | Helper exists; active scene use Not verified | Implemented / Not verified |
| Server conversion | No converter observed | Server-side map or mobility representation | No | Not verified |
| Automated export pipeline | No script observed in inspected files | Repeatable Tiled export | No | Not verified |
| Map versioning | No policy observed | Map or collision version tracking | No | Not verified |

## Security boundaries

Client-side Tiled exports are untrusted. A user can modify map JSON, tileset descriptors, collision JSON, image files, local Phaser state, and movement payloads.

No client-exported Tiled file should be used as proof of valid movement, valid collision, valid target access, valid loot access, or valid permissions.

If Tiled data becomes the source for mobility rules, a trusted server-side copy or conversion process must be introduced and reviewed. Until then, Tiled data is a client rendering and authoring concern only.

No real secret, token, password, hash, or copied environment value is documented here.

## Verified behavior

- Tiled TSX descriptor files exist under `apps/client/src/phaser/world`.
- `tiles.tsx` declares a `32` by `32` tileset named `tiles`.
- `tileset_spawn.tsx` declares a `64` by `64` tileset named `tileset_spawn`.
- `world.json` exists under public map assets and is empty.
- Collision JSON files exist in public assets and in the Phaser map folder.
- `MapLoader` imports local collision JSON and can apply collision indexes to a Phaser tilemap.
- Active Tiled map rendering in `WorldScene` was not verified.
- Server-side authority derived from Tiled data was not verified.

## Known gaps

- Final Tiled pipeline: Not verified.
- Automated export: Not verified.
- Conversion to server-side data: Not verified.
- Server validation of collisions from Tiled: Not verified.
- Chunks generated from Tiled: Not verified.
- Map/collision consistency tests: Not verified.
- Multi-map strategy: Not verified.
- Map versioning: Not verified.
- Active use of `world.json`: Not verified.
- Active use of TSX descriptor files: Not verified.

## Review checklist

- [ ] Tiled exports are treated as client assets unless server conversion is verified.
- [ ] Custom properties are documented only after inspection.
- [ ] Tile size and orientation are backed by files or marked `TBD`.
- [ ] Collision data is not treated as authoritative on the client.
- [ ] Server mobility rules are reviewed before gameplay-sensitive use.
- [ ] Automated export and validation are reviewed before relying on Tiled data.
- [ ] Unused exports have a retention or cleanup decision.
- [ ] Map and collision changes do not document secrets or private paths.
- [ ] This document is validated before moving to `Review`.

## Non-goals

- This document does not teach Tiled usage.
- This document does not define a final editor workflow.
- This document does not define server-side map storage.
- This document does not define chunk generation.
- This document does not define visual map content.
- This document does not replace map or collision tests.

## Security notes

Keep Tiled documentation limited to file paths, formats, observed behavior, and trust boundaries. Do not document real credentials, tokens, passwords, hashes, private user data, or copied environment values.

Treat all browser-available Tiled exports as modifiable. The server must own sensitive movement and collision decisions before those decisions affect gameplay.

## Performance notes

Large Tiled maps can increase preload time, memory usage, collision processing, and pathfinding cost. Current large-map behavior, layer count limits, chunking, and cache strategy are Not verified.

## Related files

- [Documentation Index](../README.md)
- [Maps and Collisions](maps-and-collisions.md)
- [World Assets](assets.md)
- [Chunks](chunks.md)
- [Phaser World](../03_Client/phaser-world.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should `world.json` be replaced by a proper TMJ export or removed?
- Should TSX descriptors remain in `src/phaser/world` or be kept only as Tiled project files outside the runtime tree?
- Should collision indexes be generated from Tiled properties or maintained manually?
- Should the server receive a generated authoritative map representation?
- Should map versioning be tied to asset versioning or a separate world-data version?
- Should multi-map or chunk exports be introduced before larger worlds are built?

## TODO

- [ ] Verify or define the final Tiled export pipeline.
- [ ] Verify active use or removal plan for `world.json`.
- [ ] Verify active use or removal plan for TSX descriptor files.
- [ ] Verify collision data source and consistency checks.
- [ ] Add or verify server-side conversion before using Tiled data for gameplay authority.
- [ ] Add or verify tests for map and collision consistency.
