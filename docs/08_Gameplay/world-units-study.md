# World Units Study

## Metadata

- Status: Superseded — ADR-0001 Accepted (2026-06-22)
- Owner: Project
- Last updated: 2026-06-22

> **Décision prise (ADR-0001 — Accepted 2026-06-22)** : le système de coordonnées
> officiel est le World Unit (WU), où `1 tile = 1024 WU`. Les colonnes DB et la
> mémoire serveur utilisent `worldX / worldY` (int, WU). Ce document utilise
> `worldTileX / worldTileY` avec la sémantique "1 unité = 1 tile" — c'est l'option
> qui fut analysée mais *non* retenue. Les formules ici s'appliquent en espace tile ;
> pour convertir en WU, multiplier par `TILE_SIZE_WU = 1024`. Voir
> `docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md` et
> `apps/api-gateway/src/common/world-coordinates.ts`.
- Depends on:
  - docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md
  - docs/08_Gameplay/movement-authority-audit.md
  - apps/client/src/phaser/player/Player.js
  - apps/client/src/phaser/player/PlayerController.js
  - apps/client/src/phaser/core/WorldScene.js
  - apps/api-gateway/src/creatures/creatures.service.ts
  - apps/api-gateway/src/resources/resources.gateway.ts
- Used by: Project owner, developers, conversational assistants,
  repository-aware coding agents

---

## Scope and purpose

This document is an **analysis only**. It does not make architectural decisions.

Its purpose is to identify and describe the distinct unit domains used across
the project, characterize their current state, and provide the technical
elements needed to decide later whether these domains should share a common
unit or remain distinct.

Three questions are left open at the end:
- Should the simulation unit and the storage unit be identical?
- Should the simulation unit and the rendering unit be identical?
- What distance metric is appropriate after migration?

None of these questions is answered here.

---

## The four unit domains

This project involves four distinct domains, each with its own natural unit
of measurement. The current codebase conflates some of these domains. This
study distinguishes them explicitly.

### Domain 1 — Server simulation

The unit used by the server to compute movement, distances, speed integration,
range checks, and pathfinding.

Used in: `world.service.ts`, `creatures.service.ts`, `resources.gateway.ts`.

Characteristics:
- Must support continuous (fractional) values to integrate movement correctly.
- Must support Euclidean or equivalent distance computation.
- Must be consistent with the speed constants that drive integration.
- Is never shown to the user directly.

### Domain 2 — Database storage

The unit used to persist entity positions between sessions.

Used in: `character.entity.ts`, `resource.entity.ts`, `creature.entity.ts`,
`creature-spawn.entity.ts`, `respawn-point.entity.ts`.

Characteristics:
- Must survive server restart and reconnection without loss of precision.
- Does not need to support arithmetic. It is read on load and written on persist.
- Should be semantically stable: a stored value should remain valid after
  a server update or map change.
- Can differ from the simulation unit if a conversion is applied at the
  read/write boundary.

### Domain 3 — Client rendering

The unit used by the Phaser engine to position sprites, drive Arcade Physics
velocity, and sample pointer input.

Used in: `Player.js`, `PlayerController.js`, `WorldScene.js`.

Characteristics:
- Phaser Arcade Physics expects `setVelocity(vx, vy)` in Phaser world units
  per second. At zoom 1, Phaser world units equal screen pixels.
- `pointer.worldX / pointer.worldY` returns Phaser world units.
- `cameras.main.getWorldPoint()` also returns Phaser world units.
- The isometric tilemap is rendered at offset `TILEMAP_TEST_OFFSET_X = 936`
  in Phaser world units. This offset is temporary (marked in code).
- This unit is not transmitted to the server in the target architecture.
  It is converted to `worldTileX / worldTileY` before any WebSocket event.

### Domain 4 — Tiled editing

The unit used by the Tiled map editor when authoring terrain and (potentially)
entity placement.

Used in: `public/assets/maps/terrain_pipeline_test.tmj`, tilesets.

Characteristics:
- Tile layers use integer tile indices: column (tx), row (ty).
  These correspond directly to `floor(worldTileX)`, `floor(worldTileY)` in
  ADR-0001 coordinates.
