# Movement Authority Audit

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-21
- Purpose: Audit of the current movement authority before writing ADR-0003
- Does not modify: code, ADRs, movement-model.md, ROADMAP.md
- Depends on: movement-study.md, movement-model.md, ADR-0001, ADR-0002
- Files audited:
  - `apps/client/src/phaser/player/Player.js`
  - `apps/client/src/phaser/player/PlayerController.js`
  - `apps/client/src/phaser/core/WorldScene.js`
  - `apps/client/src/phaser/utils/pathfinding.js`
  - `apps/client/src/phaser/world/MapLoader.js`
  - `apps/api-gateway/src/world/world.gateway.ts`
  - `apps/api-gateway/src/world/world.service.ts`
  - `apps/api-gateway/src/animals/animals.gateway.ts`
  - `apps/api-gateway/src/animals/animals.service.ts`
  - `apps/api-gateway/src/resources/resources.gateway.ts`

---

## 1. Player movement — who owns what

### Who calculates movement?

The client. Phaser Arcade Physics integrates velocity every frame. `Player.js`
sets `this.speed = 100` (pixel-equivalent per second). `PlayerController.js`
calls `this.player.setVelocity(vx, vy)` on every `update()`. The server never
computes the player's velocity or displacement.

### Who calculates speed?

The client. `Player.speed` is a constant hardcoded to `100`. There is no
server-issued speed value. The server never sends a speed to the client. The
client decides unilaterally how fast the player moves.

### Who decides the destination?

The client. In pathfinding mode, the client runs A\* locally and determines
the route. In direct steering mode, the client steers toward the pointer
position it computed locally. No destination is submitted to the server for
approval before movement begins.

### Who stops movement?

The client. `PlayerController.update()` sets velocity to `0` when no input is
active. The server never sends a stop command except through `character_teleport`
and `character_respawn`, which reposition the sprite.

### Who validates collisions?

The client, via Phaser Arcade Physics. `Player.js` calls
`this.setCollideWorldBounds(true)` and the physics body is `20 × 16 px`.
`WorldScene` sets `this.physics.world.setBounds(0, 0, 2000, 2000)`. The server
applies no collision check on player positions.

### Who decides the final position?

The client. The server receives the position reported by the client, stores it
in memory without any validation, and rebroadcasts it to other clients. The
server's in-memory position for a connected player is exactly what the client
last reported.

### What data is sent to the server?

Every 80 ms at most, if position or direction changed:

```
player_move: { x: Math.round(player.x), y: Math.round(player.y), direction }
```

`x` and `y` are Phaser world pixel coordinates. No `mapId`. No tile
coordinates. No sequence number. No timestamp.

On `join_world`:

```
join_world: { characterId, name, sex, x: player.x, y: player.y, direction }
```

The client sends its current Phaser position at join time. The server reads the
character's persisted `positionX / positionY` from the DB and overrides the
join payload's `x / y` (see `joinPlayer`), so the join position is not directly
exploitable — but it shows the client sends pixel coordinates unconditionally.

---

## 2. Pathfinding — where and by whom

### Where is it executed?

Entirely on the client. `apps/client/src/phaser/utils/pathfinding.js`
implements A\* as a browser-side class. The server has no pathfinding code.

### Who calculates the route?

The client. `PlayerController.calculatePath(targetX, targetY)` converts the
player's current Phaser pixel position to a 32 px tile index:

```js
const tileSize = 32;
const startX = Math.floor(this.player.x / tileSize);
const startY = Math.floor(this.player.y / tileSize);
const endX   = Math.floor(targetX / tileSize);
const endY   = Math.floor(targetY / tileSize);
```

This grid is independent of the logical tile system defined in ADR-0001
(128 × 64 isometric tiles). The 32 px tile is a client-only rendering
convenience, not a logical coordinate.

The collision grid used by the pathfinder is `scene.collisionGrid` which is
built from `MapLoader.js` using `collisions.json` (a list of blocking tile
indices for the legacy tilemap). This grid is never available to the server.

### Who decides the final path?

The client selects the route. If A\* returns a path, the client follows it.
If A\* returns `null` (no path found), the client falls back to direct
steering toward the target. The server has no influence over which route is
followed.

### Does the server recompute anything?

No. The server receives only the positions resulting from following the path
(`player_move` events). It does not know a path exists, does not validate it,
and does not adjust it.

---

## 3. Direct steering — three input variants

### Keyboard

Active when any arrow key is down. `PlayerController.update()` sets:

