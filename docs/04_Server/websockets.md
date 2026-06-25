# Server WebSockets

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/01_Architecture/realtime-socketio.md, docs/02_Security/client-server-trust.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the server-side NestJS Socket.IO implementation observed
in the repository.

It covers:

- NestJS gateways present in server code;
- connection authentication observed in gateways;
- client-to-server events handled by `@SubscribeMessage`;
- server-to-client events emitted by gateways or services used by gateways;
- in-memory state held by gateways and gateway services;
- service dependencies called from gateways;
- payload validation, authorization checks, cleanup, broadcasts, persistence,
  and unverified limits.

It does not define a new real-time architecture.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: configured in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

The purpose of this document is to give a code-faithful reference for the
server WebSocket surface.

Socket.IO payloads are treated as untrusted input. A connected socket is not
automatically authorized for every event; each sensitive event still needs
server-side checks.

## Server WebSocket overview

Implemented:

- Four NestJS gateways use `@WebSocketGateway`.
- All observed gateways use the default Socket.IO namespace.
- Gateway CORS origin is configured through `CLIENT_ORIGIN`.
- `WorldGateway`, `ResourcesGateway`, and `CreaturesGateway` authenticate
  connections with `WsAuthService`.
- `AdminGateway` handles admin events but no independent JWT
  `handleConnection` hook was observed.
- `WorldSocket` types `client.data.player`, `client.data.userId`, and
  `client.data.role`.
- Some server-to-client events are emitted by gateways.
- Some server-to-client events are emitted by services that receive a Socket.IO
  `Server` instance or store one after gateway initialization.

Not verified:

- Custom namespaces.
- Server-side rooms.
- Multi-instance Socket.IO behavior.
- Complete reconnect resynchronization.

## Gateway inventory

| Gateway | File or module | Namespace | Main responsibility | Authentication observed | Status |
|---|---|---|---|---|---|
| `WorldGateway` | `apps/api-gateway/src/world/world.gateway.ts`; `WorldModule` | Default | Authenticate sockets, join world, update player position, handle disconnect. | Calls `WsAuthService.authenticate` in `handleConnection`; disconnects invalid sockets. | `Implemented` |
| `ResourcesGateway` | `apps/api-gateway/src/resources/resources.gateway.ts`; `ResourcesModule` | Default | Send resources and process resource interaction cycles. | Calls `WsAuthService.authenticate` in `handleConnection`; disconnects invalid sockets. | `Implemented` |
| `CreaturesGateway` | `apps/api-gateway/src/creatures/creatures.gateway.ts`; `CreaturesModule` | Default | Send creatures, process creature attacks, start service patrol loop after gateway init. | Calls `WsAuthService.authenticate` in `handleConnection`; disconnects invalid sockets. | `Implemented` |
| `AdminGateway` | `apps/api-gateway/src/admin/admin.gateway.ts`; `AdminModule` | Default | Process admin spawn, teleport, template update, creature move, and respawn commands. | No independent `handleConnection` JWT authentication hook observed; handlers check `client.data.role`. | `Not verified` |

## Authentication and connection lifecycle

Implemented:

- `WsAuthService` extracts a token from `client.handshake.auth.token`.
- `WsAuthService` also accepts an `Authorization: Bearer ...` handshake header.
- `WsAuthService` verifies the token with `JwtService.verifyAsync`.
- Valid socket auth returns `userId`, optional `username`, and optional `role`.
- `WorldGateway`, `ResourcesGateway`, and `CreaturesGateway` set
  `client.data.userId` and `client.data.role` after successful authentication.
- Those gateways call `client.disconnect(true)` when authentication fails.
- `ResourcesGateway` emits resources after successful connection.
- `CreaturesGateway` emits creatures after successful connection.
- `WorldGateway` removes connected player state on disconnect and persists the
  last server-memory position.
- `ResourcesGateway` clears active gather session timers on disconnect.

Not verified:

- Independent authentication in `AdminGateway`.
- Guaranteed provenance of `client.data.role` before admin handlers run.
- Gateway connection hook ordering on the default namespace.
- Token expiration handling after a socket is already connected.

## Client-to-server events