- Object layers in Tiled use pixel coordinates in Tiled's internal coordinate
  space. For isometric staggered maps, this coordinate space is not the same
  as Phaser world pixels. Tiled object pixel coordinates require a Tiled-to-
  Phaser conversion that depends on the map's tile size and stagger settings.
- Currently, Tiled is used **only for terrain tile layers**, not for entity
  placement. Entity positions (spawns, resources, respawn points) are seeded
  in code or placed via the admin panel.
- If entity placement is ever authored in Tiled object layers, the coordinate
  conversion from Tiled objects to the simulation domain must be defined
  explicitly.

---

## Current state of each domain

### What each domain uses today

| Domain | Unit today | Examples |
|---|---|---|
| Server simulation | Phaser world px (px-equiv) | `player.x = payload.x`, `MELEE_RANGE = 60`, `speedMax = 60` |
| Database storage | Integer Phaser world px | `positionX: Math.round(player.x)`, `spawnX: 600`, `resource.x` |
| Client rendering | Phaser world px (identical to server) | `Player.speed = 100`, `player.setVelocity(nx * 100, ...)` |
| Tiled terrain | Integer tile indices (tx, ty) | `terrain_pipeline_test.tmj` 64×64 grid |

**Current observation**: the server simulation domain and the client rendering
domain currently use the **same unit** (Phaser world pixels). This is why
`payload.x / payload.y` can be written directly to `player.x / player.y`
without conversion. The client and server speak the same coordinate language
today.

The database stores the rounded value of this same Phaser world pixel
coordinate, making all three non-Tiled domains effectively identical.

The Tiled domain is currently isolated: it is only used to render terrain, and
no conversion to/from Phaser world px is performed for tile data.

### The pathfinding grid — a fifth implicit domain

The client pathfinder (`PlayerController.js:90-94`) operates on a grid derived
from Phaser world pixels divided by 32:

```js
const tileSize = 32;
const startX = Math.floor(this.player.x / tileSize);
const endX   = Math.floor(targetX       / tileSize);
```

This produces a grid with cells of 32 px each. The Phaser world bounds are
2000 × 2000 px, giving a grid of approximately 62 × 62 cells.

This 32 px grid is **not** the visual tile grid (128 × 64 px isometric
diamonds). It is not referenced by Tiled. It is not known to the server.
It is a purely client-internal collision approximation.

This implicit fifth domain does not need its own unit definition. It is a
derived domain: once the rendering unit and tile unit are defined, the
pathfinding grid cell size will be expressed as a fixed fraction of the
logical tile size.

---

## The isometric projection — no single conversion factor

### The projection formula (from ADR-0001)

The isometric projection maps logical tile coordinates to Phaser world pixels:

```
pxX = (worldTileX - worldTileY) × 64 + offsetX
pxY = (worldTileX + worldTileY) × 32 + offsetY
```

With the tilemap of 128 × 64 px tiles:
- `tileHalfWidth  = 128 / 2 = 64`
- `tileHalfHeight =  64 / 2 = 32`

Currently: `offsetX = 936` (temporary), `offsetY = 0`.

### The conversion is not a scalar

A common assumption is that "1 tile = N pixels" for some constant N.
This is false for the isometric projection above.

Consider the pixel distance between two entities separated by `Δx` tiles in
`worldTileX` and `Δy` tiles in `worldTileY`:

```
ΔpxX = (Δx − Δy) × 64
ΔpxY = (Δx + Δy) × 32
```

Euclidean distance in pixel space:

```
d_px² = ΔpxX² + ΔpxY²
       = 64²(Δx − Δy)² + 32²(Δx + Δy)²
       = 4096(Δx² − 2ΔxΔy + Δy²) + 1024(Δx² + 2ΔxΔy + Δy²)
       = 5120(Δx² + Δy²) − 6144 ΔxΔy
```

Euclidean distance in tile space:

```
d_tile² = Δx² + Δy²
```

Therefore:

```
d_px² = 5120 × d_tile² − 6144 ΔxΔy
```

The ratio `d_px / d_tile` depends on the cross-term `ΔxΔy`, which varies
with direction. There is no single constant K such that `d_px = K × d_tile`.

### Measured values for the principal directions

