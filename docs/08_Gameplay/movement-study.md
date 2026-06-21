# Movement Study

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-22
- Depends on: docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md,
  docs/01_Architecture/adr/ADR-0002-entity-positioning.md,
  docs/08_Gameplay/entity-model.md, docs/08_Gameplay/world-model.md,
  docs/01_Architecture/client-server-boundaries.md
- Used by: Project owner, developers, conversational assistants,
  repository-aware coding agents

---

## Purpose

This document studies the movement architecture for the MMORPG before any
implementation begins.

It does not choose a final implementation. It describes what is currently in
place, analyses the two movement modes that must coexist, identifies risks and
open questions, and produces a preliminary recommendation aligned with the
project constraints.

---

## Fixed constraints

These constraints are not open questions. They frame every analysis below.

- Movement is continuous. The player is not limited to tile-by-tile steps.
- Tiles serve the logical world: collisions, resource placement, pathfinding
  grid, chunk boundaries. They do not constrain the physical position of entities.
- Every entity has a continuous logical position expressed in
  `worldX / worldY` (ADR-0001) — signed integers in World Units (WU), `1 tile = 1024 WU`.
  The tile index is `worldX >> 10`; the sub-tile offset is `worldX & 1023`.
  The architectural rationale is in `docs/08_Gameplay/world-units-study.md`.
- The server is authoritative. Client-reported positions are intentions. The
  server validates and corrects them.
- Phaser pixel coordinates are never the source of truth. `screenX / screenY`
  are derived from `worldX / worldY` using the isometric projection
  formula defined in ADR-0001.
- The coordinate system must respect ADR-0001 (world coordinate system) and
  ADR-0002 (entity column naming and WebSocket payloads).
- Current speed values must be preserved at the start of migration.
- The movement model must anticipate future speed modifiers: stealth, sprint,
  charge, slow, immobilization, terrain. These are not implemented now.

---

## Current state

### Client

`Player.js` uses Phaser Arcade Physics with `speed = 100` (pixel-equivalent
velocity per second).

`PlayerController.js` implements three priority levels evaluated every frame:

1. **Keyboard** — arrow keys override everything. `setVelocity(±speed, ±speed)`
   directly. Clears any mouse state.
2. **Drag (hold > 150 ms)** — continuous steering toward the cursor position.
   `directMoveToTarget(speed)`. `path` is null during drag.
3. **Click release (< 150 ms)** — calls `calculatePath(targetX, targetY)`,
   which queries `scene.pathfinder` on a 32 px tile grid. The resulting path
   is followed waypoint by waypoint via `followPath(speed)`. Arrival threshold
   is 8 px per waypoint.

Position is synchronized to the server at most every 80 ms
(`WorldScene.syncLocalPlayer`), but only when position or direction has
changed. The payload currently uses `{ x, y, direction }` in pixel-equivalent
units (ADR-0002 target: `{ mapId, worldX, worldY, direction }`).

The pathfinding grid uses `tileSize = 32` px, which is not the isometric tile
size (128 × 64 px). This is a known mismatch: the grid does not yet correspond
to `localTileX / localTileY`.

### Server

Animals use continuous movement driven by a server tick. Speed is applied as:

```
newX = animal.x + dirX * speed * dt
newY = animal.y + dirY * speed * dt
```

Current seed values (pixel-equivalent units):

| Template | `speedMin` | `speedMax` | `patrolRadius` | `aggroRadius` |
|---|---|---|---|---|
| Turkey | 25 | 60 | 200 | 50 |
| Goblin | 40 | 80 | 150 | 120 |

These constants are in pixel-equivalent units. They must be recalibrated in
World Units (WU/s for speeds, WU for distances) before server-side movement
integration is implemented. The numerical recalibration requires gameplay
validation after per-map origins are finalized — see ADR-0001 open questions.

### Known technical debt

- The client pathfinder grid uses 32 px tiles, not the logical
  `worldX / worldY` grid. This will diverge once the isometric
  coordinate system is fully active.
- All speeds and ranges are in pixel-equivalent units. No conversion to logical
  units has been performed.
