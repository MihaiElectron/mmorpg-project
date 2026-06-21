# ADR-0003 — Movement authority

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-06-21
- Date proposed: 2026-06-21
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
- Depends on:
  - docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md
  - docs/01_Architecture/adr/ADR-0002-entity-positioning.md
  - docs/01_Architecture/client-server-boundaries.md
  - docs/08_Gameplay/movement-authority-audit.md
  - docs/08_Gameplay/movement-model.md
- Used by: Project owner, developers, conversational assistants,
  repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents:
  - docs/02_Security/client-server-trust.md
  - docs/08_Gameplay/movement-study.md
  - docs/04_Server/websockets.md

---

## Context

ADR-0001 defines the world coordinate system (`worldX / worldY`,
`mapId`). ADR-0002 defines how entities store and transmit those coordinates.
Neither ADR defines who is authoritative for computing and validating positions
at runtime.

The movement authority audit (`movement-authority-audit.md`) documents the
current state of the codebase:

- The player is **client-authoritative**. The client computes its own position
  using Phaser Arcade Physics (`speed = 100` px/s), pathfinds locally on a
  client-only 32 px tile grid, and sends `{ x, y }` pixel coordinates to the
  server every 80 ms.
- The server receives `player_move: { x, y, direction }` and stores the values
  verbatim in memory with no validation beyond a type check. These values are
  re-broadcast to all other clients and used as the attacker's position in
  combat and gathering range checks.
- **Animal movement** is already server-authoritative. The server computes all
  animal positions via a 200 ms tick loop, applies speed integration, and
  broadcasts results. No client input can alter an animal's position.

The gap between these two models is the subject of this ADR.

### Current exploitable gaps (from audit)

1. **Unlimited teleportation**: any client can emit
   `player_move: { x: <any>, y: <any> }` and the server accepts it
   unconditionally. The player is instantly placed at the claimed position in
   memory, in other clients' renderings, and in the database on disconnect.

2. **Combat and gathering range bypass**: `AnimalsService.attack` and
   `ResourcesGateway.isInRange` compute distances against `client.data.player`,
   which is set by `player_move`. A client that falsifies its position before
   attacking or gathering bypasses all range checks.

3. **Persistence of false positions**: on disconnect, `persistPlayerPosition`
   writes `player.x / player.y` to the database. A client can write arbitrary
   coordinates to `character.positionX / positionY` via a normal disconnection.

4. **Client-only collision enforcement**: the server applies no walkability
   check on reported player positions. A client reporting positions inside walls
   is not detected or corrected.

5. **Client-only map bounds**: the client enforces `physics.world.setBounds(0,
   0, 2000, 2000)` via Phaser. The server applies no bounds check. A client can
   report coordinates outside any expected range.

6. **Client-only pathfinding**: the pathfinding algorithm runs entirely in the
   browser on a 32 px tile grid that does not correspond to the logical tile
   system defined in ADR-0001. The server does not know that a path exists, does
   not validate it, and cannot detect if the client reports positions that deviate
   from a computed path.

---

## Problem

Without a defined movement authority model:

- All position-dependent gameplay (combat range, gathering range, zone entry,
  future interactions) can be bypassed by reporting false coordinates.
- The server cannot enforce speed limits, collision rules, or map boundaries.
- The coordinate migration required by ADR-0001 and ADR-0002 cannot be
  completed safely: migrating coordinate types without also adding server-side
  validation would replace one unvalidated coordinate space with another.
- The animal movement model (server-authoritative) and the player movement
  model (client-authoritative) are architecturally inconsistent, preventing a
  unified movement service.
- There is no defined contract between client input and server-accepted position,
  making future features (prediction, reconciliation, knockback, forced movement,
  zone transitions) impossible to design coherently.

---

## Decision drivers

- The server must be the final authority on all entity positions, for all
  entity types.
- The client must be able to provide a responsive, low-latency experience
  without waiting for server round-trips on every frame.
