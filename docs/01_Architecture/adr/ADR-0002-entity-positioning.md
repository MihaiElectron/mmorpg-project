# ADR-0002 — Entity positioning

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-06-21
- Date proposed: 2026-06-21
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
- Depends on: docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md, docs/01_Architecture/client-server-boundaries.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents: docs/05_World/maps-and-collisions.md, docs/04_Server/websockets.md, docs/06_Database/schema.md
- Related code: apps/api-gateway/src/characters/entities/character.entity.ts, apps/api-gateway/src/animals/entities/animal.entity.ts, apps/api-gateway/src/resources/entities/resource.entity.ts, apps/api-gateway/src/animals/entities/creature-spawn.entity.ts, apps/api-gateway/src/world/entities/respawn-point.entity.ts

## Context

ADR-0001 defines the official world coordinate system: all positions are expressed as `mapId`, `worldX`, and `worldY`. The logical unit of `worldX` and `worldY` is an open question — see `docs/08_Gameplay/world-units-study.md`. It establishes that screen coordinates are never persisted and that the server is fully independent of Phaser.

At the time this ADR is written, five entity types carry world positions:

| Entity | Current columns | Movement | Precision needed |
|---|---|---|---|
| `character` | `positionX INT`, `positionY INT` | Continuous, server-tracked in memory | Sub-tile |
| `animal` | `x INT`, `y INT` | Continuous, server-driven AI | Sub-tile |
| `resource` | `x INT`, `y INT` | Static | Tile-exact |
| `creature_spawn` | `spawnX INT`, `spawnY INT` | Static | Tile-exact |
| `respawn_point` | `x INT`, `y INT` | Static | Tile-exact |

None of these entities carry a `mapId`. Column naming is inconsistent (`positionX`, `x`, `spawnX`). No entity references `worldX` or `worldY`.

This ADR defines how each entity type stores and uses coordinates under ADR-0001.

## Problem

Without a defined entity positioning policy:

- `mapId` cannot be added consistently to entities because there is no column naming convention.
- Static and dynamic entities have different precision requirements, but no rule separates them.
- WebSocket payloads carry `x` and `y` without a defined unit or map scope.
- Server-side gameplay logic (`checkInteraction`, `patrolRadius`, `speedMax`) cannot be migrated to tile units without knowing which entities use which precision level.
- It is not clear which entity types need continuous sub-tile positions and which can use integer tile positions.

## Decision drivers

- Column naming must be uniform and match the coordinate vocabulary from ADR-0001.
- `mapId` must be added to every entity that carries a world position.
- Static entities (no runtime movement) should use tile-exact integer positions for schema clarity.
- Dynamic entities (server-driven or player-driven movement) require sub-tile precision.
- WebSocket payloads must carry `mapId`, `worldX`, `worldY` for all position updates.
- The server remains authoritative: positions received from the client are intentions, not facts.
- The actual DB column type for `worldX`/`worldY` is deferred to the storage type decision from ADR-0001.

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
| `worldX` | TBD (see ADR-0001 open storage question) | X position in logical world space |
| `worldY` | TBD (see ADR-0001 open storage question) | Y position in logical world space |

The column type for `worldX` and `worldY` is not decided in this ADR. It will be determined when the ADR-0001 storage type question is resolved.

### Entity classification

| Entity | Movement class | `worldX/Y` value | Notes |
|---|---|---|---|
| `character` | Dynamic | Continuous (sub-tile fractional) | Controlled by player input; server validates |
| `animal` | Dynamic | Continuous (sub-tile fractional) | Driven by server AI; always authoritative |
| `resource` | Static | Integer (whole tile) | Placed at map authoring time; never moves |
| `creature_spawn` | Static | Integer (whole tile) | Spawn point; never moves at runtime |
| `respawn_point` | Static | Integer (whole tile) | Respawn anchor; never moves at runtime |

Static entities store whole-tile values (`worldX = 12.0`, `worldY = 7.0`). No fractional part is ever set for them at authoring time. This allows uniform column names while preserving the semantic distinction.

### WebSocket payload contract

All socket events that carry a world position must include `mapId`, `worldX`, and `worldY`. Events that currently use `x` and `y` must be updated.

| Event | Direction | Current payload | Target payload |
|---|---|---|---|
| `player_move` | Client → Server | `{ x, y, direction }` | `{ mapId, worldX, worldY, direction }` |
| `player_moved` | Server → Client | `{ x, y, direction, ... }` | `{ mapId, worldX, worldY, direction, ... }` |
| `world_joined` | Server → Client | `{ x, y, ... }` | `{ mapId, worldX, worldY, ... }` |
| `character_teleport` | Server → Client | `{ x, y }` | `{ mapId, worldX, worldY }` |
| `character_respawn` | Server → Client | `{ x, y, ... }` | `{ mapId, worldX, worldY, ... }` |
| `animals` / `animal_update` | Server → Client | `{ x, y, ... }` | `{ mapId, worldX, worldY, ... }` |
| `resources` | Server → Client | `{ x, y, ... }` | `{ mapId, worldX, worldY, ... }` |

