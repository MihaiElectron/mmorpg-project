# Phaser World

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/01_Architecture/client-server-boundaries.md, docs/01_Architecture/realtime-socketio.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the Phaser world client observed under `apps/client/src/phaser` and its mounting path through `apps/client/src/pages/WorldPage.jsx`.

It covers Phaser scenes and classes, asset loading, map and collision helper code, player rendering, input, movement, Socket.IO client integration, remote players, resources, creatures, admin-facing world actions, cleanup, and client-side trust limits.

It does not define server architecture or treat client-rendered state as authoritative.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: configured in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

The Phaser world is the browser-side rendering and interaction layer for the game world. It displays the local player, remote players, resources, creatures, health bars, gathering indicators, selected targets, and coordinates.

Phaser can animate and emit intentions. It must not be treated as authority for movement, collision, combat, loot, inventory, or admin effects.

## Phaser world overview

The active world path is created in `WorldPage.jsx` with a Phaser config that includes `PreloadScene` and `WorldScene`. `PreloadScene` loads sprite and item assets. `WorldScene` creates the local player, input handlers, camera, socket listeners, resource sprites, creature sprites, remote player sprites, and interaction targets.

A separate `phaser.config.js` and `BootScene` exist, but `WorldPage.jsx` defines its own config and does not import that config in the inspected code.

## Scene inventory

| Scene or Phaser class | File | Main responsibility | Server interaction observed | Status |
|---|---|---|---|---|
| `BootScene` | `phaser/core/BootScene.js` | Minimal boot scene that sets pixel-art related renderer options and starts `PreloadScene` | None observed | Implemented / Not verified |
| `PreloadScene` | `phaser/core/PreloadScene.js` | Show loading progress and load player, resource, creature, and item images | None observed | Implemented |
| `WorldScene` | `phaser/core/WorldScene.js` | Render world entities, register socket listeners, emit join and movement events, handle interactions | Emits and listens through the socket attached by React | Implemented |
| `Player` | `phaser/player/Player.js` | Local player sprite, physics body, speed, direction, and movement helpers | Reads scene socket reference but does not emit directly in inspected code | Implemented |
| `PlayerController` | `phaser/player/PlayerController.js` | Keyboard, pointer, direct steering, and path fallback movement | Movement is later synchronized by `WorldScene` | Implemented |
| `MapLoader` | `phaser/world/MapLoader.js` | Helper for tilemap and collision setup | None observed | Implemented / Not verified |
| `Pathfinder` | `phaser/utils/pathfinding.js` | Grid-based client path search helper | None observed | Implemented / Not verified |
| Admin command helpers | `phaser/admin/*.ts` | Parse admin commands and call socket acknowledgement actions | Emits admin socket actions and has an HTTP helper for template update | Implemented |

## Asset loading

| Asset category | Location | Loaded by | Purpose | Status |
|---|---|---|---|---|
| Player sprites | `/assets/player/player_male_32x64.png`, `/assets/player/player_female_32x64.png` | `PreloadScene` | Local and remote player rendering | Implemented |
| Resource sprite | `/assets/sprites/dead_tree.png` | `PreloadScene` | Resource rendering fallback and tree resource display | Implemented |
| Static world sprite | `/assets/sprites/fire_camp.png` | `PreloadScene` | Campfire visual in `WorldScene` | Implemented |
| Creature sprite | `/assets/bestiary/turkey_32.png` | `PreloadScene` | Creature rendering fallback and turkey display | Implemented |
| Item sprite | `/assets/images/items/wooden_stick.png` | `PreloadScene` and inventory update paths | Loot or inventory display | Implemented |
| Terrain tilemap | `public/assets/maps/terrain_pipeline_test.tmj` | `PreloadScene` via `tilemapTiledJSON` | Isometric terrain pipeline test | Implemented |
| Grass tileset image | `public/assets/maps/tilesets/grass_01.png` | `PreloadScene` via `load.image("tileset_grass", ...)` | Grass tile texture for terrain test | Implemented |
| Other map assets | `public/assets/maps` and `src/phaser/world` | Helper code exists; active scene loading beyond terrain test is Not verified | Map and collision support | Not verified |

## Map and collision loading

