# Maps and Collisions

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/01_Architecture/client-server-boundaries.md, docs/03_Client/phaser-world.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes map files, collision files, client movement, Phaser collision behavior, server movement handling, and verified or unverified mobility rules.

It covers `world.json`, `collisions.json`, map helper code, pathfinding helper code, active Phaser movement, server-side position handling, and trust boundaries.

It does not define a new authoritative map or collision system.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: present in static files or project layout.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

Maps and collisions shape how the world is displayed and how the official client can guide movement. They must not become gameplay authority only because they are loaded by the browser.

The current repository contains map-related files and helper code, but a complete authoritative server map, server collision model, and server movement correction flow were Not verified.

## Map overview

The active `WorldScene` renders a direct Phaser scene with a green background, a `2000` by `2000` world bound, a campfire image, player sprites, remote player sprites, resources, creatures, labels, and bars.

`terrain_pipeline_test.tmj` is the first active tilemap. It is a 64×64 isometric grass map rendered in `WorldScene` with `TILEMAP_TEST_OFFSET_X = 936` to center the north vertex of the isometric diamond at world x=1000. This offset is a **temporary display alignment for the terrain pipeline test**. It does not represent a final world coordinate system.

Server logical coordinates (stored in `WorldService` memory and the database) are numeric `x`, `y` values. Sprites use these values directly as Phaser pixel positions. The isometric tilemap uses tile column and row converted to screen pixels via the origin offset. These two coordinate spaces are not aligned. A conversion layer between server coordinates, tile coordinates, and Phaser screen coordinates must be defined before the tilemap can serve as a production world layer.

Other static map files exist under `apps/client/public/assets/maps`, and helper files exist under `apps/client/src/phaser/world`. Active tilemap rendering from `world.json` was not observed.

`apps/client/public/assets/maps/world.json` exists but is empty.

## Map file inventory

| File or path | Format | Loaded by | Purpose | Status |
|---|---|---|---|---|
| `apps/client/public/assets/maps/terrain_pipeline_test.tmj` | Tiled TMJ (native JSON) | `PreloadScene` via `tilemapTiledJSON`; rendered in `WorldScene` | Terrain pipeline test — 64×64 isometric grass map | Implemented |
| `apps/client/public/assets/maps/tilesets/grass_01.png` | PNG image, 128×64 px | `PreloadScene` via `load.image("tileset_grass", ...)` | Grass tile texture for terrain pipeline test | Implemented |
| `apps/client/public/assets/maps/world.json` | JSON file, currently empty | No active loader observed | Possible exported map placeholder | Not verified |
| `apps/client/public/assets/maps/Grass_03_64w.webp` | WebP image | No active loader observed | Possible map or tileset image | Not verified |
| `apps/client/src/phaser/world/tiles.tsx` | Tiled TSX XML descriptor | No active import observed | Tileset descriptor named `tiles`, tile size 32x32 | Not verified |
| `apps/client/src/phaser/world/tileset_spawn.tsx` | Tiled TSX XML descriptor | No active import observed | Tileset descriptor named `tileset_spawn`, tile size 64x64 | Not verified |
| `apps/client/src/phaser/world/MapLoader.js` | JavaScript helper | No active `WorldScene` use observed | Helper to create tilemaps, tilesets, layers, and collisions | Implemented / Not verified |

## Collision data inventory

| Collision source | Location | Consumer | Authority level | Status |
|---|---|---|---|---|
| Public collision JSON | `apps/client/public/assets/maps/collisions.json` | No active consumer observed | Client file only; not authoritative | Not verified |
| Phaser map collision JSON | `apps/client/src/phaser/world/collisions.json` | `MapLoader` imports it | Client helper data only; not authoritative | Implemented / Not verified |
| Phaser world bounds | `WorldScene` physics and camera bounds | Phaser physics and camera | Client visual and local physics constraint only | Implemented / Not verified |
| Player body hitbox | `Player.setupPhysics` | Phaser Arcade body | Client local physics body only | Implemented |
| Pathfinder grid values | `Pathfinder` class comments and logic | `PlayerController` if `scene.pathfinder` exists | Client pathing only | Implemented / Not verified |
| Server authoritative collision map | No file or service verified | None observed | Not available as verified authority | Not verified |

## Client loading

`PreloadScene` loads player, resource, creature, campfire, and item images. It does not load `world.json`, `Grass_03_64w.webp`, `collisions.json`, or tileset descriptors in the inspected active code.

