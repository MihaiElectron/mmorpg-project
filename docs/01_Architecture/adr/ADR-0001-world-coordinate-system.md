# ADR-0001 — World coordinate system

## Metadata

- Status: Active
- Decision status: Accepted
- Owner: Project
- Last updated: 2026-06-22
- Date proposed: 2026-06-21
- Date accepted: 2026-06-22
- Approved by: Project owner
- Approval reference: Phase 1 WU migration — backfill exécuté (0 anomalie / 0 entité), `world.service.ts` entièrement migré, 65 tests `world-coordinates.ts` verts
- Depends on: docs/01_Architecture/adr/README.md, docs/01_Architecture/client-server-boundaries.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents: docs/05_World/chunks.md, docs/05_World/maps-and-collisions.md, docs/03_Client/phaser-world.md, docs/05_World/tiled.md
- Related code: apps/api-gateway/src/characters/entities/character.entity.ts, apps/api-gateway/src/creatures/entities/creature.entity.ts, apps/api-gateway/src/resources/entities/resource.entity.ts, apps/client/src/phaser/core/WorldScene.js

## Context

The project is a real-time web MMORPG with an isometric Phaser client and a NestJS server. At the time this ADR is written, all world entities (characters, creatures, resources, spawn points, respawn points) store numeric `x` and `y` values that are used directly as Phaser pixel coordinates. The server computes distances, speeds, and ranges against these values without knowing anything about pixels or screen projection.

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

### Option B — Logical world coordinates with sub-unit precision (selected)

The server stores world positions in a logical coordinate system where the
integer part of each coordinate identifies a tile and the fractional part
represents sub-unit precision. Screen positions are derived from these values
using the isometric projection formula. The coordinate names are `worldX` and
`worldY`. The exact unit of measure (tile float, WU, sub-tile integer, or
another equivalent representation) and the physical storage mechanism (FLOAT,
DOUBLE PRECISION, split integer columns) are both open questions — see Open
questions. This option is selected because it decouples coordinate semantics
(tile-relative, map-scoped, screen-independent) from physical representation.

### Option C — Separate integer tile index and sub-tile offset columns

Store `worldX INT` (tile column index), `worldY INT` (tile row index) for the tile position, and `subX FLOAT`, `subY FLOAT` for the within-tile offset. Cleaner schema semantics, higher query complexity.

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

### Constants

```
CHUNK_SIZE      = 64       // tiles per side per chunk — invariant of the project
TILE_SIZE_WU    = 1024     // World Units per tile (2^10) — invariant of the project
CHUNK_SIZE_WU   = 65 536   // World Units per chunk side (CHUNK_SIZE × TILE_SIZE_WU)
NAV_CELLS_PER_TILE = 8    // navigation grid subdivisions per tile (client only)
NAV_CELL_SIZE_WU   = 128  // WU per nav cell (TILE_SIZE_WU / NAV_CELLS_PER_TILE = 2^7)
```

These constants never change without a new ADR superseding this one. `TILE_SIZE_WU` is a power of 2 (2^10), which enables efficient extraction of tile and chunk indices from a coordinate integer via bit operations.

`NAV_CELL_SIZE_WU` and `NAV_CELLS_PER_TILE` are client-only constants used by the pathfinding system. They subdivide each logical tile into an 8×8 navigation grid for sub-tile collision resolution. They are not used by the server.

### Official coordinates

These are the coordinates the server stores and reasons about.

| Name | Description | Persisted |
|---|---|---|
| `mapId` | Identifier of the map the entity belongs to | Yes |
| `worldX` | Position along the world X axis. Signed integer in **World Units (WU)**. `1 tile = 1024 WU = TILE_SIZE_WU`. | Yes |
| `worldY` | Position along the world Y axis. Signed integer in **World Units (WU)**. `1 tile = 1024 WU = TILE_SIZE_WU`. | Yes |

**The official logical unit is the World Unit (WU). `1 tile logique = 1024 WU`.**

