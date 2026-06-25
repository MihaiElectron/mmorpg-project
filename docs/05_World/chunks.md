# World Chunks

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/01_Architecture/client-server-boundaries.md, docs/05_World/maps-and-collisions.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the observed state of world chunking, segmentation, loading scope, Socket.IO broadcast scope, and MMO scalability limits.

It covers the current client world bounds, map helper state, server connected-player memory, realtime broadcast scope, persistence behavior related to positions, and missing chunk controls.

It does not define a new chunking architecture.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: present in project configuration or static file layout.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

Chunks can become an important MMO scaling boundary for map loading, entity interest, Socket.IO emission scope, and server-side movement validation.

In the inspected code, a complete chunk system was not verified. This document records the current state and the gaps so future chunk work does not accidentally treat client-side coordinates or display state as authority.

## Chunk overview

The active world client sets a Phaser world and camera bound of `2000` by `2000` logical units. Player movement is rendered locally and synchronized to the server through `player_move`.

Server coordinates (`x`, `y`) represent the logical world position. Phaser uses these values directly as screen pixel positions for sprites. The terrain pipeline test tilemap uses a separate isometric coordinate system (tile column and row) with a temporary display offset. These coordinate spaces are not aligned. A conversion between server logical coordinates, tile coordinates, and Phaser pixel positions must be defined before the isometric tilemap can serve as a production world layer.

The server keeps connected player positions in memory and broadcasts movement to other sockets. No chunk key, zone id, room id, chunk loading window, server-side chunk membership, or authoritative chunk transition validation was observed.

Chunks are therefore a future design area or a known gap, not an implemented gameplay boundary.

## Observed implementation

| Area | Implementation observed | Missing or unverified behavior | Status |
|---|---|---|---|
| Client world bounds | `WorldScene` sets Phaser physics and camera bounds to `0,0,2000,2000` | Dynamic chunk bounds and partial map loading are Not verified | Implemented / Not verified |
| Client map helpers | `MapLoader` and `Pathfinder` helpers exist | Active chunk loading and active map segmentation are Not verified | Not verified |
| Server player state | `WorldService` stores connected players in a memory map keyed by socket id | Chunk membership per player is Not verified | Implemented / Not verified |
| Realtime movement | `player_move` updates connected-player memory and broadcasts movement | Room-scoped or chunk-scoped movement emission is Not verified | Implemented / Not verified |
| Resource updates | Resource updates are emitted globally where observed | Chunk-scoped resource visibility is Not verified | Implemented / Not verified |
| Creature updates | Creature updates are emitted globally where observed | Chunk-scoped creature visibility is Not verified | Implemented / Not verified |
| Position persistence | Character position is persisted on disconnect and admin teleport | Persistence grouped by chunk is Not verified | Implemented / Not verified |
| Interest management | No chunk or room filter was observed for ordinary world updates | Interest management is Not verified | Not verified |

## Chunk size and coordinates

| Concept | Observed value or rule | Source | Status |
|---|---|---|---|
| Active client world size | `2000` by `2000` logical units | `WorldScene` physics and camera bounds | Implemented |
| Player coordinate unit | Numeric `x` and `y` values rounded before `player_move` emit; these are server logical coordinates, not guaranteed pixel-exact screen positions | `WorldScene.syncLocalPlayer` | Implemented |
| Server movement coordinate storage | Numeric `x` and `y` copied from accepted payload into memory | `WorldService.updatePlayer` | Implemented |
| Tile size in client path helper | `32` logical units | `PlayerController.calculatePath` and `MapLoader.tileSize` | Implemented / Not verified |
| Isometric tile size (terrain pipeline test) | `128×64` pixels per tile, offset `TILEMAP_TEST_OFFSET_X=936` — temporary display alignment only | `WorldScene` terrain pipeline block | Implemented / temporary |
| Chunk size | No implemented chunk size found | Search of client and server chunk-related code | Not verified |
| `64x64` chunk rule | No coded rule found | Repository inspection | TBD / Not verified |
| Chunk coordinate key | No implemented key format found | Repository inspection | Not verified |
| Zone or area id | No implemented runtime zone id found | Repository inspection | Not verified |

## Client responsibilities

| Responsibility | Client behavior observed | Server authority implication | Status |
|---|---|---|---|
| Render current world view | Phaser renders direct sprites, images, labels, bars, resources, creatures, and remote players | Rendering does not decide chunk access | Implemented |
| Report movement | Phaser emits rounded local position and direction | Server must validate sensitive movement and future chunk transitions | Implemented / Not verified |
| Use local path helpers | Client pathfinding helper exists and expects a grid | Client pathing cannot prove allowed movement | Not verified |
| Load map or chunk data | Static map files and helpers exist | Loading a client file cannot grant rights or visibility | Not verified |
| Select targets | Phaser click handling selects visible targets and opens UI panels | Target selection still requires server-side checks | Implemented |
| Decide visible interest set | No active client chunk visibility protocol observed | Client-selected interest windows must not become authority | Not verified |

## Server responsibilities

| Responsibility | Server behavior observed | Missing or unverified behavior | Status |
|---|---|---|---|
| Authenticate sockets | World, resource, and creature gateways authenticate observed connections | Independent admin connection authentication remains outside this document | Implemented / Not verified |
| Join player to world | Server checks character ownership before joining | Chunk assignment during join is Not verified | Implemented / Not verified |
| Store live positions | Connected-player memory stores live `x` and `y` | Chunk membership, speed checks, and collision checks are Not verified | Implemented / Not verified |
| Broadcast movement | Movement is broadcast to other sockets | Room, zone, or chunk broadcast filtering is Not verified | Implemented / Not verified |
| Persist position | Position is persisted on disconnect and admin teleport | Chunk-based persistence is Not verified | Implemented / Not verified |
| Validate resource interactions | Resource gathering checks joined player, range, state, and movement during gathering | Chunk authority for resources is Not verified | Implemented / Not verified |
| Validate creature interactions | Creature attack and AI logic use server-side positions and ranges | Chunk authority for creatures is Not verified | Implemented / Not verified |
| Enforce chunk transitions | No server-side chunk transition validation observed | Anti-teleport and inter-chunk validation are Not verified | Not verified |