```js
if (this.cursors.left.isDown)  vx = -speed;
if (this.cursors.right.isDown) vx =  speed;
if (this.cursors.up.isDown)    vy = -speed;
if (this.cursors.down.isDown)  vy =  speed;
this.player.setVelocity(vx, vy);
```

The velocity is in screen-space axes (Phaser `x / y`). In the current
cartesian rendering, left/right/up/down map directly to pixel directions.
After the isometric migration (ADR-0001), this will produce wrong directions:
pressing "right" will move the sprite horizontally on screen rather than
north-east in world-tile space. **This is a latent bug.**

Keyboard input clears all mouse state and overrides both pathfinding and
direct-pointer steering.

### Pointer hold (drag)

After 150 ms of continuous pointer hold, `isDragging` becomes `true`.
`directMoveToTarget(speed)` runs every frame:

```js
directMoveToTarget(speed) {
  const dx = this.target.x - this.player.x;
  const dy = this.target.y - this.player.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= this.arrivalThreshold) { this.player.setVelocity(0); return; }
  this.player.setVelocity((dx / dist) * speed, (dy / dist) * speed);
}
```

`this.target` is the Phaser world coordinates of the pointer. Updated live as
the pointer moves via `updateMouseTarget`. No path is involved. No tile
collision is applied. The entity moves in a straight line toward the cursor,
crossing walls if the cursor is on the other side.

### Single click (click < 150 ms)

On `pointerup`, if `clickDuration < 150` and `isDragging === false`, the
controller calls `calculatePath(targetX, targetY)`. If a path is found, it is
followed waypoint by waypoint via `followPath(speed)`. If no path is found,
direct steering toward the destination is used as fallback.

There is no check that the click destination is within map bounds before
sending it to the pathfinder. The pathfinder silently returns `null` for
out-of-bounds destinations (no grid row/column at those indices), which
triggers the direct-steering fallback.

---

## 4. Server — validations present and absent

### Validations present

**JWT authentication** (all gateways): `WsAuthService.authenticate` is called
in `handleConnection` for `WorldGateway`, `AnimalsGateway`, and
`ResourcesGateway`. A socket without a valid JWT is disconnected immediately.
This is the only security layer that exists before movement events are
processed.

**Character ownership** (`join_world`): `WorldService.joinPlayer` checks
`character.userId !== client.data.userId`. A player cannot join the world as
another user's character.

**Resource interaction range** (`interact_resource`): `ResourcesGateway`
checks `this.isInRange(player, resource)` with `RESOURCE_INTERACT_RANGE = 100`
(pixel-equivalent units). This check uses the position stored in
`client.data.player`, which is itself client-reported (see below). The
distance is validated, but against an untrusted position.

**Attack cooldown** (`attack_animal`): `AnimalsService.attack` enforces a
`ATTACK_COOLDOWN_MS = 700` ms minimum between attacks per character. This is
a real server-side enforcement that cannot be bypassed from the client.

**Attack range** (`attack_animal`): `AnimalsService.resolveAttackRange`
computes the effective range based on equipped weapon. The distance between
`attackerPosition` and the animal is checked. However, `attackerPosition` is
`{ x: player.x, y: player.y }` from `client.data.player`, which is
client-reported (see below).

**Animal health and death**: animal HP and state transitions are fully
server-authoritative. The server computes damage, applies it, and decides
when an animal dies. The client cannot set animal health.

**Gather movement check** (`runGatherCycle`): if the player moved more than
`MOVE_TOLERANCE = 4 px` between the start and end of a gather cycle (based on
`client.data.player` position), the gather session is cancelled. This is
validated server-side.

### What `client.data.player` actually is

`client.data.player` is the in-memory position the server believes the player
occupies. It is **set entirely from client-reported values**:

- On `join_world`: set to DB-persisted position (safe — from server storage).
- On every `player_move`: `WorldService.updatePlayer` executes:

```ts
player.x = payload.x;
player.y = payload.y;
player.direction = payload.direction ?? player.direction;
client.data.player = { ..., x: player.x, y: player.y, ... };
```

No validation. The server stores whatever `x / y` the client sent.
`client.data.player` is therefore client-controlled after the first
`player_move` event.

### Validations absent

- **No distance gate**: no check that the reported position is reachable from
  the last known position given any realistic speed and elapsed time.
- **No speed validation**: the server does not know the player's speed. It
  cannot verify that the displacement since the last `player_move` is
  consistent with any speed limit.