- The client sync payload sends `{ x, y }`. ADR-0002 requires
  `{ mapId, worldX, worldY }`.
- There is no client prediction. There is no server reconciliation. The client
  receives server-broadcasted positions and moves locally between syncs.
- The keyboard mode moves in screen-space axes (cartesian), not in world-tile
  axes (isometric). This is not yet visible as a bug but becomes one after the
  isometric projection is active.

---

## Analysis

### 1. Continuous movement vs tile-by-tile

A tile-by-tile model snaps positions to integer tile coordinates at the server
level after each step. It simplifies collision checks and pathfinding but
removes sub-tile precision and makes smooth animation impossible without client
interpolation at every frame.

A continuous movement model stores `worldX` and `worldY` as fractional
values (ADR-0001, Option B). The server integrates speed × dt at each tick.
The isometric projection formula produces `screenX / screenY` directly from
the fractional position.

**This project uses continuous movement.** The tile grid remains the logical
substrate for collision lookups and pathfinding, but the position of an entity
is not snapped to it at runtime.

Consequence: the server must integrate movement at every tick (or on every
validated client event) and must store fractional `worldX / worldY`.
The unit is World Units (WU, signed integer, `1 tile = 1024 WU`) as decided in ADR-0001.
The DB column type (`INTEGER` vs `BIGINT`) must be confirmed at migration time based on world size.

### 2. Role of tiles in a continuous movement world

Tiles serve four distinct roles that are independent of the entity's position
precision:

| Role | Mechanism |
|---|---|
| **Walkability** | The tile at `floor(worldX), floor(worldY)` is looked up in the collision layer. If blocked, the movement is rejected or redirected. |
| **Pathfinding grid** | A\* or equivalent operates on integer tile coordinates. The start and end positions are converted from `worldX / worldY` to `floor()` integers before the search. |
| **Chunk membership** | `chunkX = floor(worldX / CHUNK_SIZE)`. Used for Socket.IO rooms, interest management, and chunk loading. |
| **Terrain properties** | Speed modifiers, damage zones, resource triggers. A tile can carry gameplay properties that apply to any entity whose center is within it. |

The tile grid does not constrain where an entity stands. It constrains what
happens to it based on where it stands.

### 3. Pathfinding on a tile grid with continuous position

The pathfinder receives integer start and end tile coordinates derived from the
entity's continuous position:

```
startTileX = floor(worldX)
startTileY = floor(worldY)
```

It returns a list of integer waypoints `[tileX, tileY]`. The entity moves
toward the center of each waypoint:

```
waypointWorldX = tileX + 0.5
waypointWorldY = tileY + 0.5
```

The entity follows the path continuously, not discretely. It advances toward
the next waypoint using its speed and the direction vector. Once within an
arrival threshold of the waypoint center, it advances to the next waypoint.

This model is compatible with sub-tile precision on both client and server. The
waypoints are integer tile centers, but the entity travels between them at
continuous speed.

**Current mismatch**: the client pathfinder uses `tileSize = 32` px and
converts `player.x / 32` to get the tile index. After the isometric coordinate
migration, the conversion becomes `floor(worldX)` directly. The grid
dimensions must also match `localTileX / localTileY` within the current chunk.

### 4. Direct continuous order (drag mode)

The drag mode is a steering order: the entity continuously moves toward the
cursor position as long as the pointer is held down. No path is computed. The
entity moves in a straight line toward the target point at each frame.

This mode is already present in `PlayerController.directMoveToTarget`. It
bypasses the pathfinder. Collisions with blocked tiles are not currently
enforced in this mode (the entity can cross walls if pointed through them).

Collision enforcement in drag mode requires checking, at each server tick or
each client frame, whether the movement vector would enter a blocked tile. If
so, the movement must be deflected or stopped. This is a requirement before
drag mode can be considered complete.

### 5. Priority between pathfinding and direct order

The current `PlayerController.update` priority is:

```
1. Keyboard       → clears mouse state, overrides all
2. Drag (held)    → sets isDragging = true after 150 ms, clears path
3. Pathfinding    → followed when path exists and no drag or keyboard
4. No input       → velocity 0
```