`MapLoader` can create a Phaser tilemap from a cache key, add a tileset named `tiles`, apply collision indexes from local `collisions.json`, and create layers by name. Active use of `MapLoader` from `WorldScene` was Not verified.

`PlayerController` checks for `scene.pathfinder`. If absent, it logs a warning and falls back to direct movement.

## Phaser collision behavior

Observed Phaser-side behavior:

- `WorldScene` sets physics world bounds and camera bounds to `2000` by `2000`.
- `Player` uses an Arcade body with a small hitbox and `setCollideWorldBounds(true)`.
- Pointer click movement can use pathfinding only if `scene.pathfinder` exists.
- Pointer drag and auto-attack pursuit use direct steering.
- No active `physics.add.collider` between the player and tile layers was observed.
- Active Tiled layer collision in `WorldScene` was Not verified.

These behaviors are client-side only. They can improve local feel, but they do not prove gameplay-valid movement.

## Server authority

The server verifies ownership during world join and uses persisted character position when available. It stores live player position in server memory after `player_move` events and persists position on disconnect and admin teleport.

Resource interaction checks use server-side connected-player position, resource position, range, resource state, and movement tolerance during gathering. Creature attack and creature AI use server-side connected-player position for range and combat behavior.

No authoritative server map, server collision grid, blocked-zone model, or server-side tile property validation was verified.

## Movement validation

| Validation area | Client behavior observed | Server validation observed | Gap | Status |
|---|---|---|---|---|
| World join | Client emits character id, name, sex, position, and direction | Server loads character and checks ownership; persisted position is preferred | Chunk or collision assignment during join is Not verified | Implemented / Not verified |
| Normal movement payload | Client emits rounded `x`, `y`, and direction at most every 80 ms when changed | Server checks numeric `x` and `y`, then updates live memory | Speed, elapsed time, distance, and collision validation are Not verified | Not verified |
| World bounds | Client physics bounds are `2000` by `2000` | Server-side bounds validation was not observed | A modified client may report out-of-bounds coordinates unless server rejects them | Not verified |
| Click pathing | Client may use pathfinder if present, otherwise direct target movement | No path acceptance validation was observed | Path validity is client-only | Not verified |
| Drag steering | Client moves directly toward pointer | Server movement correction was not observed | Direct movement validity is Not verified | Not verified |
| Resource range | Client selects visible resource target | Server checks joined player position and resource range | Collision between player and resource is Not verified | Implemented / Not verified |
| Creature attack range | Client emits attack target id during auto-attack | Server checks character, target, cooldown, health, and range | Collision and line-of-sight are Not verified | Implemented / Not verified |
| Admin teleport | Client admin command can submit coordinates | Server role check and target lookup paths exist; destination policy is Not verified | Collision or forbidden destination policy is Not verified | Implemented / Not verified |

## Mobility rules

| Mobility rule | Source | Enforced by client? | Enforced by server? | Status |
|---|---|---|---|---|
| Player local speed `100` | `Player.speed` | Yes, in official client movement | Not verified for normal movement payloads | Implemented / Not verified |
| Movement sync interval `80` ms | `WorldScene.syncLocalPlayer` | Yes, in official client | Server frequency limit is Not verified | Implemented / Not verified |
| World bounds `2000` by `2000` | `WorldScene` | Yes, via Phaser world bounds | Server-side bounds check is Not verified | Implemented / Not verified |
| Player hitbox `20` by `16` | `Player.setupPhysics` | Yes, local Phaser body | Not relevant as server authority unless mirrored server-side; not verified | Implemented / Not verified |
| Pathfinder tile size `32` | `PlayerController` and `MapLoader` | Only if pathfinder exists on scene | No server use verified | Implemented / Not verified |
| Collision indexes `[1..16]` | `apps/client/src/phaser/world/collisions.json` | Only through helper path; active use Not verified | No server use verified | Not verified |
| Public collision indexes `[1..5]` | `apps/client/public/assets/maps/collisions.json` | No active use observed | No server use verified | Not verified |
| Walkable grid `0` and blocked grid `1` | `Pathfinder` helper | Only if provided grid is wired | No server use verified | Implemented / Not verified |
| Blocked zones | No active zone model observed | Not verified | Not verified | Not verified |

## Tiled properties

Tiled descriptor files exist under `apps/client/src/phaser/world`, but no custom Tiled properties such as `walkable` were observed in those descriptors during inspection.

`Pathfinder` uses a grid convention where `0` means walkable and `1` means blocked, but active generation of that grid from Tiled data was Not verified.