- **No walkability check**: the server does not consult the collision grid for
  player positions. No tile is tested for walkability. A position inside a wall
  is accepted identically to a valid open-space position.
- **No map bounds check**: the server does not know the map dimensions. A
  position of `{ x: 999999, y: -5000 }` is accepted without rejection.
- **No `mapId` field**: `player_move` does not carry a map identifier.
  Multi-map support does not exist yet, but its absence means map-level
  validation cannot be added without a protocol change.
- **No coordinate unit validation**: the server accepts any numeric `x / y`.
  There is no distinction between pixel values, tile values, or invalid values.

---

## 5. Animals — comparison with player movement

### Who decides animal movement?

The server, entirely. `AnimalsService.tickPatrol` runs every `PATROL_TICK_MS =
200 ms` via `setInterval`. The server computes direction, applies speed, and
updates `animal.x / animal.y` in the `liveAnimals` map. No client input is
accepted for animal movement. Animals are broadcast to clients via
`server.emit('animal_update', toDto(animal))`.

### Where are speeds applied?

On the server. Speed is integrated per tick:

```ts
const dt = PATROL_TICK_MS / 1000; // 0.2 s
animal.x = Math.round(animal.x + dirX * template.speedMax * dt);
animal.y = Math.round(animal.y + dirY * template.speedMax * dt);
```

Speed values (`speedMin`, `speedMax`) are stored in `CreatureTemplate` and
applied by the server exclusively. The client cannot influence animal speed.

### Where are collisions applied?

Nowhere. Animals have no tile collision. They move through all obstacles. The
only spatial constraint is `patrolRadius` (animals are clamped to a circle
around their spawn point) and `LEASH_MULTIPLIER × patrolRadius` for combat.
There is no walkability lookup for animals.

Animals also have no map bounds check. An animal with a spawn point near the
edge of any defined area can move outside any expected boundary.

### Contrast with player movement

| Property | Player | Animal |
|---|---|---|
| Who computes position | Client | Server |
| Position authority | Client (reported to server) | Server (computed and stored) |
| Speed applied by | Client (Phaser Arcade Physics) | Server (tick integration) |
| Collision | Client (Phaser, unverified by server) | None |
| Map bounds | Client (Phaser world bounds 2000×2000) | None |
| Broadcast source | Client → server → other clients | Server → all clients |

The animal model is closer to the target architecture defined in
`movement-model.md`. The player model is not.

---

## 6. WebSocket events — movement-related

### `join_world` (Client → Server)

| Field | Content | Validation | Trust level |
|---|---|---|---|
| `characterId` | Character UUID | Existence + ownership checked | Validated |
| `name` | Display name | Not validated, overridden by DB value | Ignored |
| `x`, `y` | Phaser pixel position | Not validated, overridden by DB position | Ignored (server uses DB) |
| `direction` | String | Not validated | Accepted as-is |

**Note**: the server overrides `x / y` with `character.positionX / positionY`
from the DB. The client-sent coordinates are not used for the server's in-memory
position. This is correct behavior.

### `world_joined` (Server → Client)

| Field | Content |
|---|---|
| `x`, `y` | DB-persisted position (pixel-equivalent) |
| `direction` | Last persisted direction |
| `characterId`, `name`, `sex` | From DB |

Trustworthy: sourced from the database.

### `player_move` (Client → Server)

| Field | Content | Validation | Trust level |
|---|---|---|---|
| `x` | Phaser pixel coordinate | Type check only (`typeof x !== 'number'`) | Fully trusted, no gameplay validation |
| `y` | Phaser pixel coordinate | Type check only | Fully trusted, no gameplay validation |
| `direction` | String (optional) | None | Accepted as-is |

**This is the critical gap.** Every `player_move` event updates the server's
canonical record of the player's position unconditionally.

### `player_moved` (Server → Client, broadcast)

| Field | Content |
|---|---|
| `x`, `y` | The client-reported coordinates, re-broadcast verbatim |
| `direction` | The client-reported direction |
| `characterId`, `name`, `sex`, `socketId` | Identifying fields |

Because the server re-broadcasts the client's own reported coordinates, a
client that reports a false position causes all other clients to render it at
the false position.

### `animal_update` (Server → Client, broadcast)

| Field | Content | Trust level |
|---|---|---|
| `x`, `y` | Server-computed coordinates | Authoritative |
| `health`, `state` | Server-computed values | Authoritative |
| All fields | Derived from server-owned `liveAnimals` map | Authoritative |

Fully trustworthy: the server computes and owns all animal state.

### `attack_animal` (Client → Server)

