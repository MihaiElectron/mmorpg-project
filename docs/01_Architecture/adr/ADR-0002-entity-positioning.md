# ADR-0002 — Entity positioning

## Metadata

- Status: Stable
- Decision status: Accepted / Implemented
- Owner: Project
- Last updated: 2026-06-26
- Date proposed: 2026-06-21
- Date accepted: 2026-06-26
- Approved by: Project owner (migration P7-D complète, commit `1ea4c6e`)
- Approval reference: STATUS.md — session 2026-06-26
- Depends on: docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md, docs/01_Architecture/client-server-boundaries.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents: docs/05_World/maps-and-collisions.md, docs/04_Server/websockets.md, docs/06_Database/schema.md
- Related code: apps/api-gateway/src/characters/entities/character.entity.ts, apps/api-gateway/src/creatures/entities/creature.entity.ts, apps/api-gateway/src/resources/entities/resource.entity.ts, apps/api-gateway/src/creatures/entities/creature-spawn.entity.ts, apps/api-gateway/src/world/entities/respawn-point.entity.ts

## Context

ADR-0001 defines the official world coordinate system: all positions are expressed as `mapId`, `worldX`, and `worldY`. The official unit is the World Unit (WU), where `1 tile = 1024 WU`. `worldX` and `worldY` are signed integers. The architectural rationale is in `docs/08_Gameplay/world-units-study.md`. Screen coordinates are never persisted and the server is fully independent of Phaser.

At the time this ADR was written (2026-06-21), five entity types carried world positions in legacy pixel columns. The migration described here is now complete (2026-06-26).

| Entity | Legacy columns (removed P7-D) | Current columns (sole truth) | Movement | Precision |
|---|---|---|---|---|
| `character` | ~~`positionX INT`, `positionY INT`~~ | `worldX`, `worldY`, `mapId` | Dynamic | Sub-tile |
| `creature` | ~~`x INT`, `y INT`~~ | `worldX`, `worldY`, `mapId` | Dynamic | Sub-tile |
| `resource` | ~~`x INT`, `y INT`~~ | `worldX`, `worldY`, `mapId` | Static | Tile-exact |
| `creature_spawn` | ~~`spawnX INT`, `spawnY INT`~~ | `worldX`, `worldY`, `mapId` | Static | Tile-exact |
| `respawn_point` | ~~`x INT`, `y INT`~~ | `worldX`, `worldY`, `mapId`, `radius` (pixels — intentional debt) | Static | Tile-exact |

All legacy columns have been removed in P7-D (commit `1ea4c6e`). A TypeORM production migration `1782432000000-DropLegacyPixelColumns` was created.

This ADR defines how each entity type stores and uses coordinates under ADR-0001.

## Problem

Without a defined entity positioning policy:

- `mapId` cannot be added consistently to entities because there is no column naming convention.
- Static and dynamic entities have different precision requirements, but no rule separates them.
- WebSocket payloads carry `x` and `y` without a defined unit or map scope.
- Server-side gameplay logic (`checkInteraction`, `patrolRadius`, `speedMax`) cannot be migrated to World Units (WU) without knowing which entities use which precision level.
- It is not clear which entity types need continuous sub-tile positions and which can use integer tile positions.

## Decision drivers

- Column naming must be uniform and match the coordinate vocabulary from ADR-0001.
- `mapId` must be added to every entity that carries a world position.
- Static entities (no runtime movement) should use tile-exact integer positions for schema clarity.
- Dynamic entities (server-driven or player-driven movement) require sub-tile precision.
- WebSocket payloads must carry `mapId`, `worldX`, `worldY` for all position updates.
- The server remains authoritative: positions received from the client are intentions, not facts.
- The DB column type for `worldX`/`worldY` is a signed integer (`INTEGER` by default, `BIGINT` for very large worlds) as decided in ADR-0001.

## Considered options

### Option A — Uniform schema for all entities

All entities use the same column names (`mapId`, `worldX`, `worldY`) with the same type regardless of whether they move. Static entities would carry unused fractional precision.

Simpler to implement and query uniformly. Slight schema waste for static entities.

### Option B — Differentiated schema by movement class

Static entities use integer tile columns (`mapId`, `tileX INT`, `tileY INT`). Dynamic entities use continuous tile columns (`mapId`, `worldX`, `worldY`).