- The security model must close the teleportation and range-bypass gaps before
  multi-player scale is reached.
- The movement authority model must be compatible with ADR-0001 coordinates and
  ADR-0002 entity positioning.
- The migration must be achievable incrementally without requiring a full
  rewrite in a single step.
- The model must be consistent with `movement-model.md`.

---

## Considered options

### Option A — Keep client authority, add server logging only

Log all received positions server-side and flag statistical outliers (e.g.,
displacement > expected threshold). Do not reject positions.

Rejected because: this detects cheating after the fact but does not prevent
gameplay impact. Combat and gathering remain exploitable. Persisted positions
remain falsifiable. The architecture does not move toward the target state.

### Option B — Server recomputes all player movement (full server tick)

The client sends inputs (direction vector, key state, or intent). The server
integrates movement at every tick, broadcasts positions, and the client
interpolates. No client-reported position is accepted.

Advantages: strongest authority model. No client can influence the server
position directly.

Disadvantages: requires the server to run a per-player movement loop at tick
rate; increases server load significantly; requires the client to switch from
Phaser Arcade Physics to a pure rendering mode; makes prediction and
reconciliation mandatory immediately; significantly increases implementation
complexity.

Not selected as the immediate target. Retained as the long-term destination
if player counts require it.

### Option C — Server validates client-reported positions (selected)

The client continues to compute movement locally for responsiveness. It reports
the resulting position to the server. The server validates the reported position
against defined rules and either accepts or corrects it.

This is the same model used for animal AI tick positions (server computes and
enforces) but applied in the direction of client → server: the client proposes,
the server decides.

Selected because it allows incremental migration, preserves client responsiveness
through local prediction, and closes the critical security gaps without requiring
a full movement loop on the server immediately.

---

## Decision

### 1. Authority model

**The server is the final authority on all entity positions.**

| Entity type | Movement driver | Authority |
|---|---|---|
| Player | Client input, locally predicted | Server validates and corrects |
| Animal | Server AI tick | Server unconditionally |
| NPC (future) | Server behavior script | Server unconditionally |

The client's role is to:
- transmit movement intentions or locally computed positions to the server;
- apply movement locally for immediate visual responsiveness (implicit
  prediction);
- interpolate remote entity positions between server updates;
- display the server-validated state as the ground truth.

The client must never:
- decide its own final position;
- decide its own effective speed;
- bypass collision or boundary rules;
- declare that a destination is valid;
- modify its own persisted position directly.

### 2. Server validation pipeline

On every `player_move` event, the server must apply the following checks in
order before accepting a position:

1. **`mapId` validation**: the reported `mapId` must match the map the
   character is currently on. A character cannot claim a position on a map it
   has not legitimately entered.

2. **Map bounds check**: the reported position must satisfy:
   ```
   0 ≤ worldX < mapWidthChunks × CHUNK_SIZE
   0 ≤ worldY < mapHeightChunks × CHUNK_SIZE
   ```
   A position outside these bounds is rejected. The character remains at its
   last validated position.

3. **Walkability check**: the tile at `(floor(worldX), floor(worldY))`
   must be walkable. If it is blocked, the position is rejected.

4. **Distance gate**: the Euclidean distance between the reported position and
   the last server-validated position must satisfy:
   ```
   distance ≤ effectiveSpeed × dt × tolerance
   ```
   Where `dt` is the elapsed time since the last validated `player_move`,
   `effectiveSpeed` is the server-owned speed value for this character, and
   `tolerance` is a configurable factor to accommodate network jitter. The exact
   value of `tolerance` is an open question.

   If the distance exceeds this threshold, the position is rejected.

5. **On rejection**: the server sends a correction event to the originating
   client with the last validated position. The client must reposition the
   local sprite to match. Other clients are not notified of the rejected
   position.

All five checks must pass for a position to be accepted and broadcast.

### 3. Server-owned speed

The server owns `effectiveSpeed` for every entity. The client does not decide
speed.

```
effectiveSpeed = baseSpeed × product(all active modifiers)
```

