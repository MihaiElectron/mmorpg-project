# Movement Model

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-21
- Depends on: docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md,
  docs/01_Architecture/adr/ADR-0002-entity-positioning.md,
  docs/08_Gameplay/world-model.md,
  docs/08_Gameplay/entity-model.md,
  docs/01_Architecture/client-server-boundaries.md
- Used by: Project owner, developers, conversational assistants,
  repository-aware coding agents

---

## Scope

This document defines the official gameplay rules for movement in the MMORPG.

It is technology-independent. It does not reference Phaser, NestJS, TypeORM,
Socket.IO, or any implementation detail. It describes what the game rules are,
not how they are implemented.

The numerical values of speed, radius, and range constants are intentionally
left as open questions. The rules that govern them are fixed. The values will
be specified once the coordinate conversion factor from ADR-0001 is validated.

This document supersedes any earlier, implicit movement behavior. When this
document and the current implementation disagree, this document is the intended
behavior.

Reference document for the analysis that preceded this model:
[Movement Study](movement-study.md).

---

## Movement type

Movement in this game is **continuous**.

An entity does not move tile by tile. It occupies a fractional position in the
world grid at all times. Its position is expressed as `worldTileX` and
`worldTileY` as defined by ADR-0001. The unit is one tile. The fractional part
represents the sub-tile offset within the occupied tile.

Tiles do not constrain where an entity stands. They govern what happens to an
entity based on where it stands: whether it can walk there, what speed applies,
what interactions are available.

The isometric screen representation is derived from the logical position using
the projection formula defined in ADR-0001. Screen coordinates are never used
as a source of truth for gameplay.

---

## Role of tiles

In a continuous movement world, tiles serve four distinct purposes.

**Walkability.** The tile at `(floor(worldTileX), floor(worldTileY))` is the
entity's current tile. If that tile is marked as blocked in the collision layer,
the entity cannot occupy it. The server enforces this.

**Pathfinding grid.** The pathfinding algorithm operates on integer tile
coordinates. An entity's continuous position is converted to integer tile
indices before the search begins. The result is a list of integer waypoints
that the entity follows continuously at its current speed.

**Chunk membership.** An entity's chunk is derived from its tile position:

```
chunkX = floor(worldTileX / CHUNK_SIZE)
chunkY = floor(worldTileY / CHUNK_SIZE)
```

Chunk membership drives interest management and future Socket.IO room scoping.

**Terrain properties.** A tile can carry gameplay properties: speed modifier,
damage zone, resource trigger, or spawn condition. These properties apply to
any entity whose center tile matches the tile carrying them.

---

## Map boundary rule

An entity can never exist outside its Map.

A Map has a finite extent defined by the number of chunks it contains:

```
mapWidthTiles  = mapWidthChunks  × CHUNK_SIZE
mapHeightTiles = mapHeightChunks × CHUNK_SIZE
```

A valid entity position satisfies:

```
0 ≤ worldTileX < mapWidthTiles
0 ≤ worldTileY < mapHeightTiles
```

The server validates these bounds on every position that is stored, broadcast,
or produced by gameplay logic. No exception exists. A position that falls
outside the bounds is always rejected or clamped before any effect is applied.

The client may provide visual feedback at map boundaries (a border, a block, a
visual indicator) but is never authoritative. A player who reaches a boundary
on the client is still subject to server validation.

### Application by case