Tiled property extraction, map export validation, and synchronization between Tiled properties and server-side mobility rules are Not verified.

## Security boundaries

The client map is not trustworthy. Client collision data is not trustworthy. A user can modify browser-loaded files, local assets, cached JSON, Phaser state, movement code, or emitted Socket.IO payloads.

Modifying `world.json`, `collisions.json`, a tileset descriptor, a Tiled property, or any local collision helper must not allow a player to cross a forbidden area.

Phaser collisions are not gameplay authority. Client pathfinding is not gameplay authority. The server must validate or correct sensitive movement, forbidden locations, interaction range, combat range, loot access, and admin movement effects.

Because an authoritative server map was not verified, server-side map authority is marked Not verified.

## Performance considerations

The active scene does not show large tilemap rendering. It uses direct sprite and image objects plus per-frame updates for movement, labels, indicators, and health bars.

Performance of a large map, active tile layers, collision layers, pathfinding grids, map chunking, and collision tests under load is Not verified.

## Verified behavior

- `world.json` exists and is empty.
- Public and Phaser-local `collisions.json` files exist.
- `MapLoader` imports local collision indexes and can apply them to a Phaser tilemap.
- Active `WorldScene` does not show verified `MapLoader` use.
- `WorldScene` sets client world and camera bounds to `2000` by `2000`.
- `Player` uses a local Arcade body and local world-bound collision.
- `PlayerController` can fall back to direct movement when no pathfinder exists.
- The server checks ownership on world join.
- The server stores live player positions from movement payloads.
- Resource and creature systems use server-side positions for range checks.

## Known gaps

- Authoritative server map: Not verified.
- Server-side collision validation: Not verified.
- Server-side mobility validation for normal movement: Not verified.
- Speed, distance, and elapsed-time validation: Not verified.
- Anti-teleport for normal movement: Not verified.
- Client correction after invalid movement: Not verified.
- Synchronization between client and server collision data: Not verified.
- Collision tests: Not verified.
- Final Tiled pipeline: Not verified.
- Large-map performance: Not verified.
- Active tilemap rendering: Implemented for terrain pipeline test (`terrain_pipeline_test.tmj`). Production world map: Not verified.
- Coordinate conversion between server logical coordinates, tile coordinates, and Phaser screen coordinates: Not verified.

## Review checklist

- [ ] Client maps are treated as display or prediction data only.
- [ ] Client collisions are treated as non-authoritative.
- [ ] New movement rules have server-side validation.
- [ ] New collision rules have server-side validation if gameplay-sensitive.
- [ ] Pathfinding remains a client aid unless mirrored by server authority.
- [ ] Forbidden-zone handling includes server correction or rejection.
- [ ] Map file changes are reviewed for runtime loading impact.
- [ ] Tiled property changes do not create hidden server assumptions.
- [ ] This document is validated before moving to `Review`.

## Non-goals

- This document does not define the final map pipeline.
- This document does not define a server collision engine.
- This document does not define chunking or sharding.
- This document does not define visual art direction.
- This document does not document secret values.
- This document does not replace movement or collision tests.

## Security notes

Never document real credentials, tokens, passwords, hashes, private user data, or copied environment values.

Treat every movement coordinate and every client-side collision result as user-controlled input. The server must own sensitive outcomes before movement and collision rules can be considered authoritative.

## Performance notes

Before enabling full tilemaps or larger maps, review tile layer count, collision layer count, pathfinding grid size, entity count, camera view size, and update frequency. Current large-map performance is Not verified.

## Related files

- [Documentation Index](../README.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Phaser World](../03_Client/phaser-world.md)
- [Server WebSockets](../04_Server/websockets.md)
- [World Assets](assets.md)
- [Chunks](chunks.md)
- [Tiled](tiled.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should `WorldScene` actively load a Tiled map, or should the current direct-object scene remain the default?
- Should the server build its own authoritative mobility grid?
- Should server movement validation include max speed, elapsed time, world bounds, and collision checks?
- Should `world.json` be removed, populated, or kept as a placeholder?
- Should collision data be generated from Tiled exports or maintained separately?
- How should the client be corrected when it reports a forbidden position?

## TODO

- [ ] Verify or define authoritative server map data.
- [ ] Verify or add server-side movement bounds, speed, and collision validation.
- [ ] Verify active use or removal plan for `world.json`.
- [ ] Verify active use or removal plan for both collision JSON files.
- [ ] Verify final Tiled export and collision pipeline.
- [ ] Add or verify tests for movement and collision rules.
