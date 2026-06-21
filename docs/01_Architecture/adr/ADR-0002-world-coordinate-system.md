# ADR-0002 — World coordinate system

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-06-21
- Date proposed: 2026-06-21
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
- Depends on: docs/01_Architecture/adr/README.md, docs/01_Architecture/client-server-boundaries.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents: docs/05_World/chunks.md, docs/05_World/maps-and-collisions.md, docs/03_Client/phaser-world.md, docs/05_World/tiled.md
- Related code: apps/api-gateway/src/characters/entities/character.entity.ts, apps/api-gateway/src/animals/entities/animal.entity.ts, apps/api-gateway/src/resources/entities/resource.entity.ts, apps/client/src/phaser/core/WorldScene.js

## Context

The project is a real-time web MMORPG with an isometric Phaser client and a NestJS server. At the time this ADR is written, all world entities (characters, animals, resources, spawn points, respawn points) store numeric `x` and `y` values that are used directly as Phaser pixel coordinates. The server computes distances, speeds, and ranges against these values without knowing anything about pixels or screen projection.

A terrain pipeline test is operational: a 64×64 isometric tile map (128×64 pixels per tile) is rendered in Phaser with a temporary visual offset (`TILEMAP_TEST_OFFSET_X = 936`). This offset is not connected to the server coordinate system. Sprites and tiles live in two separate, unaligned coordinate spaces.

The project intends to support:

- A world containing multiple maps of variable sizes.
- Each map divided into a variable number of chunks.
- Each chunk containing a fixed grid of tiles.
- An isometric client rendering from server-owned logical positions.
- A server that never depends on Phaser, pixels, or screen layout.

No official coordinate system, conversion contract, or chunk constant has been defined before this ADR.

## Problem

Without a defined coordinate system:

- The coupling between server values and Phaser pixel positions is implicit and fragile.
- Adding a second map, a zone transition, or a different tile size would require rewriting unknown parts of the code.
- The server cannot determine which chunk, tile, or map an entity occupies.
- The isometric projection has no official formula shared between the terrain system and the entity rendering system.
- The temporary tilemap offset (`TILEMAP_TEST_OFFSET_X`) cannot be replaced by a principled approach.
- Distance rules (`RESOURCE_INTERACT_RANGE = 100`) have no documented unit, making their meaning ambiguous when tiles are introduced.

## Decision drivers

- The server must remain completely independent of Phaser, pixel values, and screen resolution.
- Screen positions must never be persisted.
- The world must support multiple maps of variable size.
- Chunks must remain a constant size to simplify loading, interest management, and server-side spatial indexing.
- The isometric projection must be a single, shared formula that aligns both tiles and entity sprites.
- The coordinate system must be defined before any implementation that builds on it.

## Considered options

### Option A — Keep world units equal to Phaser pixels

Continue using numeric `x`, `y` values that correspond 1:1 to Phaser pixel positions. Add conversion helpers as needed.

Rejected because: the coupling is implicit; the server would depend on client screen resolution to produce correct gameplay results; it cannot be extended to multiple maps or different tile sizes without large rewrites.

### Option B — Tile-first world coordinates with sub-tile precision

The server stores world positions as tile coordinates with sub-tile precision. The integer part identifies the tile; the fractional part represents the sub-tile offset within the tile. Screen positions are derived from these values using the isometric projection formula. This is the selected option. The physical storage mechanism (float, double, split integer columns, fixed precision) is a separate open question; see Open questions.

### Option C — Separate integer tile index and sub-tile offset columns

Store `worldTileX INT`, `worldTileY INT` for the tile position, and `subX FLOAT`, `subY FLOAT` for the within-tile offset. Cleaner schema semantics, higher query complexity.

Not selected at this time. Kept as a valid implementation strategy for the open storage question.

## Decision

The official world coordinate system is defined as follows.

### World hierarchy

```
World
└── Map      (identified by mapId)
    └── Chunk  (64 × 64 tiles, addressed by chunkX, chunkY)
        └── Tile  (addressed by localTileX, localTileY within the chunk)
```

### Constant