| Direction | Δx | Δy | d_tile (tiles) | d_px (px) | px per tile |
|---|---|---|---|---|---|
| Pure worldTileX | 1 | 0 | 1 | √5120 ≈ 71.55 | 71.55 |
| Pure worldTileY | 0 | 1 | 1 | √5120 ≈ 71.55 | 71.55 |
| X+Y diagonal | 1 | 1 | √2 ≈ 1.41 | 64 | 45.25 |
| X−Y diagonal | 1 | −1 | √2 ≈ 1.41 | 128 | 90.51 |

The axis-aligned directions give the same px-per-tile value (71.55). The
diagonals differ: the X+Y diagonal compresses to 45.25 px/tile while the
X−Y diagonal stretches to 90.51 px/tile.

This is an inherent property of the isometric projection. It cannot be
eliminated by choosing a different tile size.

### What this means in practice

A "circle" of radius R in pixel space corresponds to a shape in tile space
that is **not a circle**. It is a transformed ellipse whose axes are aligned
with the isometric diagonals.

Conversely, a "circle" of radius T in tile space projects to a shape in pixel
space that is also not a circle.

Any range check (`MELEE_RANGE`, `RESOURCE_INTERACT_RANGE`) must specify which
space it operates in. Changing the space changes the gameplay result, even if
the numerical value is recalibrated.

---

## Consequence for distance semantics

### Current behavior

All range checks in the current codebase compute Euclidean distance in Phaser
world pixel space:

```ts
// combat range — creatures.service.ts:376
Math.hypot(creature.x - attackerPosition.x, creature.y - attackerPosition.y) <= MELEE_RANGE

// gathering range — resources.gateway.ts:248
Math.hypot(target.x - player.x, target.y - player.y) <= RESOURCE_INTERACT_RANGE
```

These produce a circular range in pixel space, which is an anisotropic (non-
circular) shape in tile space.

### Distance metric options after migration

After migrating coordinates to `worldTileX / worldTileY`, the range checks
must be redefined. Four options exist. This study does not choose between them.

**Option 1 — Euclidean in tile space**

```
d = √((Δx_tile)² + (Δy_tile)²)
```

Simpler to compute server-side than converting back to pixels. Produces a
circle in tile space, which is the anisotropic shape in pixel space described
above. The range constant must be re-expressed in tiles. Its value changes
relative to the pixel constant.

**Option 2 — Euclidean in pixel space (convert coordinates for the check only)**

Keep the range check in pixel space by converting tile coordinates to pixels
before computing the distance:

```
pxX = (worldTileX - worldTileY) × 64 + offsetX
pxY = (worldTileX + worldTileY) × 32 + offsetY
d = Math.hypot(ΔpxX, ΔpxY)
```

Preserves exact current gameplay behavior. Adds a projection step on every
range check. Requires the server to know the offset value for the current map.

**Option 3 — Chebyshev distance in tile space**

```
d = max(|Δx_tile|, |Δy_tile|)
```

Produces a square range in tile space (rotated 45° relative to screen). Very
fast to compute. Integer-friendly when tile positions are integers. Common in
tile-based games for adjacency checks. Gameplay feel differs from a circle.

**Option 4 — Manhattan distance in tile space**

```
d = |Δx_tile| + |Δy_tile|
```

Produces a diamond shape in tile space. Fast to compute. Also integer-friendly.
Intuitive for tile-grid interactions where "adjacent tiles" is the key concept.

### Summary: do range check semantics change?

| Metric | Shape in tile space | Shape in pixel space | Notes |
|---|---|---|---|
| Euclidean px (current) | Anisotropic ellipse | Circle | Preserves current feel |
| Euclidean tile | Circle | Anisotropic ellipse | Simpler server math |
| Chebyshev tile | Square | Parallelogram | Fast, integer |
| Manhattan tile | Diamond | Hexagon (approx) | Fast, integer |

---

## Analysis: when should domains share a unit?

### Simulation ≡ Storage

If the simulation unit and the storage unit are the same, the read and write
operations at the DB boundary require no conversion. The stored value can be
loaded directly into the runtime structure and used without transformation.