The server computes `effectiveSpeed` before the distance gate check. The client
may receive `effectiveSpeed` or a modifier list for local prediction purposes,
but the server enforces the value.

The current client-side `Player.speed = 100` is an implicit claim that the
server currently cannot verify. After migration, `baseSpeed` must be defined
in World Units per second (WU/s) and stored or computed server-side.

### 4. Client behavior (prediction and display)

The client applies movement locally without waiting for server acknowledgement.
This is implicit prediction. The client must be designed to accept server
corrections without producing visible glitches:

- On receiving a correction event, the client snaps or smoothly interpolates
  toward the server-validated position.
- The client must not re-apply the rejected inputs on top of the correction
  (this would produce infinite drift).

Full prediction with sequence numbers and replay of unacknowledged inputs is
not required at this stage. It is an open question for future implementation
when latency or player count makes it necessary.

For remote entities (other players, animals), the client interpolates between
server-broadcast positions. Interpolation has no gameplay effect. It is a
display technique only.

### 5. Payload contract (target state)

The current `player_move` payload `{ x, y, direction }` in pixel units must be
replaced. The target payload is:

```
player_move: {
  mapId:       string,
  worldX:  number,  // WU, signed integer (1 tile = 1024 WU)
  worldY:  number,  // WU, signed integer (1 tile = 1024 WU)
  direction:   string   // optional, display hint
}
```

The client converts pointer input from screen coordinates to `worldX /
worldY` using the inverse projection formula from ADR-0001 before sending.

The server responds to a validated event by broadcasting:

```
player_moved: {
  mapId:       string,
  worldX:  number,
  worldY:  number,
  direction:   string,
  characterId: string,
  name:        string,
  sex:         string
}
```

On rejection, the server sends to the originating client only:

```
player_position_correction: {
  mapId:      string,
  worldX: number,
  worldY: number
}
```

The event name `player_position_correction` is proposed here. The final name
is an open question.

### 6. Forced movement (server-initiated)

Events that reposition a player by server decision — teleportation, knockback,
respawn, zone transition — bypass the validation pipeline. They are applied
unconditionally because they originate from the server, not from the client.

These events must:
- Update the server's in-memory position before broadcasting.
- Persist the new position to the database before or at the same time as the
  broadcast (teleport, respawn) or defer to the normal disconnect-persist cycle
  (movement effects).
- Broadcast both to the originating client (`character_teleport`,
  `character_respawn`) and to other clients (`player_moved`).

The current implementation (`teleportCharacter`, `respawnCharacter`) already
follows this pattern. It must continue to do so after the coordinate migration.

### 7. Animal movement — reference model

The current animal movement implementation is closer to the target than the
current player movement implementation.

| Property | Animal (current) | Player (current) | Player (target) |
|---|---|---|---|
| Position computed by | Server tick | Client physics | Server validates client report |
| Speed applied by | Server | Client | Server enforces `effectiveSpeed` |
| Collision | None (debt) | Client only | Server mandatory |
| Map bounds | None (debt) | Client only | Server mandatory |
| Broadcast source | Server | Client via server relay | Server (validated) |
| Client can falsify? | No | Yes | No |

The animal model demonstrates that the server tick loop + broadcast pattern is
implementable at the current project scale. The player authority model targets
the same result via validation rather than full server-side computation.

Remaining gaps in the animal model (no tile collision, no map bounds check)
are technical debt shared with the player migration. They must be addressed
for both entity types when the coordinate migration is complete.

### 8. Security properties of this decision

Once this ADR is implemented:

- **Teleportation is blocked**: the distance gate rejects any `player_move`
  that claims a position not reachable at `effectiveSpeed` in the elapsed time.
- **Combat and gathering range bypass is blocked**: `client.data.player`
  position is now server-validated. A falsified `player_move` is either
  rejected (distance gate) or accepted at the corrected position. The server
  cannot be fooled into thinking the player is adjacent to a target it is not.