This priority order is correct for the project's goals. The keyboard and drag
modes represent immediate intent; pathfinding represents a pending order. Any
higher-priority input should cancel the pending order.

The 150 ms threshold that distinguishes a click (pathfinding) from a drag
(steering) is a UI decision, not a gameplay one. It can be adjusted without
affecting the movement model.

### 6. Pathfinding cancellation and interruption

| Event | Expected behavior |
|---|---|
| Keyboard key pressed | Cancel path immediately. Start keyboard movement. |
| Drag detected (hold > 150 ms) | Cancel path immediately. Start steering toward cursor. |
| New click on destination | Cancel current path. Compute new path. |
| Obstacle appears mid-path | Recompute path from current position, or stop and wait for player action. |
| Path endpoint becomes unreachable | Stop movement. Optionally show feedback. |

**Resumption after interruption** is not required by default. Once a keyboard
or drag input cancels a path, the path is gone. The player must click again to
issue a new pathfinding order. This is consistent with the current
implementation and with standard MMORPG conventions.

Exception: if the entity is being moved programmatically (e.g., pushed by a
server event), pathfinding should be cancelled on the client by the received
server position update.

### 7. Server authority and position validation

The server is the authority on all positions. The client sends movement
intentions; the server validates and broadcasts the resulting position.

**Player movement flow (target state):**

1. Client sends `player_move` with `{ mapId, worldX, worldY, direction }`.
2. Server validates:
   - `mapId` matches the character's current map.
   - `worldX / worldY` are within map bounds.
   - The claimed position is reachable from the last known server position given
     the player's speed and the elapsed time (distance gate).
   - The tile at `floor(worldX), floor(worldY)` is walkable.
3. Server accepts the position, updates its in-memory state, and broadcasts
   `player_moved` to other clients.
4. If the position is rejected, the server sends a correction event to the
   originating client.

**Animal movement**: fully server-driven. The server computes new positions
every AI tick and broadcasts them. No client input is accepted for animal
movement.

**Current state**: step 2 is not yet implemented for players. The server
currently accepts the client's `x / y` values without distance or walkability
validation. This is a known security gap that must be closed during or after
the coordinate migration.

### 8. Speed in World Units

After migration to ADR-0001 coordinates, speed must be expressed in **World
Units per second (WU/s)**. The official unit is `1 tile = 1024 WU` as decided in ADR-0001.

Current pixel-equivalent speeds must be recalibrated via gameplay testing.
The isometric projection makes the conversion direction-dependent; there is
no single scalar factor from pixels to WU — see `docs/08_Gameplay/world-units-study.md`.

The correct approach: define `speed` in WU/s, apply it to the `worldX / worldY`
delta at each tick, and let the projection formula produce the screen velocity
automatically. Note that since `worldX/worldY` are integers, the integration
result must be rounded:

Speed integration at the server level:

```
worldX += round(dirX * speed * dt)   // speed in WU/s, dt in seconds, result in WU
worldY += round(dirY * speed * dt)
```

At the client level for local prediction:

```
worldX += round(dirX * speed * dt)
worldY += round(dirY * speed * dt)
screenX = origin.x + (worldX − worldY) / 16    // HALF_TILE_W / TILE_SIZE_WU = 64/1024
screenY = origin.y + (worldX + worldY) / 32    // HALF_TILE_H / TILE_SIZE_WU = 32/1024
```

### 9. Speed modifiers

The movement model must support a multiplier applied to base speed. The
multiplier is server-authoritative. The client may apply it locally for
prediction, but the server enforces it.

Planned modifier sources (not implemented):

| Source | Effect on speed |
|---|---|
| Sprint | × 1.5 to × 2.0 |
| Stealth / camouflage | × 0.6 to × 0.8 |
| Charge | × 2.0, limited duration, loss of control |
| Slow debuff | × 0.4 to × 0.7 |
| Immobilization | × 0 (complete stop) |
| Terrain (mud, ice, water) | Tile-level multiplier, applied server-side |
| Equipment weight | See section on future system constraints |