| Event | Gateway | Payload summary | Server checks observed | Service calls or side effects | Status |
|---|---|---|---|---|---|
| `get_resources` | `ResourcesGateway` | No payload used. | Connection is expected to be authenticated by gateway connection lifecycle. | Calls `ResourcesService.findAll`; emits `resources` to the client. | `Implemented` |
| `get_creatures` | `CreaturesGateway` | No payload used. | Connection is expected to be authenticated by gateway connection lifecycle. | Calls `CreaturesService.findAll`; emits `creatures` to the client. | `Implemented` |
| `join_world` | `WorldGateway` | `characterId`, `name`, optional `sex`, optional position, optional direction. | Payload must be an object with string `characterId` and string `name`; service checks character existence and ownership against `client.data.userId`. | Calls `WorldService.joinPlayer`; sets connected-player memory and `client.data.player`; emits current and joined player events. | `Implemented` |
| `player_move` | `WorldGateway` | `x`, `y`, optional direction. | Requires payload with numeric `x` and numeric `y`; requires existing connected player in service memory. | Calls `WorldService.updatePlayer`; updates connected-player memory and `client.data.player`; broadcasts `player_moved`. | `Implemented` |
| `interact_resource` | `ResourcesGateway` | `targetId`. | Requires string `targetId`; requires joined `client.data.player`; checks resource existence, resource state, range, duplicate same-target session, movement during cycle, and remaining loots. | Calls `ResourcesService.findOne`, `LootService.generateLoot`, `InventoryService.addItem`, and `ResourcesService.consumeLoot`; starts or cancels gather session timers; emits loot and resource updates. | `Implemented` |
| `attack_creature` | `CreaturesGateway` | `targetId`. | Requires string `targetId`; requires joined `client.data.player`; service checks attack cooldown, creature existence, creature state, character existence, character health, and range. | Calls `CreaturesService.attack`; emits hit, update, and possible character damage events. | `Implemented` |
| `admin:spawn` | `AdminGateway` | `templateKey`, `x`, `y`. | Checks `client.data.role === 'admin'`; requires template key and numeric coordinates; service checks template existence. | Calls `CreaturesService.createAdminSpawn`; persists spawn and creature; emits creature update; returns command result. | `Not verified` |
| `admin:teleport` | `AdminGateway` | `characterId`, `x`, `y`. | Checks `client.data.role === 'admin'`; requires target id/name and numeric coordinates; requires connected target player. | Calls `WorldService.findPlayerByNameOrId` and `WorldService.teleportCharacter`; persists character position; returns command result. | `Not verified` |
| `admin:update_template` | `AdminGateway` | `key`, `fields`. | Checks `client.data.role === 'admin'`; requires key and fields object; applies allowed-field list and non-negative numeric checks; checks template existence. | Calls `AdminService.getTemplates` and `AdminService.updateTemplate`; emits category update; returns command result. | `Not verified` |
| `admin:move_creature` | `AdminGateway` | `creatureId`, `x`, `y`. | Checks `client.data.role === 'admin'`; requires creature id and numeric coordinates; service rejects missing or dead creature. | Calls `CreaturesService.moveCreature`; persists creature coordinates; returns command result. | `Not verified` |
| `admin:respawn_all` | `AdminGateway` | `templateKey`. | Checks `client.data.role === 'admin'`; requires template key. | Calls `CreaturesService.forceRespawnAll`; persists matching creature state and coordinates; returns command result. | `Not verified` |

## Server-to-client events