```
CHUNK_SIZE = 64   // tiles per side — invariant of the project
```

This constant never changes without a new ADR superseding this one.

### Official coordinates

These are the coordinates the server stores and reasons about.

| Name | Description | Persisted |
|---|---|---|
| `mapId` | Identifier of the map the entity belongs to | Yes |
| `worldTileX` | Position in world-tile space; integer part = tile column index, fractional part = sub-tile offset within the tile. Storage type: open question. | Yes |
| `worldTileY` | Position in world-tile space; integer part = tile row index, fractional part = sub-tile offset within the tile. Storage type: open question. | Yes |

The unit of `worldTileX` and `worldTileY` is **one tile**. A value of `5.0` means the entity is at the left edge of tile column 5. A value of `5.5` means it is at the horizontal center of that tile column.

### Derived coordinates

These are computed from the official coordinates when needed. They are never persisted.

| Name | Formula | Used by |
|---|---|---|
| `chunkX` | `floor(worldTileX / CHUNK_SIZE)` | Server (chunk membership, rooms), client (chunk loading) |
| `chunkY` | `floor(worldTileY / CHUNK_SIZE)` | Same |
| `localTileX` | `floor(worldTileX) % CHUNK_SIZE` | Server (Tiled layer lookup), client (tile addressing) |
| `localTileY` | `floor(worldTileY) % CHUNK_SIZE` | Same |
| `screenX` | `origin.x + (worldTileX − worldTileY) × HALF_TILE_W` | Client only |
| `screenY` | `origin.y + (worldTileX + worldTileY) × HALF_TILE_H` | Client only |
| `camera` | Phaser camera following the player sprite at `(screenX, screenY)` | Client only |

Where `HALF_TILE_W = 64` and `HALF_TILE_H = 32` for the current 128×64 isometric tile format.

### Projection formula

**World tile → isometric screen (client only)**

```
screenX = origin.x + (worldTileX − worldTileY) × HALF_TILE_W
screenY = origin.y + (worldTileX + worldTileY) × HALF_TILE_H
```

**Isometric screen → world tile (client only, for pointer input)**

```
worldTileX = ( (screenX − origin.x) / HALF_TILE_W  +  (screenY − origin.y) / HALF_TILE_H ) / 2
worldTileY = ( (screenY − origin.y) / HALF_TILE_H  −  (screenX − origin.x) / HALF_TILE_W ) / 2
```

### Origin

There is no global origin constant in the engine. Each map defines its own origin point: the Phaser world coordinates where the north vertex of tile (0, 0) of that map is rendered. This origin is a rendering configuration belonging to the client map loader, not a gameplay value. It is not persisted.

### Responsibilities

**Server (NestJS)**

- Owns the world hierarchy: world, maps, chunks, tiles.
- Stores and queries `mapId`, `worldTileX`, `worldTileY`.
- Computes gameplay logic: movement, collisions, range checks, aggro, loot, interaction.
- Computes `chunkX`, `chunkY` as needed for interest management and Socket.IO room scoping.
- Never knows about pixels, screen resolution, or Phaser internals.

**Client (Phaser)**

- Receives `mapId`, `worldTileX`, `worldTileY` from the server.
- Applies the isometric projection formula to compute `screenX`, `screenY` for each entity.
- Positions sprites and tiles at the computed screen positions using the map origin.
- Converts pointer input from Phaser world coordinates back to `worldTileX`, `worldTileY` before sending to the server.
- Manages the camera independently from gameplay coordinates.

**Tiled (map editor)**

- Authors maps as tile grids. Each Tiled file corresponds to a chunk or a set of chunks.
- Tile indices in Tiled export correspond directly to `localTileX`, `localTileY`.
- Tiled does not know about `worldTileX`, `worldTileY` or server gameplay values.
- Maps are exported in TMJ format. Tilesets are inlined. No external TSX reference at runtime.

## Rationale

The tile-first coordinate system eliminates the implicit coupling between server values and Phaser pixels. By defining 1 world unit = 1 tile, the server can:

- Determine chunk membership without any client involvement.
- Apply range checks and movement rules in units that are directly meaningful in the map grid.
- Support multiple maps by adding `mapId` to every position.