Implementation model: `effectiveSpeed = baseSpeed × product(all active modifiers)`.

The modifier list is maintained server-side per entity. The server computes
`effectiveSpeed` before each movement integration. The client receives
`effectiveSpeed` (or the modifier list) via socket to display correct animation
speed and local prediction.

Terrain-based modifiers require reading the tile property at the entity's
current tile before each integration step. The server already has access to
tile walkability; terrain speed modifiers extend the same mechanism.

### 10. Collisions

Collisions are checked against the logical tile grid. An entity's center tile
is `floor(worldX), floor(worldY)`. A blocked tile at those coordinates
means the entity cannot occupy that position.

Two levels of collision:

**Tile-level (mandatory)**: the server checks the target tile before accepting
a position. If blocked, the movement is rejected. This is the primary
server-side guard.

**Sub-tile or AABB collision (optional, future)**: for entities with a physical
extent (a character occupies more than a single point), a bounding box check
against adjacent tiles may be needed. Not required now.

**Current client state**: Phaser Arcade Physics handles local collision via
collision groups set up in `WorldScene`. The physics body is 20 × 16 px. After
the coordinate migration, the physics body must continue to correspond to a
reasonable fraction of the tile footprint. The server does not currently
validate walkability for player movement.

**Drag mode gap**: drag mode does not currently enforce collisions. The server
authority check (tile walkability) closes this gap for the final accepted
position, but local movement on the client can cross walls before the server
corrects it.

### 11. Client interpolation

Without interpolation, remote entities (other players, animals) teleport on
each received position update. With interpolation, the client smoothly moves
the sprite between the last known position and the newly received position over
the network interval.

For this project's 80 ms sync interval, linear interpolation of
`worldX / worldY` between two received values produces acceptable
smoothness at current network latencies.

Implementation: maintain a target position per remote entity. Each frame,
advance the sprite toward the target at the estimated speed. On receiving a new
position, update the target. No complex buffer is required at this scale.

The isometric projection is applied after interpolation: `screenX / screenY`
are derived from the interpolated `worldX / worldY`.

### 12. Client prediction

Client prediction means the local player's movement is applied immediately on
the client without waiting for server acknowledgement. This eliminates the
visible input lag caused by the round-trip latency.

The current implementation already behaves like prediction: `PlayerController`
applies velocity to the Phaser sprite immediately, and `syncLocalPlayer` sends
the resulting position at most every 80 ms. However, this is implicit prediction
without reconciliation.

**True prediction + reconciliation** requires:

1. The client applies the movement locally and records each input with a sequence
   number.
2. The client sends inputs (direction + speed + dt) or the resulting position
   to the server.
3. The server validates, applies the movement, and returns the authoritative
   position with the acknowledged sequence number.
4. The client compares its predicted position to the server position. If the
   error exceeds a threshold, it snaps or smoothly corrects to the server
   position and replays any unacknowledged inputs from the sequence.

Full reconciliation is not required immediately but should be designed into the
model so that it can be added without restructuring the movement pipeline.

Minimum viable position: send the current position + a sequence number, receive
authoritative corrections from the server, snap or lerp to correct position.

### 13. Server reconciliation

Reconciliation is the server-side counterpart to client prediction. The server
evaluates whether the client's reported position is consistent with:

- The last acknowledged server position.
- The player's current effective speed.
- The elapsed time since the last validated position.

The check is: `distance(lastServerPos, claimedPos) ≤ effectiveSpeed × dt × tolerance`.

A tolerance factor (e.g., 1.3×) accommodates jitter and latency variance without
rejecting valid movements. Rejected positions trigger a correction broadcast to
the client.

This validation is currently absent for player movement. It is the primary
anti-cheat measure for speed hacking.

### 14. Shared movement model for players, animals, and NPCs

All moving entities share the same position representation (`worldX`,
`worldY`, `mapId`) and the same speed integration formula. What differs is
who drives the movement:

| Entity | Movement driver | Path source | Speed authority |
|---|---|---|---|
| Player | Client input → server validates | Client pathfinder, server-corrected | Server (`effectiveSpeed`) |
| Animal | Server AI tick | Server pathfinder or steering | Server unconditionally |
| NPC (future) | Server behavior script | Server pathfinder | Server unconditionally |