`worldX` and `worldY` are **signed integers**. The architectural rationale for this choice (determinism, interoperability, bit-field spatial hierarchy) is documented in `docs/08_Gameplay/world-units-study.md`.

The bit layout of a WU coordinate encodes the full spatial hierarchy:

```
tileIndex   = worldX >> 10              // global tile column index
chunkIndex  = worldX >> 16              // chunk column index (since 2^10 × 2^6 = 2^16)
localTile   = (worldX >> 10) & 63       // tile within chunk [0, CHUNK_SIZE − 1]
subTile     = worldX & 1023             // sub-tile offset [0, TILE_SIZE_WU − 1]
```

These bit operations must not be inlined in application code. See **Warning: magic constants** below.

### Derived coordinates

These are computed from the official coordinates when needed. They are never persisted.

| Name | Formula (WU) | Used by |
|---|---|---|
| `tileX` | `worldX >> 10` | Server and client — global tile column index |
| `tileY` | `worldY >> 10` | Same — global tile row index |
| `chunkX` | `worldX >> 16` | Server (chunk membership, rooms), client (chunk loading) |
| `chunkY` | `worldY >> 16` | Same |
| `localTileX` | `(worldX >> 10) & (CHUNK_SIZE − 1)` | Server (Tiled layer lookup), client (tile addressing) |
| `localTileY` | `(worldY >> 10) & (CHUNK_SIZE − 1)` | Same |
| `subTileX` | `worldX & (TILE_SIZE_WU − 1)` | Server simulation — sub-tile offset [0, 1023] |
| `subTileY` | `worldY & (TILE_SIZE_WU − 1)` | Same |
| `screenX` | `origin.x + (worldX − worldY) / 16` | Client only (Phaser world pixels) |
| `screenY` | `origin.y + (worldX + worldY) / 32` | Client only (Phaser world pixels) |
| `camera` | Phaser camera following the player sprite at `(screenX, screenY)` | Client only |

Where the pixel factor per WU is `HALF_TILE_W / TILE_SIZE_WU = 64 / 1024 = 1/16` on the X axis and `HALF_TILE_H / TILE_SIZE_WU = 32 / 1024 = 1/32` on the Y axis, for the current 128×64 isometric tile format.

### Projection formula

**World position (WU) → isometric screen (client only)**

```
screenX = origin.x + (worldX − worldY) × (HALF_TILE_W / TILE_SIZE_WU)
        = origin.x + (worldX − worldY) / 16

screenY = origin.y + (worldX + worldY) × (HALF_TILE_H / TILE_SIZE_WU)
        = origin.y + (worldX + worldY) / 32
```

**Isometric screen → world position in WU (client only, for pointer input)**

```
worldX = round( 8 × (screenX − origin.x) + 16 × (screenY − origin.y) )
worldY = round( −8 × (screenX − origin.x) + 16 × (screenY − origin.y) )
```

The coefficients 8 and 16 are `TILE_SIZE_WU / HALF_TILE_W / 2 = 1024 / 64 / 2` and `TILE_SIZE_WU / HALF_TILE_H / 2 = 1024 / 32 / 2` respectively. `round()` is applied because pointer input in Phaser world pixels rarely falls exactly on a WU boundary.

`HALF_TILE_W = 64` and `HALF_TILE_H = 32` are derived from the tile visual dimensions (128 × 64 px).

### Unit domains

Four unit domains coexist in this system. They must not be conflated.

| Domain | Unit | Where | Status |
|---|---|---|---|
| **Server logic** | World Unit (WU) — signed integer, `1 tile = 1024 WU` | `worldX`, `worldY`, `mapId` | **Decided — this ADR** |
| **Logical tile grid** | Tile — integer index | Derived: `tileX = worldX >> 10` | Derived from WU |
| **Client rendering** | Phaser world pixel | `screenX`, `screenY` — never persisted | Derived via projection formula |
| **Map editing (Tiled)** | Tile index (integer) | `localTileX = (worldX >> 10) & 63` | Compatible with tile grid |