- **False position persistence is blocked**: `persistPlayerPosition` writes
  only server-validated positions. A rejected position is never persisted.
- **Wall traversal is blocked**: the walkability check prevents the server from
  accepting positions inside blocked tiles.
- **Out-of-bounds positions are blocked**: the map bounds check prevents
  coordinates outside the current map from being stored or broadcast.

Speed hacking (increasing `Player.speed` locally) becomes detectable: the
distance gate will reject positions that exceed `effectiveSpeed × dt ×
tolerance`. The player is held at the last valid position and receives a
correction.

---

## Rationale

Option C (server validates client-reported positions) is selected over Option B
(full server tick) because it allows incremental migration without immediately
requiring a server-side physics loop. The security gaps are closed by adding
validation to the existing `player_move` handler rather than replacing the
movement architecture entirely. Option B remains available as a future upgrade
if server-side movement computation becomes necessary at scale.

The animal model proves the broadcast-from-server pattern is viable at the
current project scale. The player model can be aligned with it via validation
without the full complexity of server-side movement integration.

---

## Consequences

### Positive

- All position-dependent gameplay (combat, gathering, future interactions) is
  protected from position falsification.
- Persisted positions in the database are always server-validated.
- The movement model becomes consistent across all entity types.
- The architecture is ready for full server-side movement computation
  (Option B) as a future upgrade, without requiring a redesign.
- Client responsiveness is preserved through local prediction.

### Negative

- The distance gate requires the server to track `lastValidatedPosition` and
  `lastValidatedAt` per connected player, increasing per-connection memory.
- The walkability check requires the server to have access to the tile collision
  data for the current map. This is not yet implemented server-side.
- Clients that experience high latency or packet loss may receive corrections
  more frequently, producing visible position snapping. The `tolerance` factor
  mitigates this but does not eliminate it.
- Rejecting a position and sending a correction adds one round-trip latency to
  recovery from any invalid move. This is unavoidable in a server-authoritative
  model.

### Risks

- **Partial migration**: if the distance gate is added before the coordinate
  migration (ADR-0001, ADR-0002), the gate operates in pixel-equivalent units.
  Speed values are not yet calibrated in World Units. The gate cannot be correctly
  calibrated until speed constants are expressed in WU/s.
- **Tile collision data availability**: the server does not currently have
  access to the collision grid. Building and serving this data server-side is a
  prerequisite for the walkability check.
- **Tolerance calibration**: setting the tolerance too tight will cause false
  rejections for legitimate players under normal network conditions. Setting it
  too loose will allow some speed hacking to pass undetected. The correct value
  must be determined from measurement under realistic network conditions.
- **Client correction handling**: if the client does not handle corrections
  gracefully (snap or smooth lerp), players will experience visible jumps.
  The client-side correction handler must be implemented before the server-side
  gate is activated.

---

## Migration plan

The following migrations are required to implement this ADR. They are listed
in dependency order.

### Phase 0 — Prerequisites (from ADR-0001 and ADR-0002)

These items are not defined by this ADR but block its implementation.

| Step | What | Depends on |
|---|---|---|
| 0.1 | Confirm DB column type (`INTEGER` vs `BIGINT`) and finalize per-map origin offset | ADR-0001 remaining open questions |
| 0.2 | Add `mapId` to all position-bearing entities | ADR-0001, ADR-0002 |
| 0.3 | Rename entity columns to `worldX / worldY` (signed integer, WU) | 0.1, 0.2 |
| 0.4 | Migrate WebSocket payloads to `{ mapId, worldX, worldY }` | 0.3 |
| 0.5 | Calibrate speed and range constants in World Units (WU/s) via gameplay validation | 0.1 |

### Phase 1 — Server validation (this ADR)