The pathfinding algorithm, tile walkability lookup, and speed integration are
the same for all entity types. The differences are in input source and
authority level.

Unifying the movement model under a shared service (`MovementService` or
equivalent) on the server prevents logic duplication between `AnimalsService`
and future player movement validation.

### 15. Client and server costs

**Client:**
- Pathfinding is computed on click (not every frame). Cost is O(path length)
  per user action. Acceptable for current map sizes.
- Speed integration and screen projection are two additions per entity per
  frame. Negligible.
- Interpolation for remote entities adds one lerp per entity per frame.
  Negligible at current player and animal counts.

**Server:**
- Animal AI ticks run every game loop interval. Current implementation loops
  over all live animals per tick. This grows linearly with animal count.
  Acceptable now; must be chunked per zone when entity counts grow.
- Player position validation adds one distance check per `player_move` event.
  Negligible.
- Pathfinding for server-driven entities (animals, future NPCs) runs on the
  server. At current entity counts, a simple A\* per entity per aggro event is
  acceptable. At scale, pathfinding must be cached or chunked.

---

## Constraints from future systems

The movement model must be designed so that other systems can read from or
write to it, without those systems being implemented now.

### Combat

Attack and interaction ranges will depend on weapon type. A dagger, a sword, a
spear, a bow, and a spell each have different effective ranges. The combat
system will consume the entity's `worldX / worldY` to compute
the distance between attacker and target.

Requirement: the movement model must expose a reliable, up-to-date logical
position for every entity at all times. The server must always have the
authoritative position available in memory, independently of network latency or
client sync rate.

The movement model does not define combat ranges. It guarantees that positions
are available for the combat system to consume.

### Equipment and inventory

Equipment load and inventory weight may reduce base speed. A heavily loaded
character moves slower than an unequipped one.

This requires a hook in `effectiveSpeed` computation: the movement model
queries an equipment or inventory modifier before integrating each movement
step. The modifier is expressed as a scalar multiplier on base speed.

The movement model does not define equipment rules. It reserves a place in the
speed computation pipeline for external modifiers.

---

## Approaches compatible with the project

Three approaches can be applied progressively without requiring a full rewrite
at each step.

### Approach A — Minimal migration (coordinate rename only)

Rename `x / y` to `worldX / worldY`. Apply the ADR-0001 conversion
factor to existing values. Preserve all current movement logic. Add `mapId`
to payloads.

This closes the coordinate debt without touching movement semantics. Speed
validation, reconciliation, and terrain modifiers are deferred.

**Suitable for**: reaching ADR-0001 and ADR-0002 compliance with minimal risk.
**Deferred**: server-side validation, collision in drag mode, speed in logical
units.

### Approach B — Coordinate migration + server validation

Approach A plus: implement server-side distance validation on `player_move`.
Convert all speed and range constants to World Units (WU/s, WU). Enforce tile walkability
on server.

This closes the primary anti-cheat gap. Client prediction remains implicit
(no sequence numbers, no reconciliation). Corrections are sent as position
overrides.

**Suitable for**: a playable, server-authoritative movement before multi-player
scale is reached.
**Deferred**: full prediction + reconciliation, terrain modifiers.

### Approach C — Full prediction and reconciliation

Approach B plus: sequence numbers on inputs, server acknowledgement, client
replays unacknowledged inputs on correction.

This handles network jitter and latency at multi-player scale. It is the
correct target for a production MMORPG.