The isometric projection is placed entirely on the client. This respects the existing client-server trust boundary: the server is the authority on position, and the client is responsible only for rendering.

Keeping `origin` per-map rather than as a global constant ensures the engine does not embed assumptions about screen layout. Different maps may be placed at different Phaser world offsets without touching shared code.

## Consequences

### Positive

- The server coordinate system is independent of Phaser, screen resolution, and rendering engine.
- Screen positions can never be persisted by mistake.
- Chunk membership is computable server-side from the stored position.
- The isometric projection formula is explicit and shared between tile rendering and entity sprite placement, eliminating visual misalignment.
- Multiple maps with independent origins are supported without engine changes.
- The coordinate system scales with the world: adding more chunks to a map requires no formula change.

### Negative

- All existing entity positions stored as pixel-equivalent values must be migrated or reinterpreted. The migration strategy is an open question.
- Range constants (`RESOURCE_INTERACT_RANGE`, `patrolRadius`, speed values) are currently expressed in pixel-equivalent units and must be redefined in tile units. Their conversion is an open question.
- The client must perform the projection conversion on every rendered entity every frame. This is not new work, but it must be done correctly and consistently.

### Risks

- If the migration is partial, some entities may use old pixel coordinates and others tile coordinates simultaneously, causing incorrect gameplay calculations.
- If `origin` is defined inconsistently across map loaders, tile and sprite positions will diverge visually even though the formula is correct.
- If the server performs range checks before coordinates are migrated, interaction ranges will be incorrect for any entity whose coordinate space has changed.

### Impacted components

| Component | Impact |
|---|---|
| Database | Existing position columns must be reinterpreted or migrated; `mapId` must be added to all position-bearing entities |
| WebSocket payloads | All position payloads must carry `mapId`, `worldTileX`, `worldTileY` instead of raw `x`, `y` |
| Phaser client | All sprite placement must go through the projection formula; pointer input must be converted back to tile coordinates |
| Tiled pipeline | No format change; TMJ chunk files map directly to `localTileX`, `localTileY` grids |
| Admin tool | Coordinate display and `/tp` command must use tile coordinates |
| Pathfinding (`MapLoader`, `Pathfinder`) | Grid tile size must match `CHUNK_SIZE`; grid coordinates become `localTileX`, `localTileY` |
| Animal AI | Movement, aggro, fuite, and patrol logic must operate in tile units; speed and radius constants must be rescaled |
| Resources | Resource positions and interaction range must be expressed in tile units |
| NPCs (future) | Must use `mapId`, `worldTileX`, `worldTileY` from the start |
| Players | `syncLocalPlayer` must emit tile coordinates; `world_joined` must return tile coordinates |

## Security impact

The coordinate system change does not alter the client-server trust model. The server remains authoritative for all position, range, loot, and combat validation. Accepting `worldTileX` and `worldTileY` from the client is not more or less trusted than accepting `x` and `y`: the server must validate all incoming positions regardless of their unit.

The `mapId` field adds a new gameplay-sensitive value. The server must validate that a character is permitted to exist on the received `mapId`. A client must not be able to claim a position on a map the character has not entered.

Chunk membership computed server-side from `worldTileX`, `worldTileY` may be used to scope Socket.IO rooms. Room assignment must remain server-owned and not client-declared.

Screen coordinates and camera state are client-only. They must never influence server-side gameplay decisions.

## Performance impact

- Deriving `chunkX`, `chunkY` from `worldTileX`, `worldTileY` is two integer divisions per position update: negligible.
- Deriving `localTileX`, `localTileY` adds two modulo operations: negligible.
- The projection formula is two additions, two subtractions, and two multiplications per entity per frame on the client: negligible at current entity counts.
- Adding `mapId` to socket payloads adds one field per movement event: negligible.
- Future chunk-scoped Socket.IO rooms will reduce broadcast fanout, improving performance at scale. This is a consequence, not a cost.

## Migration and compatibility

Migration strategy is an open question. See Open questions below.