More semantically precise. Introduces two column sets to maintain, and a conversion step when a static entity reference is compared to a dynamic entity position.

### Option C — Uniform column names, type varies by entity

All entities use `mapId`, `worldX`, `worldY`. Static entities store integer values; dynamic entities store float values. The column type is the same (decided by ADR-0001 storage resolution) and the fractional part is simply zero for static entities.

This is the selected option. It preserves uniform naming while naturally encoding the static/dynamic distinction through the stored value.

## Decision

### Column naming convention

All position-bearing entities adopt the following columns:

| Column | Type | Description |
|---|---|---|
| `mapId` | `INT` (FK to future `map` entity, or string identifier) | Map the entity belongs to |
| `worldX` | Signed integer — `INTEGER` (int32) by default; `BIGINT` (int64) if world exceeds 2 097 151 tiles per axis | X position in **World Units (WU)**, `1 tile = 1024 WU` |
| `worldY` | Signed integer — `INTEGER` (int32) by default; `BIGINT` (int64) if world exceeds 2 097 151 tiles per axis | Y position in **World Units (WU)**, `1 tile = 1024 WU` |

`worldX` and `worldY` are signed integers in World Units (WU) as defined by ADR-0001. The exact column type (`INTEGER` vs `BIGINT`) is confirmed at migration time based on world size.

### Entity classification

| Entity | Movement class | `worldX/Y` value | Notes |
|---|---|---|---|
| `character` | Dynamic | Continuous WU integer (sub-tile via `& 1023`) | Controlled by player input; server validates |
| `creature` | Dynamic | Continuous WU integer (sub-tile via `& 1023`) | Driven by server AI; always authoritative |
| `resource` | Static | Integer (whole tile) | Placed at map authoring time; never moves |
| `creature_spawn` | Static | Integer (whole tile) | Spawn point; never moves at runtime |
| `respawn_point` | Static | Integer (whole tile) | Respawn anchor; never moves at runtime |

Static entities store whole-tile values (`worldX = 12 × 1024 = 12288`, `worldY = 7 × 1024 = 7168`). Their sub-tile offset is always zero. This allows uniform column names while preserving the semantic distinction between static and dynamic entities.

### WebSocket payload contract

All socket events that carry a world position must include `mapId`, `worldX`, and `worldY`. Events that currently use `x` and `y` must be updated.

| Event | Direction | Current payload | Target payload |
|---|---|---|---|
| `player_move` | Client → Server | `{ x, y, direction }` | `{ mapId, worldX, worldY, direction }` |
| `player_moved` | Server → Client | `{ x, y, direction, ... }` | `{ mapId, worldX, worldY, direction, ... }` |
| `world_joined` | Server → Client | `{ x, y, ... }` | `{ mapId, worldX, worldY, ... }` |
| `character_teleport` | Server → Client | `{ x, y }` | `{ mapId, worldX, worldY }` |
| `character_respawn` | Server → Client | `{ x, y, ... }` | `{ mapId, worldX, worldY, ... }` |
| `creatures` / `creature_update` | Server → Client | `{ x, y, ... }` | `{ mapId, worldX, worldY, ... }` |
| `resources` | Server → Client | `{ x, y, ... }` | `{ mapId, worldX, worldY, ... }` |

`mapId` is mandatory in every position-carrying payload. A client must not infer map context from connection state alone.

### Server authority

- All incoming position values (`worldX`, `worldY`) are client intentions. They must be validated server-side before producing gameplay effects.
- The server must reject or correct positions outside the bounds of the declared `mapId`.
- `mapId` must be validated: a character cannot report a position on a map it has not legitimately entered.
- Dynamic entity positions are authoritative only when set by the server (AI-driven creatures, admin teleport, respawn). Client-reported positions are inputs to server validation.

## Rationale

Option C (uniform naming, value distinguishes static/dynamic) avoids introducing two parallel column sets while keeping schema and query patterns consistent across all entity types. Static entities naturally store integer tile values; the column names remain identical to dynamic entities, which simplifies generic position queries and future chunk-based interest management.

Defining the WebSocket payload contract in this ADR ensures that the coordinate rename (`x/y` → `worldX/worldY`) happens consistently across all events rather than being patched event by event.