This simplicity has a cost: the simulation unit must be semantically stable
enough to be a long-lived storage format. Phaser world pixels fail this test:
they depend on the temporary `TILEMAP_TEST_OFFSET_X = 936` and on Phaser's
world size (currently `2000 × 2000`), both of which are expected to change.
ADR-0001's `worldTileX / worldTileY` is a better storage unit because it is
defined relative to the map, not to a Phaser scene.

A valid design is: simulation in tile units, storage in tile units, no
conversion at the boundary. This is the direction implied by ADR-0001 and
ADR-0002.

An alternative valid design is: simulation in pixels (high precision, native
to Phaser physics), storage in tile units (map-relative, stable). This adds a
conversion step at every load and persist operation, but keeps the simulation
unit aligned with Phaser's native domain. The conversion is a 2×2 linear
transformation, not a scalar multiply.

### Simulation ≡ Rendering

If the simulation unit and the rendering unit are the same, no conversion is
needed between them. The Phaser sprite can be positioned directly at the
simulated coordinate.

Currently this is the case: both use Phaser world pixels.

After migration to tile-based simulation, the client rendering unit remains
Phaser world pixels (Phaser's physics engine is not designed to work in tile
units). The client would need to project `worldTileX / worldTileY` to Phaser
world pixels before positioning sprites:

```
sprite.x = (worldTileX - worldTileY) × 64 + offsetX
sprite.y = (worldTileX + worldTileY) × 32 + offsetY
```

This conversion is applied once per frame per visible entity. It is fast. The
two domains being different does not create a problem here; it creates an
explicit projection boundary that is well-defined.

Making simulation ≡ rendering (i.e., keeping pixel simulation) preserves
current Phaser integration but reintroduces the instability of Phaser world
pixels as the canonical coordinate.

### Storage ≡ Tiled editing

Tiled tile indices map directly to `floor(worldTileX)`, `floor(worldTileY)`.
For collision data (walkability), the storage unit and Tiled's tile index unit
are naturally compatible: the server reads the collision grid in integer tile
indices, which is the integer part of the stored `worldTileX / worldTileY`.

For entity placement via Tiled object layers, Tiled's internal pixel
coordinates for isometric maps do not map trivially to `worldTileX /
worldTileY`. This requires a Tiled-specific conversion. Since entity placement
via Tiled is not used today, this remains a future concern.

### Rendering ≡ Tiled editing

No direct coupling is required. Phaser loads the TMJ file and applies its own
rendering pipeline. The Tiled tile indices become Phaser's internal tile map
structure. The offset between Tiled space and Phaser world space is handled by
Phaser's `createLayer` call with the `TILEMAP_TEST_OFFSET_X` parameter. The
rendering and editing units do not need to be unified.

---

## Options matrix

The following four configurations represent the most likely candidates for the
final architecture. This study does not choose between them.

### Configuration A — Tile units throughout (except rendering)

| Domain | Unit |
|---|---|
| Server simulation | `worldTileX / worldTileY` (float, tile units) |
| Database storage | `worldTileX / worldTileY` (float, tile units) |
| Client rendering | Phaser world px (converted from tile at render time) |
| Tiled editing | Integer tile indices (compatible with floor of storage) |

No conversion at simulation ↔ storage boundary. One projection at
storage → rendering. Range checks can use Euclidean tile distance or another
tile-space metric. This is the direction implied by ADR-0001 and ADR-0002.

Risks: simulation in float tile units requires ensuring that the speed
integration (`pos += speed × dt`) is numerically stable at the chosen
precision. Creature movement currently uses `Math.round()` at each tick,
which would truncate sub-tile motion at low speeds.

### Configuration B — Pixel simulation, tile storage

| Domain | Unit |
|---|---|
| Server simulation | Phaser world px (float) |
| Database storage | `worldTileX / worldTileY` (float, tile units) |
| Client rendering | Phaser world px (same as simulation) |
| Tiled editing | Integer tile indices |

Conversion at simulation ↔ storage boundary (load: tile → px, persist: px →
tile). No conversion at simulation ↔ rendering boundary. Range checks can
use pixel-space Euclidean distance (preserving current gameplay semantics) or
tile-space alternatives.

Risks: the pixel ↔ tile conversion requires the map offset and tile size at
every load/persist. If the map changes, stored tile values remain valid, but
the runtime px values must be recomputed from the new map's offset. This is
the desired behavior for a per-map coordinate system.