| Case | Rule |
|---|---|
| Click outside map bounds | Refused or clamped to the nearest valid tile. The exact behavior (refuse vs clamp) is an open question. |
| Pathfinding destination outside bounds | The destination is rejected before the pathfinding search begins. The path is not computed. |
| Direct steering toward the edge | Movement stops at the boundary. The server clips the movement vector to the last valid position inside the map. |
| Knockback or charge effect | The resulting position is clamped to the map boundary before being applied. The entity stops at the edge; it does not leave the map. |
| Teleportation (admin or gameplay) | The target position is validated against the bounds of the target map before the teleport is applied. A teleport to an out-of-bounds position is rejected. |
| Spawn and respawn | Spawn and respawn points are authored within map bounds. If a stored spawn point falls outside the current map dimensions (e.g., after a map resize), the server must detect and reject it at startup. |
| Admin placement | Admin tools must validate coordinates against the target map bounds. An out-of-bounds placement is refused with an explicit error. |
| Map transition | Leaving Map A and entering Map B is not handled by the movement validator. It is handled by a future transition system that assigns the entity a valid entry position on the destination map. |
| Future instanced zones | An instance is a Map with its own `mapId` and its own bounds. The same rules apply identically. |

---

## Movement modes

Two movement modes coexist. They share the same underlying position model
and the same server validation rules. What differs is the source of the
movement intent and the path computation strategy.

### Mode 1 — Click (pathfinding)

The player designates a destination by releasing a short click.

A pathfinding algorithm computes a route from the entity's current tile
position to the destination tile. The route is a sequence of waypoints
expressed as integer tile coordinates. The entity follows the route
continuously, moving toward each waypoint at its current `effectiveSpeed`
until it reaches the arrival threshold, then advancing to the next waypoint.

If the destination is unreachable (blocked, out of bounds, or disconnected from
the start), the pathfinding fails. The entity stops at its current position.

If an obstacle appears mid-route, the path may be recomputed from the current
position, or the entity may stop and wait for a new order. The exact behavior
is an open question.

### Mode 2 — Direct steering (hold or keyboard)

The player either holds the pointer down toward a position, or presses a
directional key. In both cases, the entity moves continuously in the indicated
direction at its current `effectiveSpeed`. No path is computed.

When driven by pointer hold, the direction updates every frame as the cursor
moves. When driven by keyboard, the direction is determined by the key pressed,
mapped to the world-tile axes (see Client responsibilities).

This mode interrupts any active pathfinding. When direct steering begins, any
in-progress route is discarded immediately. The route is not resumed when
steering ends. The player must issue a new click to start a new pathfinding
order.

Direct steering is compatible with server collision and boundary validation.
The server clips the movement to the last valid position if the trajectory
would enter a blocked tile or reach a map boundary.

---

## Priority order

When multiple movement modes are active simultaneously, the following priority
applies:

```
direct steering (keyboard or hold) active  >  pathfinding route active  >  idle
```

Any higher-priority input cancels all lower-priority state immediately. There
is no queuing or buffering of movement orders.

Additionally, programmatic movement orders issued by the server (forced
repositioning, knockback, teleport, respawn) override all client-driven modes
and are applied unconditionally.

---

## Speed

### Base speed

Every entity has a `baseSpeed` expressed in **tiles per second**.

The numerical value of `baseSpeed` for each entity type is an open question
pending the validation of the ADR-0001 coordinate conversion factor. Current
pixel-equivalent speed values are preserved temporarily and must be converted
to tile units before server-side movement integration is implemented.

Speed integration follows:

```
worldTileX += dirX × effectiveSpeed × dt
worldTileY += dirY × effectiveSpeed × dt
```

Where `dirX` and `dirY` form a unit direction vector and `dt` is the elapsed
time in seconds.

### Effective speed

The actual movement speed applied at any given moment is `effectiveSpeed`:

```
effectiveSpeed = baseSpeed × product(all active modifiers)
```

The modifier pipeline is maintained server-side. The server computes
`effectiveSpeed` before each movement integration step. The client may receive
`effectiveSpeed` or the active modifier list to drive animation speed and
local display.

### Speed modifiers

The following modifier categories are anticipated. Their exact values are open
questions. Their existence as a category is a fixed rule of the model.