Uniform naming with a signed integer column type (decided in ADR-0001) avoids introducing two parallel column sets while keeping query patterns consistent across all entity types.

## Consequences

### Positive

- Uniform column naming across all entities: `mapId`, `worldX`, `worldY`.
- Multi-map support is structurally ready: every position already carries `mapId`.
- WebSocket payloads carry explicit map context, enabling future chunk-scoped room filtering.
- Static and dynamic entities share the same query patterns.

### Negative

- All five position-bearing entities require schema migration: column renames and addition of `mapId`.
- All socket events carrying `x/y` must be updated on both server and client sides simultaneously.
- The `mapId` FK target (a `map` entity or table) does not exist yet; a placeholder value or nullable column is required during migration.

### Risks

- Mixed-state migration: if some entities are migrated and others are not, gameplay logic comparing positions across entity types will produce incorrect results. Migration must be atomic per entity type.
- `mapId` dependency: until a `map` table or entity is defined, `mapId` cannot be a foreign key with referential integrity. Using a nullable or unconstrained column is a temporary compromise.
- Client and server payload changes must be deployed together. A mismatch between client sending `{ x, y }` and server expecting `{ worldX, worldY }` would break all position events.

### Impacted components

| Component | Impact | Status |
|---|---|---|
| `character` entity | ~~Rename `positionX/Y` → `worldX/Y`; add `mapId`~~ | ✅ Done (P1–P7) |
| `creature` entity | ~~Rename `x/y` → `worldX/Y`; add `mapId`~~ | ✅ Done |
| `resource` entity | ~~Rename `x/y` → `worldX/Y`; add `mapId`~~ | ✅ Done |
| `creature_spawn` entity | ~~Rename `spawnX/Y` → `worldX/Y`; add `mapId`~~ | ✅ Done |
| `respawn_point` entity | ~~Rename `x/y` → `worldX/Y`; add `mapId`~~ | ✅ Done (`radius` intentionally in pixels) |
| `WorldService` | ~~Update all position reads/writes; add `mapId` validation~~ | ✅ Done |
| `CreaturesService` | ~~Update AI movement; rename `x/y` fields; add `mapId` context~~ | ✅ Done (session 3) |
| `ResourcesGateway` | ~~Update range check to use `worldX/Y`; validate `mapId`~~ | ✅ Done (`MOVE_TOLERANCE_WU`) |
| `WorldGateway` | ~~Update `player_move` and join handlers; broadcast `mapId`~~ | ✅ Done (P0–P5) |
| WebSocket payloads | ~~All position events: `x/y` → `worldX/Y`, add `mapId`~~ | ✅ Done (P0–P6) |
| Phaser client | ~~All sprite positioning: use projection formula from ADR-0001~~ | ✅ Done (`resolveScreen()`) |
| Admin tool | ~~`/tp` and coordinate display: WU, `mapId` required~~ | ✅ Done (P6) |
| Seeds | ~~Hardcoded positions must be expressed in WU with `mapId`~~ | ✅ Done (backfill + seeds) |

## Security impact

Adding `mapId` to payloads introduces a new gameplay-sensitive value. The server must:

- Validate that the character is present on the claimed `mapId` before processing any position.
- Never trust `mapId` from the client as authorization to access a map. Map access must be granted server-side (zone entry, login placement, teleport).
- Validate `worldX` and `worldY` ranges against the declared map bounds.

The coordinate rename does not weaken the existing trust model. Client-reported positions remain intentions that the server validates.

## Performance impact

- Column renames have no runtime query performance impact.
- Adding `mapId` adds one integer field per position query. For indexed queries by chunk or zone, `mapId` becomes a useful partition key.
- WebSocket payload size increases by one field (`mapId`) per position event: negligible.
- The projection formula cost on the client (from ADR-0001) is unchanged.

## Migration and compatibility

Migration order is an open question. A safe approach:

1. Confirm DB column type (`INTEGER` vs `BIGINT`) based on planned world size.
2. Migrate entities one type at a time, starting with static entities (resources, spawns, respawn points) where no in-memory state is affected.
3. Migrate dynamic entities (characters, creatures) with a cutover that updates both entity columns and WebSocket payloads simultaneously.
4. Seed data must be updated to use WU values before or at migration time.