| Field | Content | Validation |
|---|---|---|
| `targetId` | Animal ID string | Existence check in `liveAnimals` |
| (position) | Not in payload — uses `client.data.player` | Client-reported position, no distance gate to server source |

**Note**: the attacker's position is not sent explicitly in the payload.
The server reads `client.data.player.x / y`, which is the last value set by
`player_move`. This is client-controlled.

### `character_teleport` (Server → Client, targeted)

| Field | Content | Trust level |
|---|---|---|
| `x`, `y` | Server-computed teleport destination | Authoritative |

Issued by `WorldService.teleportCharacter`. The server sets both the in-memory
position and the DB entry before broadcasting. Trustworthy.

### `character_respawn` (Server → Client, targeted)

| Field | Content | Trust level |
|---|---|---|
| `x`, `y` | Server-computed respawn position | Authoritative |
| `health`, `maxHealth` | Server-set values | Authoritative |

Issued by `WorldService.respawnCharacter`. Fully server-authoritative.

---

## 7. Security — exploitable attack surfaces

### 1. Unlimited teleportation

**Mechanism**: emit `player_move: { x: <any>, y: <any> }`.

**Server response**: `WorldService.updatePlayer` sets `player.x = payload.x`
unconditionally. The position is stored in memory and rebroadcast.

**Impact**: the player can report any position instantly, including positions
inside walls, outside the map, or across any distance. This affects:
- Visual rendering for all other clients (they are told the player is elsewhere).
- Combat range validation (`client.data.player` is used as the attacker position
  in `attack_animal`).
- Resource gather range validation (same source).
- Persisted position on disconnect.

**Severity**: critical.

### 2. Speed hacking

**Mechanism**: the client controls `Player.speed` locally. There is no server
check on the distance traveled between two consecutive `player_move` events.

**Impact**: a modified client can set `Player.speed` to any value and move
arbitrarily fast. The server has no way to detect this.

**Severity**: critical.

### 3. Combat range bypass

**Mechanism**: emit `player_move: { x: <animal.x>, y: <animal.y> }` to
place the player at the animal's position, then emit `attack_animal`.

**Impact**: the attack range check in `animalsService.attack` will compute
`distance = Math.hypot(animal.x - player.x, animal.y - player.y) = 0`, which
is always `≤ MELEE_RANGE = 60`. Melee attacks succeed from any real distance.
For ranged attacks, the same technique places the player within any effective
range.

**Severity**: critical.

### 4. Map bounds bypass

**Mechanism**: emit `player_move: { x: -99999, y: 99999 }`.

**Server response**: accepted unconditionally. No bounds check exists on the
server. The position is stored and rebroadcast.

**Impact**: players can exist at arbitrary coordinates, breaking zone-based
logic, interest management, and any future map transition system.

**Severity**: high.

### 5. Gather range bypass (partial)

**Mechanism**: same as combat range bypass — report a false position near a
resource before emitting `interact_resource`.

**Impact**: `ResourcesGateway.isInRange` checks `client.data.player`, which
is client-controlled. A player can gather any resource from any location.

**Partial mitigation**: the movement check during the gather cycle
(`MOVE_TOLERANCE = 4 px`) detects if the player moves after starting the
session. However, a player who has already falsified their position before
starting the gather is not detected.

**Severity**: high.

### 6. Wall traversal (player)

**Mechanism**: the client can emit positions inside collision tiles. The server
applies no walkability check.

**Impact**: players can claim positions inside walls, under structures, or at
any tile regardless of its collision layer. Other clients render the player at
those positions.

**Severity**: medium (less critical than teleportation, which subsumes it).

### 7. Persistence of false positions

**Mechanism**: on disconnect, `handleDisconnect` calls
`WorldService.persistPlayerPosition(player)`, which writes `player.x / player.y`
to the DB. These values are whatever the client last reported.

**Impact**: a client can persist any position to the database, including
out-of-bounds values, and reconnect there at next login.

**Severity**: high.

---

## 8. Authority table