Until migration is complete, the existing `x`, `y` columns and pixel-equivalent values remain operative. No gameplay logic must mix migrated tile coordinates with unmigrated pixel coordinates in the same calculation.

Code using the new coordinate system must be isolated from code using the old system until a full cutover is validated.

## Validation

- [x] Existing implementation analyzed (character, animal, resource, respawn point, creature spawn, WorldScene, AnimalsService, ResourcesGateway).
- [x] Architecture proposal reviewed before this ADR.
- [ ] Related ADRs reviewed (no prior coordinate ADR exists).
- [x] Security impact reviewed.
- [x] Performance impact reviewed.
- [ ] Human approval recorded.
- [ ] Related documentation updated (deferred until this ADR is accepted).

## Open questions

- **Storage type**: should `worldTileX`, `worldTileY` be stored as `FLOAT`, `DOUBLE PRECISION`, a fixed-precision integer, or a pair of integer tile index plus sub-tile offset columns? Each strategy has trade-offs in schema clarity, query performance, and migration cost. This decision is deferred.
- **Migration strategy**: how should existing `positionX`/`positionY` pixel values be converted to `worldTileX`/`worldTileY` tile values? What is the conversion factor? Must existing gameplay constants (range, speed, radius) be rescaled, and by how much?
- **Speed and distance units**: `RESOURCE_INTERACT_RANGE = 100`, animal `patrolRadius`, and `speedMax` are currently in pixel-equivalent units. What are their values in tile units?
- **Sub-tile precision**: is float-precision sub-tile movement required for smooth animation, or can movement be snapped to discrete tiles at the server level and interpolated only on the client?
- **Official conversion constant**: if a `WU_TO_TILE` conversion factor is needed during migration, what is its value?

## Non-goals

- This ADR does not define a server collision engine.
- This ADR does not implement chunk loading or Socket.IO rooms.
- This ADR does not define the database migration procedure.
- This ADR does not specify how Tiled chunk files are named or stored.
- This ADR does not define multi-instance or sharding architecture.
- This ADR does not document gameplay mechanics beyond coordinate semantics.
- This ADR does not resolve the open storage type question.

## Security notes

Never persist screen coordinates. Never use client-reported screen coordinates for gameplay decisions. The server must validate `mapId` as a gameplay-sensitive value: a character cannot be accepted on a map it has not legitimately entered.

No real secret, token, password, hash, or private user data is documented here.

## Performance notes

The coordinate derivation formulas are arithmetic operations with no database queries, no network calls, and no allocation. They do not contribute meaningfully to server or client CPU load at current or projected entity counts.

Chunk-scoped Socket.IO rooms are a future consequence of this system. Their design and performance impact will be covered in a separate ADR or in `docs/01_Architecture/realtime-socketio.md`.

## Related files

- [ADR Index](README.md)
- [Architecture Decisions](../decisions.md)
- [Client Server Boundaries](../client-server-boundaries.md)
- [Realtime Socket.IO](../realtime-socketio.md)
- [Phaser World](../../03_Client/phaser-world.md)
- [Maps and Collisions](../../05_World/maps-and-collisions.md)
- [World Chunks](../../05_World/chunks.md)
- [Tiled](../../05_World/tiled.md)
- [Client Server Trust](../../02_Security/client-server-trust.md)
- [STATUS.md](../../../STATUS.md)

## TODO

- [ ] Obtain human approval and record it in `Approved by` and `Approval reference`.
- [ ] Set `Decision status` to `Accepted` after human validation.
- [ ] Set `Date accepted` after human validation.
- [ ] Update `docs/05_World/chunks.md` to reflect the official CHUNK_SIZE and derived coordinate definitions.
- [ ] Update `docs/05_World/maps-and-collisions.md` to reference this ADR for coordinate authority.
- [ ] Update `docs/03_Client/phaser-world.md` to document the projection formula as the official conversion.
- [ ] Update `docs/04_Server/websockets.md` to document that payloads carry `mapId`, `worldTileX`, `worldTileY`.
- [ ] Update `docs/06_Database/schema.md` when the storage type question is resolved.
- [ ] Resolve open questions in a follow-up session before implementation begins.