| Event | Gateway | Recipients | Payload summary | Trigger | Status |
|---|---|---|---|---|---|
| `resources` | `ResourcesGateway` | One client. | Resource list. | `ResourcesGateway.handleConnection` or `get_resources`. | `Implemented` |
| `creatures` | `CreaturesGateway` | One client. | Creature DTO list. | `CreaturesGateway.handleConnection` or `get_creatures`. | `Implemented` |
| `join_world_error` | `WorldGateway` | One client. | Error string. | Invalid `join_world` payload or rejected world join. | `Implemented` |
| `current_players` | `WorldGateway` | Joining client. | Connected players except joining socket. | Successful `join_world`. | `Implemented` |
| `world_joined` | `WorldGateway` | Joining client. | Joined player state. | Successful `join_world`. | `Implemented` |
| `player_joined` | `WorldGateway` | Other clients. | Joined player state. | Successful `join_world`. | `Implemented` |
| `player_moved` | `WorldGateway` / `WorldService` | Other clients, or all except teleported socket. | Player state. | `player_move` or admin teleport. | `Implemented` |
| `player_left` | `WorldGateway` | Other clients, or all clients for duplicate socket replacement. | Socket id and character id. | Disconnect or duplicate character connection during join. | `Implemented` |
| `gather_tick` | `ResourcesGateway` | Gathering client. | Target id and duration. | Gather cycle starts. | `Implemented` |
| `resource_loot` | `ResourcesGateway` | Gathering client. | Item id, loot item id, quantity, total quantity, item display data. | Successful gather cycle. | `Implemented` |
| `resource_update` | `ResourcesGateway` | All clients. | Resource id, state, remaining loots. | Resource consumed during gather cycle. | `Implemented` |
| `gather_stopped` | `ResourcesGateway` | Gathering client. | Target id and reason. | Gather cycle canceled, moved, out of range, depleted, or error. | `Implemented` |
| `creature_hit` | `CreaturesGateway` | Attacking client. | Creature DTO plus damage and attacker id. | Successful `attack_creature`. | `Implemented` |
| `creature_update` | `CreaturesGateway` / `CreaturesService` / `AdminGateway` | All clients. | Creature DTO. | Attack, patrol tick, service respawn, admin spawn, admin creature move, or admin respawn all. | `Implemented` |
| `character_damaged` | `CreaturesGateway` / `CreaturesService` | Affected client. | Character id, damage, health. | Attack riposte or creature auto-attack. | `Implemented` |
| `character_respawn` | `WorldService` | Respawned character socket. | Character id, coordinates, health, max health. | Character reaches zero health and respawns through service logic. | `Implemented` |
| `character_teleport` | `WorldService` | Teleported character socket. | Coordinates. | Admin teleport. | `Implemented` |
| `category:updated` | `AdminGateway` | All clients. | Updated template/category data. | Admin template update. | `Implemented` |

## Gateway state

| State | Gateway | Location | Lifetime | Persistent? | Recovery after restart | Status |
|---|---|---|---|---|---|---|
| Connected players | `WorldGateway` through `WorldService` | `WorldService.connectedPlayers` map keyed by socket id. | Process memory while server runs. | No; positions can be persisted on disconnect or admin teleport. | Full connected-player recovery after restart is `Not verified`. | `Implemented` |
| Socket auth data | `WorldGateway`, `ResourcesGateway`, `CreaturesGateway`, and shared socket use | `client.data.userId`, `client.data.role`. | Socket lifetime. | No | Recreated only by connection authentication; recovery after restart is `Not verified`. | `Implemented` |
| Joined player data | `WorldGateway` and later resource/creature handlers | `client.data.player`. | Socket lifetime after successful `join_world`. | No | Recreated only by another successful join. | `Implemented` |
| Gather sessions | `ResourcesGateway` | `gatherSessions` map keyed by socket id. | Until cancel, depletion, error, movement, target switch, or disconnect. | No | Recovery after restart is `Not verified`. | `Implemented` |
| Gather timers | `ResourcesGateway` | `NodeJS.Timeout` inside gather session. | Until cleared or fired. | No | Recovery after restart is `Not verified`. | `Implemented` |
| Live creatures | `CreaturesService` used by `CreaturesGateway` | `liveCreatures` map keyed by creature id. | Process memory after service initialization. | Partly backed by persisted creatures. | Service loads creatures on module init, but complete behavior-state recovery is `Not verified`. | `Implemented` |
| Patrol state | `CreaturesService` used by `CreaturesGateway` | `patrolStates` map keyed by creature id. | Process memory while server runs. | No | Recovery after restart is `Not verified`. | `Implemented` |
| Attack cooldowns | `CreaturesService` used by `CreaturesGateway` | `lastAttackAt` and `lastCreatureAutoAttackAt` maps. | Process memory while server runs. | No | Recovery after restart is `Not verified`. | `Implemented` |
| Stored Socket.IO server reference | `CreaturesService` | `server` field set by `CreaturesGateway.afterInit`. | Process memory while server runs. | No | Recreated by gateway initialization. | `Implemented` |
| Admin gateway state | `AdminGateway` | No custom map or session state observed; gateway has Socket.IO server reference. | Process memory while gateway exists. | No | Recovery after restart is `Not verified`. | `Implemented` |

## Service dependencies