`MapLoader.js` exists and imports local collision data. It can create a tilemap from a cache key, add a tileset, set collision indexes, and create layers.

Active use of `MapLoader` from `WorldScene` was not observed. `PlayerController` checks `this.scene.pathfinder`; when absent, it falls back to direct movement.

`PreloadScene` loads `terrain_pipeline_test.tmj` and `tileset_grass` as part of the terrain pipeline test. `WorldScene` creates the corresponding isometric tilemap layer at runtime.

Client-side collision data is not authoritative. Modifying client map or collision files must not allow gameplay bypasses.

## Coordinate systems

Server coordinates and Phaser screen coordinates are distinct spaces. Conflating them leads to rendering misalignment.

| Coordinate space | Description | Authority |
|---|---|---|
| Server logical coordinates | Numeric `x`, `y` stored in `WorldService` memory and in the database; used for range checks, interaction, and combat | Server |
| Phaser screen coordinates | Pixel positions in the Phaser 2000×2000 world; used to position sprites and the camera | Client rendering only |
| Tiled isometric coordinates | Tile column and row; Phaser converts them to screen pixels at render time using the tile origin offset | Client rendering only |

The active terrain pipeline test uses `TILEMAP_TEST_OFFSET_X = 936` to center the isometric diamond visually. This is a temporary display offset with no relation to server coordinates. Sprites continue to use server logical coordinates directly as Phaser pixel positions, which causes a visual gap between sprites and tiles.

**Technical debt**: a conversion between server logical coordinates, tile column/row, and Phaser screen position must be defined before the tilemap can be used in a production world. See `docs/05_World/chunks.md` and `docs/05_World/maps-and-collisions.md`.

## Player rendering

The local player is created in `WorldScene.create()` from the character store. The starting coordinates use the loaded character position when present, with fallback coordinates otherwise.

`Player` extends `Phaser.Physics.Arcade.Sprite`, sets a small body hitbox, uses `setCollideWorldBounds(true)`, and stores speed and direction fields. `WorldScene` follows the local player with the camera and updates sprite depth each frame.

Remote players are rendered as tinted sprites with name labels and are tracked in a `remotePlayers` map keyed by character id.

## Player input and movement

| Input or movement behavior | Client behavior observed | Server validation observed from client side | Trust status | Status |
|---|---|---|---|---|
| Keyboard arrows | `PlayerController` sets velocity unless admin console is active | Server validation is not proven from client code | Client intention only | Implemented |
| Pointer click | Short click attempts path calculation if pathfinder exists; otherwise direct target fallback | Server validation is not proven from client code | Client prediction only | Implemented / Not verified |
| Pointer drag | Drag after hold threshold uses direct steering toward pointer | Server validation is not proven from client code | Client prediction only | Implemented |
| Programmatic movement | Auto-attack calls `controller.moveTo` toward creature position | Server validation is not proven from client code | Client intention only | Implemented |
| Movement sync | `WorldScene.syncLocalPlayer` emits rounded position and direction at most every 80 ms when changed | Rejection or correction flow is Not verified from client code | Client-reported movement | Implemented / Not verified |
| World bounds | Phaser physics bounds are set to 2000 by 2000 | Server-side bounds check is Not verified from client code | Visual/client constraint only | Implemented / Not verified |

## Socket.IO integration