| Step | What | Depends on |
|---|---|---|
| 1.1 | Server tracks `lastValidatedPosition` and `lastValidatedAt` per player | 0.4 |
| 1.2 | Server owns `effectiveSpeed` per character (initial: `baseSpeed`, no modifiers) | 0.5 |
| 1.3 | Implement distance gate on `player_move` | 1.1, 1.2 |
| 1.4 | Make tile collision data available server-side | 0.3 |
| 1.5 | Implement walkability check on `player_move` | 1.4 |
| 1.6 | Implement map bounds check on `player_move` | 0.2, 0.3 |
| 1.7 | Implement `player_position_correction` event on the client | 1.3 |
| 1.8 | Add map bounds check and tile collision to animal positions (debt closure) | 1.4 |

### Phase 2 — Client alignment

| Step | What | Depends on |
|---|---|---|
| 2.1 | Rebuild client pathfinder grid using `localTileX / localTileY` | 0.4 |
| 2.2 | Remap keyboard input to isometric diagonal axes | 0.4 |
| 2.3 | Convert pointer input to `worldX / worldY` before sending | 0.4 |

### Phase 3 — Future (not in scope of this ADR)

| Step | What |
|---|---|
| 3.1 | Full prediction with sequence numbers and server reconciliation |
| 3.2 | Full server-side movement tick for players (Option B) |
| 3.3 | Tile collision available per chunk, scoped to current chunk |
| 3.4 | Socket.IO room scoping per chunk (interest management) |

---

## Open questions

The following questions are not resolved by this ADR.

1. **Tolerance factor for the distance gate.** What multiplier accommodates
   realistic network jitter without allowing speed hacking to pass? This
   requires measurement under real conditions.

2. **Correction event name and payload.** `player_position_correction` is
   proposed here. Should it also carry `mapId`? Should it include a sequence
   number for future reconciliation?

3. **Client correction UX.** Should the client snap immediately to the
   corrected position, or interpolate smoothly? Snapping is simpler but
   visually jarring. Interpolation is smoother but may allow brief periods
   of divergence.

4. **Full prediction + reconciliation.** When does the project need sequence
   numbers and server-side input replay? What player count or latency
   threshold triggers this decision?

5. **Server tick rate for validation.** Is validating `player_move` events
   on receipt (event-driven) sufficient, or does the server need a dedicated
   position validation tick for players (analogous to the animal AI tick)?

6. **Tile collision data format on the server.** Which format should the
   server use to store and query walkability? A per-chunk boolean grid?
   A set of blocked tile indices? This is a prerequisite for step 1.4.

7. **How are blocking tiles delivered to the server?** Via the Tiled TMJ
   export, a separate collision file, or a database column on tile records?

8. **Migration DB strategy.** How are existing pixel-equivalent `positionX /
   positionY` values converted to `worldX / worldY` for live
   characters in the database? What happens to positions that fall in
   blocked tiles after conversion?

9. **Speed modifier pipeline API.** What is the contract between the
   movement authority system and future systems that modify speed (combat
   buffs, equipment weight, terrain)? Push or pull? Event-driven or
   queried per tick?

10. **Map transition protocol.** When a player crosses a map boundary and
    enters a new map, which system handles the `mapId` change? How is the
    entry position on the destination map determined and validated?

---

## Validation checklist

- [x] Current codebase analyzed (world.gateway.ts, world.service.ts,
  animals.service.ts, animals.gateway.ts, resources.gateway.ts, Player.js,
  PlayerController.js, WorldScene.js, pathfinding.js).
- [x] Security gaps identified and documented in movement-authority-audit.md.
- [x] ADR-0001 and ADR-0002 reviewed for dependency.
- [x] movement-model.md reviewed for consistency.
- [x] Animal model analyzed as reference implementation.
- [x] Security impact reviewed.
- [x] Performance impact reviewed.
- [ ] Human approval recorded.
- [ ] Related documentation updated (deferred until this ADR is accepted).

---

## Security impact

This ADR directly addresses the most critical security gaps in the current
codebase. Once implemented:

- No client can claim an arbitrary position.
- No client can bypass combat or gathering range checks via position falsification.
- No client can persist false positions to the database.