| Action | Current authority | Recommended authority |
|---|---|---|
| Player position | **Client** (reported, stored verbatim) | Server (validate distance gate, walkability, bounds) |
| Player speed | **Client** (hardcoded locally, never sent) | Server (issue `effectiveSpeed` per entity) |
| Player destination (click) | **Client** | Client (intention only, server validates result) |
| Player destination (pathfinding) | **Client** (A\* computed locally) | Client or Server (open question, see movement-model.md §10) |
| Player collision | **Client** (Phaser only) | Server (mandatory tile check per movement event) |
| Map bounds enforcement | **Client** (Phaser world bounds 2000×2000) | Server (validate against real map dimensions) |
| Combat range (player→animal) | **Server formula, client-supplied position** | Server formula, server-authoritative position |
| Gather range | **Server formula, client-supplied position** | Server formula, server-authoritative position |
| Attack cooldown | **Server** | Server (already correct) |
| Animal position | **Server** | Server (already correct) |
| Animal speed | **Server** | Server (already correct) |
| Animal AI (aggro, patrol, flee) | **Server** | Server (already correct) |
| Knockback | Not implemented | Server |
| Teleportation (admin `/tp`) | **Server** | Server (already correct) |
| Spawn / respawn (player) | **Server** | Server (already correct) |
| Spawn / respawn (animal) | **Server** | Server (already correct) |
| Pathfinding grid | **Client** (32 px tiles) | To be decided (see open question §10 in movement-model.md) |
| Map transition | Not implemented | Server |
| Interaction (resource) | **Server validates range against client position** | Server validates range against server-authoritative position |
| Interaction (combat) | **Server validates range against client position** | Server validates range against server-authoritative position |

---

## 9. Technical debt — what must change to comply with ADR-0001, ADR-0002, movement-model.md

### ADR-0001 compliance gaps

| Gap | Location | Required change |
|---|---|---|
| Coordinates stored as pixel-equivalent `positionX / positionY` | `character` entity | Rename to `worldTileX / worldTileY`, convert values |
| Coordinates stored as pixel-equivalent `x / y` | `animal`, `resource`, `creature_spawn`, `respawn_point` entities | Rename to `worldTileX / worldTileY`, convert values |
| `player_move` payload uses `{ x, y }` in pixel units | `WorldGateway`, `WorldScene.syncLocalPlayer` | Change to `{ mapId, worldTileX, worldTileY }` |
| `player_moved` broadcast uses `{ x, y }` in pixel units | `WorldGateway`, all clients consuming `player_moved` | Change to `{ mapId, worldTileX, worldTileY }` |
| `world_joined` uses `{ x, y }` | `WorldService.joinPlayer`, client handler | Change to `{ mapId, worldTileX, worldTileY }` |
| `animal_update` uses `{ x, y }` | `AnimalsService.toDto`, client handler | Change to `{ mapId, worldTileX, worldTileY }` |
| `character_teleport` uses `{ x, y }` | `WorldService.teleportCharacter`, client handler | Change to `{ mapId, worldTileX, worldTileY }` |
| `character_respawn` uses `{ x, y }` | `WorldService.respawnCharacter`, client handler | Change to `{ mapId, worldTileX, worldTileY }` |
| Client pathfinder uses 32 px tiles, not `localTileX / localTileY` | `PlayerController.calculatePath`, `pathfinding.js` | Rebuild grid to match `localTileX / localTileY` after migration |
| `WorldScene` spawns player at `character.positionX / positionY` | `WorldScene.create` | Use `worldTileX / worldTileY` with projection formula |
| Remote player sprites positioned at `player.x / player.y` (pixel) | `WorldScene.upsertRemotePlayer` | Apply projection formula to tile coordinates |
| Animal sprites positioned at `animal.x / animal.y` (pixel) | `WorldScene.upsertAnimal` | Apply projection formula to tile coordinates |
| Keyboard input in screen-space axes | `PlayerController.update` | Remap to `worldTileX / worldTileY` isometric axes |
| `physics.world.setBounds(0, 0, 2000, 2000)` — arbitrary pixel bounds | `WorldScene.create` | Derive from map dimensions in tile units after migration |

### ADR-0002 compliance gaps

| Gap | Location | Required change |
|---|---|---|
| `character` uses `positionX / positionY` instead of `worldTileX / worldTileY` | `character.entity.ts` | Column rename + add `mapId` |
| `animal` uses `x / y` instead of `worldTileX / worldTileY` | `animal.entity.ts` | Column rename + add `mapId` |
| `resource` uses `x / y` | `resource.entity.ts` | Column rename + add `mapId` |
| `creature_spawn` uses `spawnX / spawnY` | `creature-spawn.entity.ts` | Column rename + add `mapId` |
| `respawn_point` uses `x / y` | `respawn-point.entity.ts` | Column rename + add `mapId` |
| No `mapId` in any position-bearing payload | All gateways | Add `mapId` to all position events |

### movement-model.md compliance gaps