## Socket.IO scope

All observed gateways use the default Socket.IO namespace. Movement uses `client.broadcast.emit`. Resource and creature updates use global emission in observed paths. Targeted events use socket ids for damage, teleport, or respawn.

No Socket.IO rooms, zone channels, chunk rooms, or room join/leave flow was observed for normal world visibility.

This means chunks are not currently a verified Socket.IO scope boundary. Broadcast fanout remains a known scalability concern for MMO growth.

## Persistence and loading

Character positions are persisted during disconnect and admin teleport paths. Respawn points, resources, creatures, creature templates, and creature spawns exist as server-side world data.

No persisted chunk table, chunk file index, per-chunk entity storage policy, dynamic chunk load/unload lifecycle, or chunk recovery strategy was observed.

Client `world.json` exists but is empty. Active loading of map chunks from this file was Not verified.

## MMO scalability implications

Without verified chunks or rooms, realtime updates can reach more clients than necessary as player counts grow. Current global or broad broadcast behavior is acceptable only as a prototype-level state until scaling boundaries are implemented and reviewed.

Future chunking should consider:

- server-owned chunk membership;
- server-side interest management;
- chunk-scoped Socket.IO rooms;
- movement validation across chunk boundaries;
- entity load and unload rules;
- observability for per-chunk player and entity counts.

These items are design considerations, not implemented behavior.

## Security boundaries

The client cannot decide alone which chunk it is allowed to enter. The client cannot load a zone, map file, or chunk file to obtain gameplay rights.

If segmentation becomes gameplay-sensitive, world segmentation must remain controlled by the server. Chunk assignment, visibility, movement transitions, loot access, target access, and collision or mobility effects must be validated server-side.

Without verified server chunk implementation, chunks remain a known limitation. A client-reported coordinate or client-loaded area must not be treated as proof of valid location.

## Verified behavior

- The active Phaser world sets `2000` by `2000` client bounds.
- The client emits `player_move` with rounded numeric coordinates and direction.
- The server stores connected players in memory by socket id.
- The server updates live player position from numeric movement payloads.
- The server broadcasts movement to other sockets.
- Resource and creature systems use server-side positions for range-sensitive interactions.
- No complete chunk system was verified.
- No Socket.IO chunk rooms were verified.

## Known gaps

- Chunk server authority: Not verified.
- Chunk Socket.IO rooms: Not verified.
- Dynamic chunk loading: Not verified.
- Chunk unload behavior: Not verified.
- Persistence per chunk: Not verified.
- Movement validation between chunks: Not verified.
- Anti-teleport controls for normal movement: Not verified.
- Interest management: Not verified.
- Multi-instance behavior: Not verified.
- Sharding: Not verified.
- Per-chunk metrics: Not verified.
- Chunk tests: Not verified.

## Review checklist

- [ ] Chunk size is backed by code or marked `TBD`.
- [ ] Client chunk data is treated as untrusted.
- [ ] Chunk membership is server-owned if it affects gameplay.
- [ ] Movement between chunks is validated server-side if implemented.
- [ ] Socket.IO broadcasts are scoped intentionally when rooms are introduced.
- [ ] Entity visibility rules are reviewed for abuse.
- [ ] Persistence and reload behavior are defined before production use.
- [ ] Metrics are planned for chunk population and update rate.
- [ ] This document is validated before moving to `Review`.

## Non-goals

- This document does not define a final chunk architecture.
- This document does not introduce a chunk size.
- This document does not define map sharding.
- This document does not define deployment or multi-instance infrastructure.
- This document does not document database internals.
- This document does not document secrets or private environment values.

## Security notes

Do not rely on client-loaded chunk, map, tile, or collision data for gameplay authority. The server must own sensitive chunk effects before chunks become part of movement, visibility, loot, combat, or permissions.

No real secret, token, password, hash, or copied environment value is documented here.

## Performance notes

The current broad broadcast behavior should be reviewed before large player counts. Chunking can reduce network fanout, rendering load, and update processing, but only after the server owns membership and visibility rules.

Current chunk performance, room performance, sharding, and multi-instance readiness are Not verified.

## Related files

- [Documentation Index](../README.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Realtime Socket.IO](../01_Architecture/realtime-socketio.md)
- [Server WebSockets](../04_Server/websockets.md)
- [Phaser World](../03_Client/phaser-world.md)
- [Maps and Collisions](maps-and-collisions.md)
- [Tiled](tiled.md)
- [World Assets](assets.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should the project introduce server-owned chunks, zones, or both?
- What chunk size should be used if the current `2000` by `2000` world grows?
- Should Socket.IO rooms follow chunk ids, larger zones, or gameplay-interest groups?
- Should resources and creatures be loaded by chunk or by a different spatial index?
- How should movement be corrected when a client reports a forbidden cross-boundary position?
- What metrics are required before choosing a chunk size?

## TODO

- [ ] Define or explicitly defer chunk size.
- [ ] Add or verify server-owned chunk membership before gameplay-sensitive use.
- [ ] Add or verify Socket.IO room strategy for world updates.
- [ ] Add or verify dynamic map loading and unloading.
- [ ] Add or verify anti-teleport and inter-chunk movement validation.
- [ ] Add or verify per-chunk observability.