The server gains authoritative knowledge of every player's position at all
times, which is the foundation for all future position-dependent security rules
(zone access, item interaction ownership, anti-cheat).

`mapId` validation (Phase 0 step 0.2) introduces a new gameplay-sensitive value
that must be protected: the server must verify that a character is authorized to
be on the claimed map before processing any position. This requirement is shared
with ADR-0002.

---

## Performance impact

- The distance gate adds one distance computation (`Math.hypot`) and one
  comparison per `player_move` event. Negligible.
- The walkability check adds one tile lookup per `player_move` event.
  Tile data must be in memory for the lookup to be fast. The data structure
  cost depends on the chosen format (open question 6).
- The map bounds check adds two comparisons per `player_move` event.
  Negligible.
- Tracking `lastValidatedPosition` and `lastValidatedAt` adds two fields to
  the `ConnectedPlayer` in-memory record. Negligible at current player counts.
- Sending `player_position_correction` only to the originating client (not
  broadcast) keeps network overhead minimal on rejection.

---

## Non-goals

- This ADR does not implement full server-side movement computation (Option B).
- This ADR does not define prediction or reconciliation with sequence numbers.
- This ADR does not define the tile collision data format or storage.
- This ADR does not define the map entity or zone transition mechanics.
- This ADR does not define the `effectiveSpeed` modifier pipeline beyond
  naming it as a server-owned value.
- This ADR does not calibrate speed or range constants in WU (deferred to gameplay calibration).
- This ADR does not define the gameplay distance metric (Euclidean WU, projected pixel, Chebyshev, Manhattan).
- This ADR does not define database migration scripts.

---

## Security notes

Position validation (distance gate, walkability, bounds) must run before any
position is stored, broadcast, or used for gameplay decisions. A position that
passes type validation but fails gameplay validation must be treated as if it
was never received, for all purposes.

`mapId` must be validated against a server-owned record of which map the
character has legitimately entered. A client cannot declare itself on a map by
reporting a `mapId`. Map entry must be granted server-side.

The correction event (`player_position_correction`) must be sent only to the
originating client. Broadcasting corrections to all clients would allow a
passive observer to infer that a specific player sent an invalid position,
leaking information about attempted cheating.

---

## Performance notes

The validation pipeline (distance gate + walkability + bounds) adds a constant
number of operations per movement event. At current player counts, this has no
measurable impact. At large player counts, the bottleneck is the
`server.emit` broadcast, not the per-event validation. Chunk-scoped Socket.IO
rooms (future) will reduce the broadcast cost independently of this ADR.

---

## Related files

- [ADR Index](README.md)
- [ADR-0001 — World Coordinate System](ADR-0001-world-coordinate-system.md)
- [ADR-0002 — Entity Positioning](ADR-0002-entity-positioning.md)
- [Movement Authority Audit](../../08_Gameplay/movement-authority-audit.md)
- [Movement Model](../../08_Gameplay/movement-model.md)
- [Movement Study](../../08_Gameplay/movement-study.md)
- [World Units Study](../../08_Gameplay/world-units-study.md)
- [Client Server Boundaries](../client-server-boundaries.md)
- [Client Server Trust](../../02_Security/client-server-trust.md)
- [Server WebSockets](../../04_Server/websockets.md)
- [STATUS.md](../../../STATUS.md)

## TODO

- [ ] Obtain human approval and record it in `Approved by` and
  `Approval reference`.
- [ ] Set `Decision status` to `Accepted` after human validation.
- [ ] Set `Date accepted` after human validation.
- [ ] Resolve Phase 0 prerequisites (ADR-0001, ADR-0002) before beginning
  Phase 1 implementation.
- [ ] Answer open questions 6 and 7 (tile collision format on server) before
  implementing step 1.4.
- [ ] Answer open question 1 (tolerance factor) before activating step 1.3 in
  production.
- [ ] Implement `player_position_correction` client handler (step 1.7) before
  activating the server-side distance gate (step 1.3) to avoid uncorrected
  client drift.