| Event or listener | Direction | Phaser responsibility | Server authority implication | Status |
|---|---|---|---|---|
| `connect` | Server to client | Request resources, creatures, and world join after connection | Server must validate socket and later actions | Implemented |
| `get_resources` | Client to server | Ask for current resources | Client request only | Implemented |
| `get_creatures` | Client to server | Ask for current creatures | Client request only | Implemented |
| `join_world` | Client to server | Send character id, name, sex, position, and direction from current client state | Server must validate ownership and accepted state | Implemented |
| `player_move` | Client to server | Send rounded local position and direction when changed | Server must validate sensitive movement effects | Implemented / Not verified |
| `resources` | Server to client | Render current resources | Server data drives display | Implemented |
| `creatures` | Server to client | Render current creatures | Server data drives display | Implemented |
| `resource_loot` | Server to client | Update local character-store inventory display | Display update only; inventory authority is server-side | Implemented |
| `resource_update` | Server to client | Remove depleted resource from scene | Display update only | Implemented |
| `gather_tick` | Server to client | Start or refresh local gathering indicator | Display update only | Implemented |
| `gather_stopped` | Server to client | Stop local gathering indicator | Display update only | Implemented |
| `creature_update` | Server to client | Upsert or remove creature, update action panel health | Display update only | Implemented |
| `current_players` | Server to client | Replace remote player set | Display update only | Implemented |
| `world_joined` | Server to client | Snap local player to accepted position | Server accepted position affects display | Implemented |
| `player_joined` | Server to client | Add remote player | Display update only | Implemented |
| `player_moved` | Server to client | Move remote player sprite | Display update only | Implemented |
| `player_left` | Server to client | Remove remote player | Display update only | Implemented |
| `character_damaged` | Server to client | Update local health and show player health bar | Server event drives display | Implemented |
| `character_teleport` | Server to client | Move local player and center camera | Server event drives display | Implemented |
| `character_respawn` | Server to client | Update health, move local player, reset local health bar | Server event drives display | Implemented |

## Remote players and presence

`WorldScene` tracks remote players in a `Map`. It clears remote players on `current_players`, creates or updates sprites on `player_joined` and `player_moved`, and destroys sprites and labels on `player_left`.

Remote player movement uses short tweens. Remote player labels are repositioned every frame.

Complete reconnect resynchronization and duplicate listener prevention are Not verified.

## Resources and interactions

Resources are rendered from `resources` events when their state is alive. Each resource sprite becomes an interaction target. Pointer clicks select targets and open the action panel through the action panel store.

Resource interaction is triggered from `ActionPanel`, which emits `interact_resource` through the global game socket. `WorldScene` handles `gather_tick`, `gather_stopped`, `resource_loot`, and `resource_update` to update local visuals and local inventory cache.

Exactly-once loot delivery, server rate limiting, and full replay protection are Not verified from client code.

## Creatures and combat display

Creatures are rendered from `creatures` and `creature_update` data. `WorldScene` stores creature sprites in a map, creates optional health bars for fighting or escaping states, and removes dead creatures from the scene.

The action panel can start auto-attack. `WorldScene.startAutoAttack` periodically moves toward the creature and emits `attack_creature` at an observed interval. Server-side cooldown and combat validation are outside the client and must remain authoritative.

Complete anti-spam protection and recovery of combat display after reconnect are Not verified from client code.

## Admin world actions

Admin command helpers parse local command text and emit socket actions such as spawn, teleport, template update, creature move, and respawn. `ActionPanel` and `AdminPanel` use the same command registry.

`WorldScene` records the last clicked world position in the admin store so commands can use it as a coordinate source.

Client-side admin UI and command parsing are not authorization. Server-side role checks and payload validation remain required.

## Client prediction and authority

Phaser may display, predict, animate, and send intentions. Phaser is never authoritative.

Required boundary:

- Phaser-computed positions are client reports, not truth.
- Phaser collisions are not authoritative.
- Client map files and collision files can be modified by a user.
- Modifying assets, map data, or collision data on the client must not allow cheating.
- The server must validate sensitive effects such as movement acceptance, interaction range, combat, loot, inventory, and admin actions.
- Complete server validation of movement, collision, and authoritative map rules remains Not verified from client code.

## Error handling

Observed:

- Missing socket in `WorldScene` logs a warning.
- Missing pathfinder logs a warning and falls back to direct movement.
- Socket acknowledgement helpers return timeout failures after 5000 ms.
- Admin command parsing returns user-facing errors for invalid syntax or unknown commands.
- Some server events silently update or remove local visuals.

Uniform scene-level error UI, reconnect handling, and rollback after rejected movement are Not verified.

## Cleanup and lifecycle

Observed cleanup:

- `WorldPage` destroys the Phaser game on component cleanup.
- `WorldScene.destroy()` removes many socket listeners.
- `WorldScene.destroy()` clears resource, creature, remote player, gather indicator, and player health bar visuals.
- `CoordinatesLayer` clears its interval on unmount.

Not verified:

- Explicit socket disconnect on world page cleanup.
- Cleanup of every socket listener registered in `WorldScene`.
- Cleanup of pointer listeners and auto-attack interval in every destroy path.
- Complete resynchronization after reconnect.