`mapId` is mandatory in every position-carrying payload. A client must not infer map context from connection state alone.

### Server authority

- All incoming position values (`worldX`, `worldY`) are client intentions. They must be validated server-side before producing gameplay effects.
- The server must reject or correct positions outside the bounds of the declared `mapId`.
- `mapId` must be validated: a character cannot report a position on a map it has not legitimately entered.
- Dynamic entity positions are authoritative only when set by the server (AI-driven animals, admin teleport, respawn). Client-reported positions are inputs to server validation.

## Rationale

Option C (uniform naming, value distinguishes static/dynamic) avoids introducing two parallel column sets while keeping schema and query patterns consistent across all entity types. Static entities naturally store integer tile values; the column names remain identical to dynamic entities, which simplifies generic position queries and future chunk-based interest management.

Defining the WebSocket payload contract in this ADR ensures that the coordinate rename (`x/y` → `worldX/worldY`) happens consistently across all events rather than being patched event by event.

Keeping the actual column type deferred maintains consistency with ADR-0001. The type decision must precede implementation of either this ADR or ADR-0001.

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

| Component | Impact |
|---|---|
| `character` entity | Rename `positionX/Y` → `worldX/Y`; add `mapId` |
| `animal` entity | Rename `x/y` → `worldX/Y`; add `mapId` |
| `resource` entity | Rename `x/y` → `worldX/Y`; add `mapId` |
| `creature_spawn` entity | Rename `spawnX/Y` → `worldX/Y`; add `mapId` |
| `respawn_point` entity | Rename `x/y` → `worldX/Y`; add `mapId` |
| `WorldService` | Update all position reads/writes; add `mapId` validation |
| `AnimalsService` | Update AI movement; rename `x/y` fields; add `mapId` context |
| `ResourcesGateway` | Update range check to use `worldX/Y`; validate `mapId` |
| `WorldGateway` | Update `player_move` and join handlers; broadcast `mapId` |
| WebSocket payloads | All position events: `x/y` → `worldX/Y`, add `mapId` |
| Phaser client | All sprite positioning: use projection formula from ADR-0001 |
| Admin tool | `/tp` and coordinate display: tile units, `mapId` required |
| Seeds | Hardcoded positions must be expressed in tile units with `mapId` |

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

1. Resolve the ADR-0001 storage type question first.
2. Migrate entities one type at a time, starting with static entities (resources, spawns, respawn points) where no in-memory state is affected.
3. Migrate dynamic entities (characters, animals) with a cutover that updates both entity columns and WebSocket payloads simultaneously.
4. Seed data must be updated to use tile coordinates before or at migration time.

No mixed-state operation: during migration of a given entity type, all code paths that read or write its position must be updated atomically.

## Validation

- [x] Existing entity schemas analyzed (character, animal, resource, creature_spawn, respawn_point).
- [x] Existing socket events analyzed (player_move, player_moved, world_joined, character_teleport, character_respawn, animals, animal_update, resources).
- [x] ADR-0001 reviewed.
- [x] Security impact reviewed.
- [x] Performance impact reviewed.
- [ ] Human approval recorded.
- [ ] Related documentation updated (deferred until this ADR is accepted).

## Open questions

- **`mapId` type and FK target**: should `mapId` be an integer FK to a future `map` entity, or a string identifier? The `map` entity does not yet exist.
- **Migration order**: in what order should the five entity types be migrated? What handles the transition period where some code uses old columns and some uses new?
- **Seed data**: how should existing hardcoded seed positions (e.g., respawn point at x=600, y=300) be converted to tile units? This depends on the ADR-0001 conversion factor.
- **`mapId` default value during migration**: what `mapId` value is assigned to all existing entities that have no map concept yet?
- **Payload backward compatibility**: should a transition period with dual-format payloads be supported, or is a hard cutover required?
- **Column type**: deferred to ADR-0001 storage type resolution.

## Non-goals

- This ADR does not define the `map` entity or table.
- This ADR does not define chunk loading or unloading logic.
- This ADR does not define the DB migration scripts.
- This ADR does not define how `mapId` is assigned at player login or world join.
- This ADR does not define zone transition mechanics.
- This ADR does not resolve the ADR-0001 storage type question.
- This ADR does not define the conversion factor between current pixel values and tile units.

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

- [ ] Obtain human approval and record it in `Approved by` and `Approval reference`.
- [ ] Set `Decision status` to `Accepted` after human validation.
- [ ] Set `Date accepted` after human validation.
- [ ] Resolve ADR-0001 storage type question before implementation.
- [ ] Define `mapId` type and FK target (requires a `map` entity ADR or decision).
- [ ] Define migration order and transition strategy.
- [ ] Update `docs/04_Server/websockets.md` to document the new payload format.
- [ ] Update `docs/06_Database/schema.md` after the migration is implemented.
- [ ] Update seed files when tile coordinate values are defined.