| Gateway | Service or dependency | Purpose | Persistence impact | Status |
|---|---|---|---|---|
| `WorldGateway` | `WsAuthService` | Authenticate connection token. | None observed directly. | `Implemented` |
| `WorldGateway` | `WorldService` | Join players, update player memory, remove players, persist position on disconnect. | Reads characters; updates character position. | `Implemented` |
| `ResourcesGateway` | `WsAuthService` | Authenticate connection token. | None observed directly. | `Implemented` |
| `ResourcesGateway` | `ResourcesService` | Load resources and consume resource loot count. | Reads resources; updates resource state and remaining loot count. | `Implemented` |
| `ResourcesGateway` | `LootService` | Generate loot item reference and quantity from resource type. | None observed directly. | `Implemented` |
| `ResourcesGateway` | `InventoryService` | Add generated loot to joined character inventory. | Reads character and item; creates or updates inventory entry. | `Implemented` |
| `CreaturesGateway` | `WsAuthService` | Authenticate connection token. | None observed directly. | `Implemented` |
| `CreaturesGateway` | `CreaturesService` | Send creatures, process attacks, run patrol loop, move or respawn creatures for admin commands. | Reads and updates creatures and characters; can update character health and creature state. | `Implemented` |
| `CreaturesGateway` | `WorldService` through `CreaturesService` | Access connected players and respawn characters. | Updates character health and position during respawn paths. | `Implemented` |
| `AdminGateway` | `CreaturesService` | Create admin spawn, move creature, force respawn all. | Creates spawns and creatures; updates creature coordinates and state. | `Implemented` |
| `AdminGateway` | `WorldService` | Resolve connected player and teleport character. | Updates character position. | `Implemented` |
| `AdminGateway` | `AdminService` | Read and update templates. | Reads templates; saves template updates. | `Implemented` |

## Payload validation

| Payload category | Gateway or event | Validation observed | Missing or unverified validation | Status |
|---|---|---|---|---|
| World join payload | `join_world` | Requires object with string `characterId` and string `name`; service verifies character exists and belongs to authenticated user id. | Complete DTO validation and extra-field rejection are `Not verified`. | `Implemented` |
| Movement payload | `player_move` | Requires numeric `x` and numeric `y`; requires connected player in memory. | Complete movement validation, server collision, authoritative map checks, max speed, elapsed time, and replay protection are `Not verified`. | `Not verified` |
| Resource interaction payload | `interact_resource` | Requires string `targetId`; requires joined player; checks target existence, target state, range, movement during cycle, and remaining loot count. | Rate limiting, replay protection, and exactly-once loot delivery are `Not verified`. | `Implemented` |
| Creature attack payload | `attack_creature` | Requires string `targetId`; requires joined player; service checks target, character, cooldown, health, and range. | Idempotence and replay protection are `Not verified`. | `Implemented` |
| Admin spawn payload | `admin:spawn` | Requires admin role, template key, numeric `x`, numeric `y`; service checks template. | Idempotence, deduplication, rate limiting, and quota checks are `Not verified`. | `Not verified` |
| Admin teleport payload | `admin:teleport` | Requires admin role, target id/name, numeric `x`, numeric `y`; resolves connected player. | Destination policy and replay protection are `Not verified`. | `Not verified` |
| Admin template payload | `admin:update_template` | Requires admin role, key, fields object, allowed field names, numeric non-negative values, and existing template. | Concurrent update handling and per-field permission model are `Not verified`. | `Not verified` |
| Admin creature move payload | `admin:move_creature` | Requires admin role, creature id, numeric `x`, numeric `y`; service checks live creature. | Id validation and replay protection are `Not verified`. | `Not verified` |
| Admin respawn payload | `admin:respawn_all` | Requires admin role and template key. | Server-side confirmation, rate limiting, and idempotence are `Not verified`. | `Not verified` |

## Authorization checks

| Action area | Authentication observed | Authorization observed | Gaps | Status |
|---|---|---|---|---|
| Connection authentication | `WorldGateway`, `ResourcesGateway`, and `CreaturesGateway` call `WsAuthService.authenticate`. | Valid auth populates `client.data.userId` and optional role. | `AdminGateway` independent authentication is `Not verified`. | `Implemented` |
| World join | Authenticated socket expected; `client.data.userId` is used. | `WorldService.joinPlayer` checks character ownership. | Rejoin and duplicate socket semantics beyond observed behavior are `Not verified`. | `Implemented` |
| Movement | Authenticated joined socket expected. | Requires existing player in connected-player memory. | Complete movement validation, server collision, authoritative map checks, replay protection, and rate limiting are `Not verified`. | `Not verified` |
| Resource interaction | Authenticated joined socket expected. | Uses `client.data.player` rather than trusting a submitted character id; checks range and target state. | Rate limiting and replay protection are `Not verified`. | `Implemented` |
| Creature attack | Authenticated joined socket expected. | Uses `client.data.player`; service checks target, character, range, and cooldown. | Replay protection and idempotence are `Not verified`. | `Implemented` |
| Admin events | No independent `AdminGateway` authentication hook observed. | Each observed handler checks `client.data.role === 'admin'`. | Guaranteed role provenance and connection hook ordering are `Not verified`. | `Not verified` |