### Configuration C — Integer sub-tile simulation and storage

| Domain | Unit |
|---|---|
| Server simulation | Integer sub-tile units (e.g., 1/16 tile = 1 unit) |
| Database storage | Integer sub-tile units (same) |
| Client rendering | Phaser world px (converted from sub-tile at render time) |
| Tiled editing | Integer tile indices |

Uses fixed-point integer arithmetic for all server-side computation. No
floating-point precision issues. The sub-tile unit must be chosen to provide
sufficient precision for speed integration at the server tick rate (200 ms for
creatures, target tick rate for players TBD).

Example: at 1/16 tile = 1 unit, `speedMax = 60 px/s` in the current system
needs to be re-expressed as approximately `speedMax = 0.84 tiles/s` (from the
71.55 px/tile conversion along the principal axes), then converted to
`speedMax ≈ 13.4 sub-tile units/s` at 1/16 resolution. This is sufficient for
the 200 ms tick (movement per tick ≈ 2.7 units at 13.4/s).

Risks: highest implementation complexity. Requires a fixed sub-tile size
decision before any code is written. Range checks in sub-tile units must
account for the same anisotropic distance problem as tile-unit checks.

### Configuration D — Keep all domains in pixel space

| Domain | Unit |
|---|---|
| Server simulation | Phaser world px |
| Database storage | Phaser world px (integer, current) |
| Client rendering | Phaser world px |
| Tiled editing | Integer tile indices |

No conversion at any boundary within the three non-Tiled domains. The current
architecture, with ADR-0001 deferred or applied only at the conceptual level.

Risks: stored positions remain tied to the Phaser world bounds (2000 × 2000)
and the temporary `TILEMAP_TEST_OFFSET_X`. When the map grows or the offset
changes, stored pixel values become incorrect. This is the current state and
is explicitly identified as debt in STATUS.md and the movement authority audit.
This configuration does not resolve that debt.

---

## Current numerical values (reference)

These values are extracted from the current source. They are in Phaser world
pixel units. They are provided for reference only: any migration requires
re-expressing them in the chosen simulation unit.

### Player

| Constant | Value | Location |
|---|---|---|
| `speed` | 100 px/s | `Player.js:27` |
| Default spawn X | 400 px | `WorldScene.js:165` (fallback if no positionX) |
| Default spawn Y | 300 px | `WorldScene.js:166` (fallback if no positionY) |
| Phaser world bounds | 2000 × 2000 px | `WorldScene.js:160` |
| Sync interval | 80 ms | `WorldScene.js:syncLocalPlayer` |

### Creatures (turkey template seed)

| Constant | Value | Location |
|---|---|---|
| `patrolRadius` | 200 px | `creatures.service.ts:443` |
| `speedMin` | 25 px/s | `creatures.service.ts:444` |
| `speedMax` | 60 px/s | `creatures.service.ts:445` |
| `aggroRadius` | 50 px | `creatures.service.ts:448` |
| Seed spawn X | 600 px | `creatures.service.ts:638` |
| Seed spawn Y | 580 px | `creatures.service.ts:639` |

### Creatures (goblin template seed)

| Constant | Value | Location |
|---|---|---|
| `patrolRadius` | 150 px | `creatures.service.ts:458` |
| `speedMin` | 40 px/s | `creatures.service.ts:459` |
| `speedMax` | 80 px/s | `creatures.service.ts:460` |
| `aggroRadius` | 120 px | `creatures.service.ts:463` |

### Ranges

| Constant | Value | Location |
|---|---|---|
| `MELEE_RANGE` | 60 px | `creatures.service.ts:13` |
| `RESOURCE_INTERACT_RANGE` | 100 px | `resources.gateway.ts:25` |
| `MOVE_TOLERANCE` | 4 px | `resources.gateway.ts:31` |
| Respawn point X (hardcoded) | 600 px | `world.service.ts:hardcoded` |
| Respawn point Y (hardcoded) | 300 px | implied |

### Tilemap