| Category | Direction | Notes |
|---|---|---|
| Sprint | × > 1.0 | Triggered by player action, limited duration |
| Stealth / camouflage | × < 1.0 | Applied while active |
| Charge | × > 1.0 | Short burst, reduced directional control |
| Slow debuff | × < 1.0 | Applied by combat or terrain effect |
| Immobilization | × = 0 | Movement fully blocked for duration |
| Terrain | × < 1.0 or × > 1.0 | Sourced from the property of the current tile |
| Equipment weight | × ≤ 1.0 | Derived from loaded equipment and inventory mass |

A modifier of × 0 (immobilization) prevents all movement integration. The
entity does not move regardless of input.

Terrain modifiers are applied per tick, based on the tile property at
`(floor(worldTileX), floor(worldTileY))`. The server reads this property from
the same tile data used for walkability.

---

## Collisions

### Server-side collision (mandatory)

The server validates walkability before accepting any position. The tile at
`(floor(worldTileX), floor(worldTileY))` must be walkable. If it is blocked,
the movement is rejected and the entity remains at its last valid position.
The server may send a position correction to the originating client.

This applies to all movement sources: player input, AI movement, knockback,
charge, teleport, spawn.

### Client-side collision (assistive only)

The client may enforce collision locally to provide immediate visual feedback
and prevent obvious wall-crossing in the local rendering. Client-side collision
is never authoritative. The server is the final arbiter.

### Collision granularity

The initial collision model uses tile-level checks: one tile per entity, based
on the center position. Sub-tile collision (bounding box against adjacent
tiles) and entity-to-entity collision are deferred. The decision to implement
them is an open question.

---

## Pathfinding

Pathfinding operates on the tile grid. The input is a start tile and a
destination tile, both expressed as integer coordinates derived from continuous
positions:

```
startTileX = floor(worldTileX)
startTileY = floor(worldTileY)
```

The output is a sequence of waypoint tiles. The entity follows these waypoints
continuously at `effectiveSpeed`, moving toward the center of each waypoint:

```
waypointCenterX = waypointTileX + 0.5
waypointCenterY = waypointTileY + 0.5
```

Once within the arrival threshold of a waypoint center, the entity advances to
the next waypoint. The arrival threshold is expressed in tile units. Its exact
value is an open question.

If pathfinding fails (no path found, destination blocked, destination out of
bounds), the entity stops. The player must issue a new order.

Pathfinding may be recomputed during route following if an obstacle appears
mid-path. The recomputation strategy is an open question.

---

## Server authority

The server is the authority on all entity positions.

For player-driven entities, client-reported positions are movement intentions.
The server validates each intention against map bounds, walkability, and the
distance reachable given `effectiveSpeed` and elapsed time. A position that
fails validation is rejected. The server sends a correction to the originating
client.

For server-driven entities (animals, NPCs), the server computes the position
at each game tick. No client input is accepted for these entities. Their
position is always authoritative.

Validation checks applied by the server on every position event:

1. `mapId` matches the entity's current map.
2. Position is within map bounds.
3. Target tile is walkable.
4. Distance from last validated position is consistent with `effectiveSpeed`
   and elapsed time (anti-cheat distance gate).

If any check fails, the position is rejected and the entity remains at its last
validated position.

---

## Client responsibilities

The client is responsible for display and for transmitting movement intentions
to the server. It is never responsible for gameplay decisions.

**Local movement display.** The client applies movement locally and immediately
on receipt of player input, without waiting for server acknowledgement. This
eliminates visible input latency. The displayed position may diverge from the
server position momentarily; the server position always takes precedence when a
correction is received.

**Interpolation.** The client may interpolate the displayed position of remote
entities between received server updates. Interpolation is applied to
`worldTileX / worldTileY`; the isometric projection is derived from the
interpolated values. Interpolation is a rendering technique and has no gameplay
effect.

**Prediction and reconciliation.** Full client-side prediction with sequence
numbers and server reconciliation is not yet decided. It is a future option.
The client must be designed so that a reconciliation mechanism can be added
without restructuring the movement pipeline.