| Gap | Location | Required change |
|---|---|---|
| No server-side distance gate on `player_move` | `WorldService.updatePlayer` | Add: distance from last validated position ≤ `effectiveSpeed × dt × tolerance` |
| No server-side walkability check on player positions | `WorldService.updatePlayer` | Add: lookup tile at `floor(worldTileX), floor(worldTileY)` before accepting |
| No server-side map bounds check on player positions | `WorldService.updatePlayer` | Add: `0 ≤ worldTileX < mapWidthTiles`, same for Y |
| No map bounds check on animal positions | `AnimalsService` (all movement methods) | Add: clamp to map bounds on every tick |
| No `effectiveSpeed` pipeline | Server | Create: `baseSpeed × product(modifiers)`, used for all entity types |
| Speed in pixel-equivalent units, not tile/s | All entities, seeds | Convert after ADR-0001 conversion factor is decided |
| Drag mode crosses walls | `PlayerController.directMoveToTarget` + server | Server must reject out-of-bounds or blocked final positions |
| Keyboard direction in screen axes | `PlayerController.update` | Remap to isometric diagonal axes |
| `RESOURCE_INTERACT_RANGE = 100` in pixel-equivalent units | `ResourcesGateway` | Convert to tile units after migration |
| `MELEE_RANGE = 60` in pixel-equivalent units | `AnimalsService` | Convert to tile units after migration |
| No `mapId` validation on position events | `WorldGateway`, `AnimalsGateway`, `ResourcesGateway` | Add `mapId` check after ADR-0002 column migration |

---

## 10. Summary

The current implementation grants full movement authority to the client for
player entities. The server is a relay: it stores whatever position the client
reports, rebroadcasts it, and uses it for range checks in combat and gathering.
There is no speed validation, no walkability check, and no map bounds
enforcement on the server for player movement.

Animal movement is the inverse: fully server-authoritative. The server computes
every position, applies every speed, and enforces leash constraints. Animals
have no tile collision and no map bounds enforcement, but their positions cannot
be manipulated by any client.

### Principal risks

1. **Teleportation and combat bypass are trivially available** to any client
   that sends modified `player_move` payloads. All range-based gameplay
   (combat, gathering) is currently bypassed by a single falsified position.

2. **Persisted positions are client-controlled.** A player can write arbitrary
   coordinates to the database via a normal disconnect.

3. **The coordinate system is split.** Client uses Phaser pixels. Server stores
   pixel-equivalent integers. ADR-0001 target is tile units. Three incompatible
   systems will coexist until migration is complete.

4. **The pathfinding grid (32 px tiles) diverges from the logical tile grid**
   (ADR-0001, 128 × 64 isometric tiles). This divergence will produce incorrect
   pathfinding after the coordinate migration.

### Prioritized migration list before ADR-0003

The following items must be resolved or explicitly acknowledged before ADR-0003
(Movement Authority) can be written. They are listed in dependency order.

1. **Resolve ADR-0001 storage type and conversion factor** (blocking for all
   numeric migrations). No unit conversion is safe without this decision.

2. **Add `mapId` to all entities and payloads** (ADR-0002). Required before
   any map-scoped validation can be implemented.

3. **Rename entity position columns** to `worldTileX / worldTileY`
   (ADR-0002). Enables uniform server-side position handling.

4. **Migrate WebSocket payloads** from `{ x, y }` to
   `{ mapId, worldTileX, worldTileY }`. Client and server must be updated
   atomically.

5. **Implement server-side distance gate** on `player_move`. Minimum viable
   anti-cheat for speed hacking and teleportation.

6. **Implement server-side walkability check** on `player_move`. Closes the
   wall traversal gap.

7. **Implement server-side map bounds check** on `player_move` and on all
   server-computed entity positions.

8. **Rebuild client pathfinder grid** using `localTileX / localTileY` to
   match the server's logical tile grid. Closes the 32 px vs 128 × 64 mismatch.

9. **Remap keyboard input to isometric axes.** Prerequisite for correct
   keyboard movement after the isometric migration.

10. **Convert speed and range constants to tile units.** Depends on item 1.

Items 5, 6, and 7 are the security-critical changes. Items 1–4 are
prerequisites for implementing them correctly.

---

## Related files

- [Movement Study](movement-study.md)
- [Movement Model](movement-model.md)
- [ADR-0001 — World Coordinate System](../01_Architecture/adr/ADR-0001-world-coordinate-system.md)
- [ADR-0002 — Entity Positioning](../01_Architecture/adr/ADR-0002-entity-positioning.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