## Error handling

Implemented:

- Invalid WebSocket authentication disconnects sockets in `WorldGateway`,
  `ResourcesGateway`, and `CreaturesGateway`.
- Invalid `join_world` payload emits `join_world_error` with
  `Invalid player payload`.
- Rejected world join emits `join_world_error` with `Character not found`.
- Invalid resource interaction payload logs a warning and returns without an
  event response.
- Resource interaction without joined player logs a warning and returns.
- Missing, depleted, or out-of-range resource logs a warning and returns.
- Gather cycle errors emit `gather_stopped` with reasons such as `error`,
  `moved`, `depleted`, or `out_of_range`.
- Creature attack without joined player logs a warning and returns.
- Rejected creature attack logs a warning and returns.
- Admin handlers return acknowledgement-style objects with `success` and
  `message`.
- Unauthorized admin events return `success: false` with a not-authorized
  message.
- Invalid admin payloads return `success: false` with command-specific payload
  messages.

Not verified:

- Uniform error contract across all WebSocket events.
- Structured server-side logging.
- Client retry semantics after silent returns.

## Disconnect and cleanup

Implemented:

- `WorldGateway.handleDisconnect` removes the socket from connected-player
  memory.
- `WorldGateway.handleDisconnect` persists the last known player position before
  broadcasting `player_left`.
- `ResourcesGateway.handleDisconnect` clears the gather session for the socket.
- `ResourcesGateway.clearSession` clears the stored timer before deleting the
  session.

Not verified:

- Disconnect cleanup in `CreaturesGateway`.
- Disconnect cleanup in `AdminGateway`.
- Full cleanup of service-level creature timers or patrol interval on shutdown.
- Full reconnect resynchronization after disconnect.

## Broadcast behavior

Implemented:

- `client.emit` is used for targeted responses to one socket.
- `client.broadcast.emit` is used for player join, movement, and disconnect
  updates excluding the sender.
- `server.emit` is used for global updates such as resource updates, creature
  updates, category updates, and duplicate-socket player-left notification.
- `server.to(socketId).emit` is used for targeted character damage, respawn,
  and teleport events.
- `server.except(socketId).emit` is used after admin teleport to emit movement
  to every socket except the teleported socket.

Not verified:

- Room-scoped emission.
- Custom namespace isolation.
- Broadcast limits for large player counts.

## Persistence behavior

Implemented:

- `WorldService.joinPlayer` reads character rows and checks ownership.
- Duplicate character join can persist the previous socket player's position.
- `WorldGateway.handleDisconnect` persists player position.
- `WorldService.teleportCharacter` persists character position and emits
  teleport/movement events.
- `ResourcesService.consumeLoot` updates resource remaining loot count and
  state.
- `InventoryService.addItem` creates or updates inventory entries for generated
  loot.
- `CreaturesService.attack` saves creature state and can update character health.
- `CreaturesService.respawnCharacter` path through `WorldService` can update
  character health and position.
- `CreaturesService.createAdminSpawn` creates a spawn and creature.
- `CreaturesService.moveCreature` persists creature coordinates.
- `CreaturesService.forceRespawnAll` persists matching creature state and
  coordinates.
- `AdminService.updateTemplate` saves template updates.

Not verified:

- Transaction boundaries for multi-step WebSocket operations.
- Exactly-once persistence for retried or duplicated messages.
- Recovery of all in-memory state after process restart.

## Delivery and retry semantics

Implemented:

- Regular game events use Socket.IO emits without application-level sequence
  numbers in inspected gateway code.
- Admin command handlers return values that Socket.IO can use as
  acknowledgement responses.
- Resource gathering uses server timers and emits progress, loot, update, and
  stop events.

Not verified:

- Exactly-once delivery.
- At-least-once or at-most-once delivery contract.
- Application-level acknowledgement for non-admin events.
- Server-side retry queues.
- Deduplication keys.
- Replay protection.
- Full reconnect resynchronization.

## Performance and scalability

Implemented:

- `ResourcesGateway` stores gather sessions by socket id and clears timers on
  cancellation or disconnect.
- `CreaturesService` runs a patrol interval with `PATROL_TICK_MS`.
- `WorldService` stores connected players in a process-local map.
- Several updates are emitted globally with `server.emit`.