**Coordinate conversion.** The client converts all pointer input from screen
coordinates to `worldTileX / worldTileY` using the inverse projection formula
defined in ADR-0001 before transmitting any position to the server. Screen
coordinates are never sent to the server.

**Keyboard direction mapping.** Keyboard input must map to the world-tile axes
(`worldTileX` and `worldTileY`), not to screen-space axes. In an isometric
view, pressing a directional key moves the entity along a world-tile diagonal,
not horizontally or vertically on screen.

**Map boundary feedback.** The client may display a visual indicator when the
player reaches a map boundary. This feedback is cosmetic. It does not prevent
the server from validating the position independently.

---

## Constraints from future systems

### Combat system

The combat system will determine whether an attack or interaction is valid based
on the distance between attacker and target. Distance is computed from their
`worldTileX / worldTileY` positions.

The movement model's obligation to the combat system: maintain a reliable,
up-to-date authoritative position for every entity on the server at all times,
independently of network latency or client sync rate.

The movement model does not define attack ranges, weapon types, or combat rules.
It guarantees that positions are available and correct when the combat system
requests them.

### Equipment and inventory

The total load carried by a player (equipped items and inventory contents) may
apply a multiplier to `baseSpeed`. This multiplier is sourced by the equipment
and inventory systems and fed into the `effectiveSpeed` pipeline.

The movement model reserves a hook in the modifier pipeline for this purpose.
The movement model does not define encumbrance thresholds, item weights, or
inventory capacity.

---

## Open questions

The following questions are not resolved by this model. They must be answered
before the corresponding behavior can be implemented.

1. **Coordinate conversion factor.** What is the factor to convert existing
   pixel-equivalent positions to `worldTileX / worldTileY` values? This
   unblocks all numerical speed and distance decisions.

2. **Exact speed values in tile units.** What is `baseSpeed` for the player?
   What are `speedMin`, `speedMax`, `patrolRadius`, and `aggroRadius` for each
   animal template? Depends on question 1.

3. **Exact distance and range values in tile units.** `RESOURCE_INTERACT_RANGE`
   and similar constants. Depends on question 1.

4. **DB storage type for `worldTileX / worldTileY`.** FLOAT, DOUBLE PRECISION,
   or split integer columns? Deferred to ADR-0001.

5. **Sub-tile collision strategy.** When is a tile-level check insufficient?
   Does the project need bounding-box collision? Entity-to-entity collision?

6. **Full prediction + reconciliation.** When and how will sequence numbers and
   server-side input replay be introduced? What triggers the decision to
   implement this?

7. **Click outside map bounds: clamp or refuse?** Should the destination be
   silently adjusted to the nearest valid tile, or should the order be
   rejected entirely with player feedback?

8. **Pathfinding recomputation mid-route.** If an obstacle appears while an
   entity is following a path, does the path recompute automatically, or does
   the entity stop and wait for a new order?

9. **Arrival threshold in tile units.** What sub-tile distance is close enough
   to a waypoint to count as arrival? Depends on question 1.

10. **Pathfinding authority for players.** Does pathfinding run on the client
    (result sent to server as waypoints) or on the server (client receives
    waypoints)? Client-side is simpler; server-side eliminates grid divergence
    risk.

---

## Related files

- [Movement Study](movement-study.md)
- [World Model](world-model.md)
- [Entity Model](entity-model.md)
- [Gameplay README](README.md)
- [ADR-0001 — World Coordinate System](../01_Architecture/adr/ADR-0001-world-coordinate-system.md)
- [ADR-0002 — Entity Positioning](../01_Architecture/adr/ADR-0002-entity-positioning.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Phaser World](../03_Client/phaser-world.md)
- [Maps and Collisions](../05_World/maps-and-collisions.md)
- [Server WebSockets](../04_Server/websockets.md)