## Security boundaries

- Phaser is an untrusted rendering and input layer.
- Phaser state can be modified by a user.
- Client-side coordinates are not authority.
- Client-side collision checks are not authority.
- Client-side target selection is not authority.
- Client-side command parsing is not authorization.
- Client-side inventory or health display is not authority.
- Sensitive effects must be validated server-side.

No real secret, token, password, or hash is documented here.

## Performance considerations

The active scene updates controller state, local player sync checks, depth, remote labels, gather indicators, player health bar, and creature health bars every frame.

Observed movement sync is throttled to at most one emit every 80 ms when local position or direction changes. Remote movement uses short tweens. Performance with many remote players, resources, creatures, labels, and bars is Not verified.

## Verified behavior

- `WorldPage.jsx` creates the Phaser game and attaches a Socket.IO client.
- `PreloadScene` loads player, resource, creature, and item images.
- `WorldScene` creates the local player and camera.
- `WorldScene` registers socket listeners for world, resources, creatures, and character updates.
- `WorldScene` emits `join_world` and `player_move`.
- `WorldScene` renders resources, creatures, and remote players.
- `ActionPanel` can trigger resource interaction and creature auto-attack paths.
- Admin command helpers emit admin socket actions.
- `WorldScene.destroy()` removes several listeners and destroys multiple visual collections.

## Known gaps

- Complete server movement validation: Not verified.
- Server-side collision validation: Not verified.
- Authoritative server map: Not verified.
- Client correction after server refusal: Not verified.
- Complete reconnect flow: Not verified.
- Complete listener cleanup: Not verified.
- Server frequency limiting: Not verified from client code.
- Scene tests: Not verified.
- Performance with many entities: Not verified.
- Active use of map helper code in `WorldScene`: Not verified.

## Review checklist

- [ ] Phaser remains a rendering and input layer only.
- [ ] Movement and collision changes are reviewed against server-side authority.
- [ ] New socket emissions are documented as intentions.
- [ ] New socket listeners are removed during cleanup.
- [ ] Reconnect behavior is reviewed when listener logic changes.
- [ ] New assets are loaded from stable public paths.
- [ ] Action panel and store interactions remain display/cache only.
- [ ] Admin command UI remains non-authoritative.
- [ ] Performance is reviewed before adding per-frame work.
- [ ] This document is validated before moving to `Review`.

## Non-goals

- This document does not describe backend architecture.
- This document does not define detailed backend route behavior.
- This document does not document database internals.
- This document does not provide full map editor documentation.
- This document does not define complete gameplay mechanics.
- This document does not document real secret values.

## Security notes

Never document real tokens, credentials, passwords, hashes, copied environment values, or private user data.

Any Phaser-emitted action must be treated as user-controlled input. The server must validate sensitive effects even when the official client appears to send reasonable values.

## Performance notes

Per-frame loops, labels, health bars, tweens, maps of sprites, and frequent socket emissions should be reviewed under realistic entity counts. Current large-world performance is Not verified.

## Related files

- [Documentation Index](../README.md)
- [React Vite Client](react-vite.md)
- [Zustand State](zustand-state.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Realtime Socket.IO](../01_Architecture/realtime-socketio.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Server WebSockets](../04_Server/websockets.md)
- [World Assets](../05_World/assets.md)
- [Maps and Collisions](../05_World/maps-and-collisions.md)
- [Tiled](../05_World/tiled.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should `WorldPage` explicitly disconnect the socket during cleanup?
- Should the standalone Phaser config be used by `WorldPage`?
- Should map helper code be wired into `WorldScene` or kept as future work?
- Should movement correction be displayed when the server rejects a position?
- Should socket listener registration use named handlers for exact cleanup?
- Should scene tests cover world lifecycle and listener cleanup?

## TODO

- [ ] Verify socket disconnect behavior on world page cleanup.
- [ ] Verify complete socket listener cleanup.
- [ ] Add or verify scene lifecycle tests.
- [ ] Add or verify reconnect resynchronization.
- [ ] Review server-validated movement and collision requirements.
- [ ] Review performance with many rendered entities.