**Suitable for**: once player counts justify the implementation cost.
**Risk**: significant increase in implementation complexity. Should not be
introduced before the simpler approaches are stable.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Partial migration: some entities in pixel units, others in WU | High | Migration must be atomic per entity type (ADR-0002). Never mix coordinate spaces in a single calculation. |
| Pathfinder grid mismatch after isometric migration | Medium | The pathfinder grid must be rebuilt to match `localTileX / localTileY` during the migration. |
| No server validation of player positions allows speed hacking | Medium | Implement distance gate as part of Approach B before the game is multi-player. |
| Drag mode allows wall crossing on client | Low (server corrects) | Server tile check prevents the position from being accepted. Client visual glitch only until reconciliation is implemented. |
| Speed constants not yet calibrated in WU/s | Medium | Must be resolved before any server-side movement integration uses them. |
| DB column type (`INTEGER` vs `BIGINT`) unconfirmed | Low | Choose `INTEGER` by default; upgrade to `BIGINT` only if world exceeds 2 097 151 tiles per axis. |
| Terrain modifier lookup adds cost per tick per entity | Low | At current entity counts, one tile lookup per tick is negligible. Must be cached when chunk-wide lookups are needed. |

---

## Open questions

1. **What is the WU/s value of `player.speed = 100` px/s?** The unit is decided
   (WU, `1 tile = 1024 WU`), but the numerical calibration requires gameplay
   testing and the final per-map origin offset.
2. **Should the server integrate player movement per tick, or validate
   client-reported positions?** Per-tick server integration is more authoritative
   but requires the server to receive inputs rather than positions. Validating
   client-reported positions is simpler but relies on the distance gate.
3. **What is the minimum viable prediction + reconciliation design?** Sequence
   numbers on socket events, or dedicated input events?
4. **How is drag mode reconciled with tile collision?** The server rejects
   the final position if it lands on a blocked tile, but does not redirect the
   path. Should the server compute a safe redirect, or simply stop movement?
5. **What is the arrival threshold at the final pathfinding destination?** The
   current `arrivalThreshold = 8 px` will need a tile-unit equivalent after
   migration.
6. **Should pathfinding run on the server for player movement, or only on the
   client?** Running it on the server eliminates the mismatch risk but increases
   server load and requires sending waypoints to the client.
7. **When a drag interrupts a path mid-way, should the path be recomputeable
   from the interruption point?** Currently the path is discarded. Re-issuing
   a click is the expected recovery.
8. **What is the effectiveSpeed API contract between the movement system and
   future modifier providers (combat buffs, equipment)?** Push vs pull,
   event-driven vs queried per tick.

---

## Preliminary recommendation

Proceed in two phases.

**Phase 1 — Coordinate compliance (Approach A)**

Implement the ADR-0001 and ADR-0002 coordinate migration. Rename columns and
payloads. Calibrate speed and range constants in WU/s and WU once per-map
origins are finalized. Rebuild the pathfinder grid to use
`localTileX / localTileY` (`worldX >> 10`). This phase does not change movement
behavior; it aligns the codebase with the defined coordinate system.

Priority: finalize the per-map origin offset (`TILEMAP_TEST_OFFSET_X/Y`), as
it is required to convert existing pixel-equivalent seed positions to WU.

**Phase 2 — Server authority (Approach B)**

Add server-side distance validation on `player_move`. Enforce tile walkability
at the server. Introduce a server-side movement service shared by players and
animals. Add a speed modifier pipeline. Send position corrections to clients on
validation failure.

Do not implement full prediction + reconciliation (Approach C) until the player
count makes its absence visible. The implicit prediction already present in the
current implementation is acceptable for a single-player or small-scale
experience.

The keyboard movement mode must be adapted to produce isometric directions
(movements along `worldX` and `worldY` axes) rather than screen-space
directions (movements along screen X and Y). This is a client-only change and
should be included in Phase 1.

---

## Related files

- [ADR-0001 — World Coordinate System](../01_Architecture/adr/ADR-0001-world-coordinate-system.md)
- [ADR-0002 — Entity Positioning](../01_Architecture/adr/ADR-0002-entity-positioning.md)
- [ADR-0003 — Movement Authority](../01_Architecture/adr/ADR-0003-movement-authority.md)
- [World Units Study](world-units-study.md)
- [World Model](world-model.md)
- [Entity Model](entity-model.md)
- [Gameplay README](README.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Phaser World](../03_Client/phaser-world.md)
- [Maps and Collisions](../05_World/maps-and-collisions.md)
- [Server WebSockets](../04_Server/websockets.md)