| Property | Value | Location |
|---|---|---|
| Tile visual width | 128 px | `terrain_pipeline_test.tmj` |
| Tile visual height | 64 px | `terrain_pipeline_test.tmj` |
| Map width | 64 tiles | `terrain_pipeline_test.tmj` |
| Map height | 64 tiles | `terrain_pipeline_test.tmj` |
| `tileHalfWidth` | 64 px | derived |
| `tileHalfHeight` | 32 px | derived |
| `TILEMAP_TEST_OFFSET_X` | 936 px | `WorldScene.js:137` (temporary) |
| `TILEMAP_TEST_OFFSET_Y` | 0 px | `WorldScene.js:138` (temporary) |
| Pathfinding cell size | 32 px | `PlayerController.js:90` |
| Creature tick rate | 200 ms | `CreaturesService` tick interval |

### Derived conversion values

These are computed from the projection formula. They are not constants in the
code; they are mathematical consequences of the tilemap geometry.

| Direction | Euclidean px per tile |
|---|---|
| Along worldTileX axis | √5120 ≈ 71.55 px |
| Along worldTileY axis | √5120 ≈ 71.55 px |
| Along X+Y diagonal | 64 px per tile-unit of diagonal distance |
| Along X−Y diagonal | 128 px per tile-unit of diagonal distance |

Because the ratio varies by direction, no single scalar converts all pixel
values to tile values or vice versa.

---

## Open questions (not answered by this study)

1. **Which simulation unit?** Tile float (Config A), pixel float (Config B),
   integer sub-tile (Config C), or pixel integer (Config D)? This is the
   primary open question. All other unit decisions follow from it.

2. **Which distance metric?** After migration, should range checks use
   Euclidean tile distance, Euclidean pixel distance, Chebyshev, or Manhattan?
   The choice changes gameplay feel and must be validated in context.

3. **What is the canonical px-per-tile conversion for speed?**  
   The axis-aligned conversion (71.55 px/tile) is the most natural for
   converting scalar speeds such as `Player.speed = 100 px/s`. But the
   direction-dependence means this conversion is exact only for movement along
   the principal axes. Is this acceptable for speed calibration?

4. **Sub-tile precision.** If the simulation uses float tile units, how much
   fractional precision is needed? If the simulation uses integer sub-tiles,
   what sub-tile factor (1/8, 1/16, 1/32…) is sufficient for the lowest
   speed at the current tick rate?

5. **Map offset stability.** `TILEMAP_TEST_OFFSET_X = 936` is temporary. The
   final per-map offset must be defined before any px → tile conversion can be
   applied consistently. The offset is a prerequisite for Config B (pixel
   simulation, tile storage) and for Option 2 distance checks.

6. **Tiled object layers.** If entity spawn points are ever authored in Tiled,
   what conversion from Tiled isometric object coordinates to `worldTileX /
   worldTileY` is needed? This conversion is not trivial for staggered
   isometric maps and depends on Tiled's internal coordinate model.

7. **Creature `Math.round()` at each tick.** In Config A (float tile simulation),
   removing `Math.round()` from the creature tick loop would accumulate sub-tile
   position drift across ticks. Is this acceptable, or should the simulation
   use fixed-point to avoid it?

8. **Server pathfinding.** If pathfinding is moved to the server (ADR-0003
   open question 10), which unit does the server-side pathfinder use? The
   pathfinder naturally operates on integer tile indices, but the entity's
   position between waypoints is continuous. The waypoint unit and the
   simulation unit must be explicitly defined.

---

## Non-goals

This document does not:

- Choose between the four configurations.
- Define the exact values of speed, range, or radius constants after migration.
- Decide whether ADR-0001 should be updated to include unit domain definitions.
- Decide whether a separate architecture document on world units is needed.
- Modify any code, entity, or database schema.
- Accept or supersede any existing ADR.

---

## Related files

- [ADR-0001 — World Coordinate System](../01_Architecture/adr/ADR-0001-world-coordinate-system.md)
- [ADR-0002 — Entity Positioning](../01_Architecture/adr/ADR-0002-entity-positioning.md)
- [ADR-0003 — Movement Authority](../01_Architecture/adr/ADR-0003-movement-authority.md)
- [Movement Authority Audit](movement-authority-audit.md)
- [Movement Model](movement-model.md)
- [Movement Study](movement-study.md)
- [Tiled Documentation](../05_World/tiled.md)
- [Phaser World](../03_Client/phaser-world.md)