A fifth domain — **gameplay distance metric** — is not decided by this ADR. The choice between Euclidean WU distance, Euclidean pixel distance (projected), Chebyshev, or Manhattan determines the effective shape of range checks (melee, gathering, aggro). This decision is deferred to gameplay calibration.

### Warning: magic constants

The constants derived from `TILE_SIZE_WU = 1024` — specifically the bit operations `>> 10`, `& 1023`, `>> 16`, and the projection scalars `1/16` and `1/32` — must **not** be inlined in application code. When migration begins, all conversions between WU, tile, and chunk spaces must be centralized in a dedicated world-coordinates module. Application code must call named functions (`tileXFromWU`, `chunkXFromWU`, `wuToScreenX`, etc.) rather than operating on the bit representation directly.

### Origin

There is no global origin constant in the engine. Each map defines its own origin point: the Phaser world coordinates where the north vertex of tile (0, 0) of that map is rendered. This origin is a rendering configuration belonging to the client map loader, not a gameplay value. It is not persisted.

### Responsibilities

**Server (NestJS)**

- Owns the world hierarchy: world, maps, chunks, tiles.
- Stores and queries `mapId`, `worldX`, `worldY`.
- Computes gameplay logic: movement, collisions, range checks, aggro, loot, interaction.
- Computes `chunkX`, `chunkY` as needed for interest management and Socket.IO room scoping.
- Never knows about pixels, screen resolution, or Phaser internals.

**Client (Phaser)**

- Receives `mapId`, `worldX`, `worldY` from the server.
- Applies the isometric projection formula to compute `screenX`, `screenY` for each entity.
- Positions sprites and tiles at the computed screen positions using the map origin.
- Converts pointer input from Phaser world coordinates back to `worldX`, `worldY` before sending to the server (`screenToWorldWU` in `worldCoordinates.ts`).
- Sends `{ worldX, worldY, mapId, direction }` in `player_move` — the server derives the pixel cache.
- Manages the camera independently from gameplay coordinates.
- Maintains a `NavGrid` (8×8 nav cells per tile, `NAV_CELL_SIZE_WU = 128 WU`) derived from the collision tile layer for A\* pathfinding. The NavGrid is client-only and never sent to the server.

**Tiled (map editor)**

- Authors maps as tile grids. Each Tiled file corresponds to a chunk or a set of chunks.
- Tile indices in Tiled export correspond directly to `localTileX`, `localTileY`.
- Tiled does not know about `worldX`, `worldY` or server gameplay values.
- Maps are exported in TMJ format. Tilesets are inlined. No external TSX reference at runtime.

## Rationale

The logical coordinate system eliminates the implicit coupling between server values and Phaser pixels. Positions expressed as `(worldX, worldY, mapId)` in World Units are stable: their value does not depend on Phaser scene bounds, screen resolution, or tile visual dimensions.

World Units (1 tile = 1024 WU = 2^10) were selected for their architectural properties:

- **Determinism**: integer arithmetic is identical across all platforms, compilers, and languages. Unlike IEEE 754 floating-point, the result of `worldX + 112` is always the same regardless of environment.
- **Interoperability**: integer values transfer without precision loss across JSON, binary protocols, and database engines.
- **Spatial hierarchy**: bit operations expose the full hierarchy without division: `tileX = worldX >> 10`, `chunkX = worldX >> 16`.
- **Absence of NaN/Infinity**: these pathological floating-point states cannot occur in integer arithmetic.
- **Compact storage**: int32 (4 bytes) versus float64 (8 bytes).

The supporting analysis is in `docs/08_Gameplay/world-units-study.md`.

The server can:
- Determine chunk membership without any client involvement.
- Apply range checks and movement rules in units directly meaningful in the map grid.
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