Not verified:

- Server-side rate limiting.
- Multi-instance Socket.IO.
- Shared adapter behavior.
- Room-, zone-, or chunk-scoped scaling.
- Load behavior with many connected sockets.
- Backpressure behavior under frequent movement or creature updates.

## Verified behavior

Implemented:

- `WorldGateway`, `ResourcesGateway`, `CreaturesGateway`, and `AdminGateway` are
  present.
- `WorldGateway`, `ResourcesGateway`, and `CreaturesGateway` authenticate
  connections with `WsAuthService`.
- Invalid auth disconnects sockets in those three gateways.
- `join_world` verifies character ownership through `WorldService`.
- `player_move` updates server memory only for an existing connected player.
- `interact_resource` uses joined player state and validates target, range,
  movement during cycle, target state, and remaining loot count.
- `attack_creature` uses joined player state and delegates target, range,
  cooldown, and health checks to `CreaturesService`.
- Admin socket events check `client.data.role === 'admin'`.
- Resource sessions are cleared on disconnect.
- Player position is persisted on disconnect.

## Known gaps

Not verified:

- Complete movement validation.
- Server collision.
- Authoritative map.
- Server rate limiting.
- Idempotence.
- Deduplication.
- Replay protection.
- Exactly-once delivery.
- Full reconnect resynchronization.
- Rooms/zones/chunks.
- Multi-instance Socket.IO.
- Recovery of memory state after restart.
- Independent authentication of `AdminGateway`.
- Structured audit of admin commands.
- Gateway connection hook ordering for shared socket data.
- Token expiration behavior for already connected sockets.

## Review checklist

- [ ] WebSocket payloads are treated as untrusted.
- [ ] Connection authentication is verified per gateway.
- [ ] Sensitive events check authorization server-side.
- [ ] Movement events are not treated as authoritative without validation.
- [ ] Admin events do not rely on client UI visibility.
- [ ] Duplicate and replay risks are reviewed.
- [ ] Rate limiting or abuse protection is reviewed.
- [ ] Gateway memory state is reviewed for restart recovery.
- [ ] Broadcast scope is reviewed before MMO-scale usage.
- [ ] This document is validated before moving to `Review`.

## Non-goals

- This document does not describe the complete project architecture.
- This document does not document detailed HTTP authentication behavior.
- This document does not document complete admin security policy.
- This document does not describe client implementation details.
- This document does not describe database schema design or migrations.
- This document does not propose a future Socket.IO architecture.

## Security notes

- Socket payloads are untrusted.
- Authentication at connection time does not authorize every event.
- `client.data.role` must have trusted server-side provenance before admin
  checks can be treated as complete.
- Movement payloads must not be treated as authoritative unless server-side
  validation is complete.
- Silent returns can be acceptable for rejection, but they make client-visible
  error semantics harder to reason about.
- No real secrets, tokens, passwords, or hashes are documented here.

## Performance notes

- Process-local maps are simple but do not provide multi-process state sharing.
- Global emissions can become expensive as socket count grows.
- The creature patrol loop emits frequent updates.
- Resource gather timers are per active socket session.
- No benchmark or load-test result was found for WebSocket throughput.

## Related files

- [Documentation Index](../README.md)
- [Realtime Socket.IO](../01_Architecture/realtime-socketio.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Authentication JWT](../02_Security/authentication-jwt.md)
- [Admin Permissions](../02_Security/admin-permissions.md)
- [NestJS API Gateway](nestjs-api-gateway.md)
- [Server Modules](modules.md)
- [TypeORM](typeorm.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should `AdminGateway` authenticate sockets independently?
- Should movement validation include speed, elapsed time, destination policy,
  and server collision checks?
- Should gateway events use DTO classes or explicit schemas?
- Should server events use sequence numbers or operation ids?
- Should admin commands require idempotency keys?
- Should resource and admin operations use transactions where multiple writes
  are involved?
- Should broadcasts be scoped before larger load testing?
- Should reconnect flows explicitly resync all relevant server state?

## TODO

- [ ] Validate this document with the project owner.
- [ ] Review `AdminGateway` authentication and `client.data.role` provenance.
- [ ] Review movement validation and server collision requirements.
- [ ] Review rate limiting, replay protection, and idempotence for WebSocket events.
- [ ] Review memory-state recovery after restart.
- [ ] Review broadcast scope before MMO-scale usage.
- [ ] Move this document to `Review` only after human validation.