No mixed-state operation: during migration of a given entity type, all code paths that read or write its position must be updated atomically.

## Validation

- [x] Existing entity schemas analyzed (character, creature, resource, creature_spawn, respawn_point).
- [x] Existing socket events analyzed (player_move, player_moved, world_joined, character_teleport, character_respawn, creatures, creature_update, resources).
- [x] ADR-0001 reviewed.
- [x] Security impact reviewed.
- [x] Performance impact reviewed.
- [x] Human approval recorded (migration executed and committed — P1–P7, 2026-06-22 to 2026-06-26).
- [x] Related documentation updated (STATUS.md, wu-migration-audit.md, websocket-wu-migration-study.md, ADR-0001, glossary).

## Open questions (resolved)

- **`mapId` type and FK target** → resolved: `mapId INTEGER` nullable, default `1` for the single map. FK target deferred until a `map` entity is created.
- **Migration order** → resolved: static entities first (resources, spawns, respawn points), then dynamic (creatures, characters). Backfill script (`wu-backfill-real.ts`) executed 2026-06-22 then deleted 2026-06-26.
- **Seed data** → resolved: seeds rewritten to use WU values. Inverse projection formula from ADR-0001 used for conversion.
- **`mapId` default value** → resolved: `DEFAULT_MAP_ID = 1` used for all existing entities.
- **Payload backward compatibility** → resolved: dual-format (P1–P4) then hard cutover (P5–P7). No backward compatibility needed post-P7.

## Remaining intentional debt

- `RespawnPoint.radius` : stored in pixels. `legacyRadiusToWU()` available. Faible criticité.
- `CreatureTemplate` AI fields (`aggroRadius`, `patrolRadius`, `speedMin/Max`) : stored in pixels. `legacyRadiusToWU()` converts at runtime. Future migration needed if per-unit calibration is required.

## Non-goals

- This ADR does not define the `map` entity or table.
- This ADR does not define chunk loading or unloading logic.
- This ADR does not define the DB migration scripts.
- This ADR does not define how `mapId` is assigned at player login or world join.
- This ADR does not define zone transition mechanics.
- This ADR does not define the gameplay distance metric.
- This ADR does not calibrate speed or range constants in WU.
- This ADR does not define the migration conversion formula (see ADR-0001 and ADR-0003).

## Security notes

`mapId` is gameplay-sensitive. It must be validated server-side on every position event. A client cannot declare itself on an arbitrary map.

Position values (`worldX`, `worldY`) remain client intentions for dynamic entities. Static entity positions are set by server-side seeds or admin tools only and are not accepted from regular clients.

No real secret, token, password, hash, or private user data is documented here.

## Performance notes

Position columns are read and written on every movement event and every AI tick. Column type choice (from ADR-0001) directly affects the cost of these operations. Once `mapId` is indexed, chunk-based filtering becomes possible and will reduce broadcast fanout.

## Related files

- [ADR-0001 — World coordinate system](ADR-0001-world-coordinate-system.md)
- [ADR Index](README.md)
- [Architecture Decisions](../decisions.md)
- [Client Server Boundaries](../client-server-boundaries.md)
- [Client Server Trust](../../02_Security/client-server-trust.md)
- [Maps and Collisions](../../05_World/maps-and-collisions.md)
- [World Chunks](../../05_World/chunks.md)
- [Phaser World](../../03_Client/phaser-world.md)
- [Server WebSockets](../../04_Server/websockets.md)
- [Database Schema](../../06_Database/schema.md)
- [World Units Study](../../08_Gameplay/world-units-study.md)
- [STATUS.md](../../../STATUS.md)

## TODO

- [x] Obtain human approval — recorded via migration execution (P1–P7, 2026-06-22/26).
- [x] Set `Decision status` to `Accepted`.
- [x] Set `Date accepted` to 2026-06-26.
- [x] Confirm DB column type — `INTEGER` (int32) confirmed; world size does not require `BIGINT`.
- [x] Define `mapId` — integer, nullable, default `1`; FK deferred.
- [x] Define migration order and transition strategy — executed and complete.
- [ ] Update `docs/04_Server/websockets.md` to document the final payload format.
- [ ] Update `docs/06_Database/schema.md` to reflect removed legacy columns.
- [x] Update seed files — seeds use WU values.