- All existing entity positions stored as pixel-equivalent values must be converted to World Units using the inverse projection formula × `TILE_SIZE_WU`. The conversion is not a scalar — it varies by direction (see `docs/08_Gameplay/world-units-study.md`). The migration strategy is defined in ADR-0003.
- Range constants (`RESOURCE_INTERACT_RANGE`, `patrolRadius`, speed values) are currently in pixel-equivalent units and must be recalibrated in WU. Their numerical values are not decided yet (deferred to gameplay calibration).
- The client must perform the projection conversion on every rendered entity every frame. This is not new work, but it must be done correctly and consistently.

### Risks

- If the migration is partial, some entities may use old pixel coordinates and others WU simultaneously, causing incorrect gameplay calculations.
- If `origin` is defined inconsistently across map loaders, tile and sprite positions will diverge visually even though the formula is correct.
- If the server performs range checks before coordinates are migrated, interaction ranges will be incorrect for any entity whose coordinate space has changed.

### Impacted components

| Component | Impact |
|---|---|
| Database | Existing position columns must be reinterpreted or migrated; `mapId` must be added to all position-bearing entities |
| WebSocket payloads | All position payloads must carry `mapId`, `worldX`, `worldY` instead of raw `x`, `y` |
| Phaser client | All sprite placement must go through the projection formula; pointer input must be converted back to `worldX`, `worldY` |
| Tiled pipeline | No format change; TMJ chunk files map directly to `localTileX`, `localTileY` grids |
| Admin tool | Coordinate display and `/tp` command must use `worldX`, `worldY` |
| Pathfinding (`MapLoader`, `Pathfinder`) | Grid tile size must match `CHUNK_SIZE`; grid coordinates become `localTileX`, `localTileY` |
| Creature AI | Movement, aggro, fuite, and patrol logic must operate in WU; speed (WU/s) and radius (WU) constants must be recalibrated |
| Resources | Resource positions and interaction range must be expressed in WU |
| NPCs (future) | Must use `mapId`, `worldX`, `worldY` from the start |
| Players | `syncLocalPlayer` must emit `worldX`, `worldY`; `world_joined` must return `worldX`, `worldY` |

## Security impact

The coordinate system change does not alter the client-server trust model. The server remains authoritative for all position, range, loot, and combat validation. Accepting `worldX` and `worldY` from the client is not more or less trusted than accepting `x` and `y`: the server must validate all incoming positions regardless of their unit.

The `mapId` field adds a new gameplay-sensitive value. The server must validate that a character is permitted to exist on the received `mapId`. A client must not be able to claim a position on a map the character has not entered.

Chunk membership computed server-side from `worldX`, `worldY` may be used to scope Socket.IO rooms. Room assignment must remain server-owned and not client-declared.

Screen coordinates and camera state are client-only. They must never influence server-side gameplay decisions.

## Performance impact

- Deriving `chunkX`, `chunkY` from `worldX`, `worldY` is two right-shifts per position update: negligible.
- Deriving `localTileX`, `localTileY` is one right-shift plus one bitwise AND per axis: negligible.
- The projection formula is two additions, two subtractions, and two multiplications per entity per frame on the client: negligible at current entity counts.
- Adding `mapId` to socket payloads adds one field per movement event: negligible.
- Future chunk-scoped Socket.IO rooms will reduce broadcast fanout, improving performance at scale. This is a consequence, not a cost.

## Migration and compatibility

Migration strategy is an open question. See Open questions below.

Until migration is complete, the existing `x`, `y` columns and pixel-equivalent values remain operative. No gameplay logic must mix migrated WU coordinates with unmigrated pixel coordinates in the same calculation.

Code using the new coordinate system must be isolated from code using the old system until a full cutover is validated.

## Validation

- [x] Existing implementation analyzed (character, creature, resource, respawn point, creature spawn, WorldScene, CreaturesService, ResourcesGateway).
- [x] Architecture proposal reviewed before this ADR.
- [x] Related ADRs reviewed (ADR-0002, ADR-0003 — both use `worldX/worldY` naming).
- [x] Security impact reviewed.
- [x] Performance impact reviewed.
- [x] Human approval recorded (Project owner, 2026-06-22).
- [x] Core coordinate system implemented and tested (65 tests `world-coordinates.ts`, 16 tests `world.service.spec.ts`, backfill 0 anomalie).

## Open questions

- **Storage column type**: RESOLVED — `INTEGER` (int32) chosen. All WU columns use `@Column({ type: 'int', nullable: true })` in TypeORM entities. int32 supports maps up to ~2 M tiles per axis (int32 max / TILE_SIZE_WU), sufficient for the current project scope.

- **Migration strategy**: RESOLVED — additive columns (`worldX`, `worldY`, `mapId` nullable) + backfill script (executed 2026-06-22, 0 anomalies). Legacy columns removed in P7-D (2026-06-26). TypeORM migration `1782432000000-DropLegacyPixelColumns` created. Backfill scripts deleted (one-time task complete).

- **Tilemap origin offset**: RESOLVED — `WORLD_ORIGIN_X_PX = 1000` defined in `world-coordinates.ts`. Derived from `TILEMAP_TEST_OFFSET_X (936) + ISO_HALF_TILE_WIDTH_PX (64)` (north vertex of tile 0,0). `TILEMAP_TEST_OFFSET_X` remains in `WorldScene.js` as a Phaser visual offset; it is not part of the coordinate system.

- **Speed and range constants in WU**: DEFERRED — `RESOURCE_INTERACT_RANGE = 100`, `MELEE_RANGE = 60`, creature `patrolRadius`, `speedMax` remain in pixel-equivalent units. Calibration in WU/s is scheduled for Phase 2 (migration `creatures.service.ts`).

- **Gameplay distance metric**: PARTIALLY RESOLVED — Chebyshev WU selected for respawn point proximity (`chebyshevDistanceWU` in `world-coordinates.ts:162`). Combat and gathering distance metric deferred to Phase 2 along with speed/range calibration.

## Non-goals

- This ADR does not define a server collision engine.
- This ADR does not implement chunk loading or Socket.IO rooms.
- This ADR does not define the database migration procedure.
- This ADR does not specify how Tiled chunk files are named or stored.
- This ADR does not define multi-instance or sharding architecture.
- This ADR does not document gameplay mechanics beyond coordinate semantics.
- This ADR does not define the gameplay distance metric (Euclidean WU, pixel, Chebyshev, Manhattan).
- This ADR does not calibrate speed or range constants in WU.

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
- [World Units Study](../../08_Gameplay/world-units-study.md)
- [Phaser World](../../03_Client/phaser-world.md)
- [Maps and Collisions](../../05_World/maps-and-collisions.md)
- [World Chunks](../../05_World/chunks.md)
- [Tiled](../../05_World/tiled.md)
- [Client Server Trust](../../02_Security/client-server-trust.md)
- [STATUS.md](../../../STATUS.md)

## TODO

- [x] Obtain human approval and record it in `Approved by` and `Approval reference`. *(Project owner, 2026-06-22)*
- [x] Set `Decision status` to `Accepted` after human validation.
- [x] Set `Date accepted` after human validation.
- [x] Resolve storage column type and migration strategy open questions.
- [ ] Update `docs/05_World/chunks.md` to reflect the official CHUNK_SIZE and derived coordinate definitions. *(deferred until ADR-0003 accepted)*
- [ ] Update `docs/05_World/maps-and-collisions.md` to reference this ADR for coordinate authority.
- [ ] Update `docs/03_Client/phaser-world.md` to document the projection formula as the official conversion.
- [x] Update `docs/04_Server/websockets.md` to document that payloads carry `mapId`, `worldX`, `worldY`. *(P0–P6 soldés — protocole WebSocket entièrement WU)*
- [ ] Update `docs/06_Database/schema.md` — column type `INTEGER` confirmed; legacy columns removed P7-D (update the schema doc to reflect final state).
- [ ] Calibrate speed and range constants in WU/s (Phase 2 prerequisite for ADR-0003 distance gate).
- [ ] Finalize gameplay distance metric for combat and gathering (Chebyshev vs Euclidean WU).
