# Client Server Boundaries

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/01_Architecture/overview.md, docs/02_Security/client-server-trust.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the observed boundaries between the browser client,
React, Phaser, Zustand, Socket.IO, NestJS, TypeORM, PostgreSQL, map data, and
admin tooling.

It documents what each side may display, store, send, validate, broadcast, and
persist. It also marks unverified or unresolved areas as `Not verified` or
`TBD`.

## Verification labels

- `Implemented`: verified in the current repository code.
- `Configured`: present in configuration, but runtime usage may not be verified.
- `Not verified`: the inspected code did not provide enough evidence.
- `TBD`: intentionally unresolved or still to be documented.

These labels describe only the state observed at `Last updated`.

## Purpose

This document helps reviewers and future assistants avoid moving authority from
the server to the client by accident.

The client may render, predict, cache, and send intentions. The server remains
responsible for validating security-sensitive gameplay decisions before they are
accepted as real game state.

## Boundary principles

- The browser client is untrusted.
- React UI state is not server authority.
- Phaser rendering, movement prediction, and collision checks are not server
  authority.
- Zustand state is local client state and can be modified by the user.
- Client-side maps, Tiled JSON, collision files, and tileset properties are not
  authoritative for gameplay.
- Socket.IO client events are intentions or requests, not facts.
- NestJS controllers, gateways, and services are the server-side validation
  boundary.
- PostgreSQL stores persistent state through TypeORM, but database persistence
  does not replace server-side rule validation.
- Admin UI visibility is not authorization.
- Every sensitive action must be checked server-side before producing gameplay
  effects.

## Responsibility matrix

| Domain | React | Phaser | Zustand | NestJS / Socket.IO | PostgreSQL | Status |
|---|---|---|---|---|---|---|
| Authentication | Displays login/register pages and stores the returned token in browser storage. | Sends no direct authentication request for login. | May use token-dependent loaded state. | Auth routes issue JWTs; HTTP guards and WebSocket auth verify tokens. | Stores users, password hashes, and roles. | Implemented |
| Character loading and selection | Routes to world or character creation and starts character loading. | Uses loaded character data to render the local player. | Loads and stores current character, equipment, and inventory for display. | Character endpoints use JWT guards and services to return owned data. | Stores characters, equipment, inventory, and items. | Implemented |
| World rendering | Hosts the world route and layout. | Renders player, remote players, resources, animals, HP bars, and interaction visuals. | Provides local character and UI state used by React and Phaser. | Sends current players, resources, animals, and updates through gateways. | Stores persistent world-related entities through services. | Implemented |
| UI state | Renders panels, tabs, inventory, action panel, and admin panel. | Opens interaction panels and updates visual selection. | Stores local UI, action panel, item, character, and admin state. | Does not trust UI state as authorization. | No UI state persistence verified. | Implemented |
| Movement | Hosts the page that creates the socket and Phaser game. | Computes local movement and emits `player_move`. | Stores character data but is not movement authority. | World gateway updates connected-player memory and broadcasts movement. | Character position is persisted on disconnect and admin teleport. | Implemented / Not verified |
| Mobility | No gameplay mobility authority. | Performs local steering and pathfinding fallback. | No mobility authority. | Server-side mobility validation for normal movement was not verified. | No authoritative mobility map was verified. | Not verified |
| Gameplay collisions | No collision authority. | May use local collision or pathfinding helpers. | No collision authority. | Server-side gameplay collision validation was not verified. | No authoritative collision persistence was verified. | Not verified |
| Client prediction | No direct prediction authority. | Moves the local player before server acceptance is fully verified. | May display predicted or locally updated state. | Can broadcast accepted movement, but correction/refusal behavior was not verified. | No direct prediction state. | Implemented / Not verified |
| Resources | Displays interaction UI and inventory updates. | Renders resource targets and emits resource interaction events. | Stores displayed inventory updates. | Resource gateway validates joined player, target, range, movement tolerance, and resource state before loot. | Stores resources, items, and inventory updates. | Implemented |
| Loot | Displays loot and inventory changes. | Receives resource loot events and visual updates. | Updates local inventory display. | Server services generate and apply loot through inventory/resource logic. | Stores inventory and item data. | Implemented |
| Inventory | Renders inventory and equipment UI. | Receives inventory-related events for world feedback. | Stores displayed inventory and equipment. | Character and inventory-related endpoints and services update server state. | Stores inventory, equipment, and item rows. | Implemented |
| Animals | Displays action panel and health-related UI. | Renders animals, emits attacks, and displays animal updates. | Stores local action and character display state. | Animal gateway and service validate target, range, cooldown, combat, respawn, and updates. | Stores animals, templates, spawns, and character health. | Implemented |
| Admin commands | Displays admin tab when the decoded JWT role is `admin`; this is not authorization. | Sends admin Socket.IO events through admin helpers. | Stores local admin panel and command state. | Admin HTTP routes use JWT and role guards; admin gateway checks socket role for observed commands. | Stores templates, spawns, animals, characters, and related admin changes. | Implemented / Not verified |
| Permissions | May hide or show UI based on decoded token data. | No permission authority. | No permission authority. | JWT guards, role guards, and gateway role checks are server-side controls observed in code. | Stores user roles. | Implemented |
| Positions | Does not own gameplay position. | Maintains and displays local player position. | Stores loaded character position for client display. | World service keeps connected-player position in memory. | Stores saved character position. | Implemented |
| Maps and chunks | Does not own map authority. | Map files and helpers exist client-side. | No map authority. | Server-side authoritative map, chunk, mobility, or collision validation was not verified. | No authoritative map or chunk persistence was verified. | Not verified / TBD |
| Persistence | No persistence authority beyond browser storage. | No persistence authority. | Local state only. | Services write through TypeORM repositories. | Stores persistent users, characters, inventory, resources, animals, templates, spawns, and respawn points. | Implemented |

## React boundary

Implemented:

- Defines routes for login, character creation, and the world page.
- Creates the world layout that hosts the Phaser game.
- Displays inventory, action panel, character layout, and admin panel.
- Calls HTTP endpoints with `fetch`.
- Stores the JWT in browser storage through existing page logic.
- Can decode the JWT role to show or hide the admin tab.

Security boundary:

- React display state is not authorization.
- Hiding or showing a button, tab, or panel does not validate a gameplay or
  admin action.
- Data entered or emitted by React must be validated by NestJS before it affects
  persistent or authoritative state.

## Phaser boundary

Implemented:

- Renders the world scene, local player, remote players, resources, animals, HP
  bars, and interaction targets.
- Handles keyboard, pointer click, pointer drag, simple pathfinding fallback,
  direct steering, and local movement.
- Emits Socket.IO events such as `join_world`, `player_move`,
  `interact_resource`, `attack_animal`, and observed admin commands.
- Reads local state from Zustand stores for character, action panel, and admin
  UI behavior.

Security boundary:

- Phaser is a renderer and interaction layer, not a source of server truth.
- Phaser-computed movement, pathfinding, collisions, target selection, or
  distance checks must not be accepted as authoritative only because they match
  the client display.
- A modified client-side tile, collision, map file, or `walkable` property must
  not allow a player to bypass server-side rules.

Not verified:

- Complete Tiled map rendering in the active world scene.
- Server correction or refusal flow for invalid predicted movement.

## Zustand boundary

Implemented:

- Stores local character, inventory, equipment, item, action panel, and admin UI
  state.
- Uses browser-level singleton stores so React and Phaser can share state.
- Receives and displays updates from HTTP responses and Socket.IO events.

Security boundary:

- Zustand state is client local state.
- Zustand state can be changed by a modified client.
- Zustand state must not authorize server actions, grant permissions, create
  items, move characters, or decide gameplay collisions.

## Socket.IO boundary

Implemented:

- The React world page creates one Socket.IO client with JWT auth and attaches
  it to the Phaser game instance.
- Server gateways authenticate sockets through shared WebSocket auth logic.
- World events handle joining, movement, current players, player joins, player
  moves, and player leaves.
- Resource events handle resource listing, gathering, inventory updates, loot,
  and resource updates.
- Animal events handle animal listing, attacks, animal updates, and character
  damage.
- Admin events handle observed spawn, teleport, template update, animal move,
  and respawn commands.

Boundary rule:

- Client Socket.IO events are requests or intentions.
- Gateways must validate authentication, authorization, payload shape,
  ownership, target existence, and gameplay rules where relevant.

Implemented examples:

- `join_world` verifies character ownership through server-side character data.
- `interact_resource` validates joined player state, target existence, range,
  movement during gathering, and resource availability.
- `attack_animal` routes combat through server-side animal service logic.
- Observed admin gateway commands check `client.data.role === 'admin'`.

Not verified:

- Complete speed, elapsed-time, collision, blocked-zone, or forbidden-teleport
  validation for normal `player_move`.
- Full protection against repeated or replayed admin commands.
- Chunk-scoped, room-scoped, or zone-scoped broadcast strategy.

## NestJS boundary

Implemented:

- Bootstraps global validation pipes.
- Configures CORS and Swagger.
- Loads Auth, Common, Characters, Inventory, Resources, World, Animals, and
  Admin modules.
- Provides HTTP controllers, guards, gateways, services, and TypeORM access.
- Uses JWT guards and role guards for observed admin HTTP endpoints.
- Uses WebSocket authentication for observed gateways.

Authority boundary:

- NestJS controllers, gateways, and services are the place where sensitive
  gameplay and admin decisions must be validated.
- Server-side validation must cover permissions, ownership, target identifiers,
  movement, mobility, collisions, resources, loot, inventories, cooldowns, and
  admin actions when those domains are involved.

Not verified:

- Normal player movement validation for max speed, elapsed time, map
  collisions, blocked zones, and forbidden teleports.
- Complete authoritative map or chunk validation.

## PostgreSQL boundary

Implemented:

- TypeORM connects the NestJS API to PostgreSQL.
- PostgreSQL stores users, characters, equipment, inventory, items, resources,
  animals, creature templates, creature spawns, and respawn points.
- Character position is persisted on disconnect and during admin teleport.
- Resource gathering, inventory changes, animal state, and respawn-related data
  use server-side services and TypeORM entities.

Boundary rule:

- PostgreSQL stores persistent data.
- PostgreSQL does not make client requests trustworthy by itself.
- Services must validate rules before writing persistent gameplay state.
- Server memory state and PostgreSQL state must be distinguished.

Not verified:

- Production migration strategy.
- Complete crash recovery or resynchronization between server memory and
  persisted world state.

## Tiled, maps and collision boundary

Implemented:

- Client asset folders contain map and collision-related files such as
  `world.json`, `collisions.json`, and tileset assets.
- Phaser map helper code exists for tilemap and collision setup.

Security boundary:

- Client-side map files are modifiable.
- Tiled JSON loaded by Phaser is untrusted.
- Client-side tileset properties are untrusted.
- Client-side collision data can support rendering or prediction, but cannot
  decide authoritative gameplay movement.

Not verified:

- Active runtime usage of `world.json` in the inspected `WorldScene`.
- Authoritative server-side map, collision, mobility, or chunk data.

TBD:

- Define how map, collision, and mobility data should become server-side
  authority.

## Admin boundary

Implemented:

- The React layout shows an admin tab when the decoded JWT role is `admin`.
- The admin panel calls observed admin HTTP endpoints for overview and
  templates.
- The admin panel parses commands and emits observed admin Socket.IO events.
- Admin HTTP endpoints use JWT and role guards.
- Admin gateway handlers check the authenticated socket role for observed
  sensitive commands.

Security boundary:

- The admin interface is still an untrusted client.
- Admin UI visibility is not authorization.
- Admin Socket.IO events must be treated as untrusted input.
- Roles, permissions, submitted data, and target identifiers must be verified
  server-side.
- An operation must not be accepted only because it came from the official admin
  panel.

Not verified:

- Protection for every possible future admin operation.
- Complete duplicate-execution protection for repeated critical admin commands.
- Audit or traceability architecture for critical admin operations.

## Movement boundary

#### Implemented

Observed flow:

```text
local input
-> Phaser movement or prediction
-> player_move event
-> gateway handling
-> broadcast
-> eventual persistence
```

Details:

1. The user provides keyboard or pointer input.
2. Phaser moves or predicts the local player position.
3. Phaser emits `player_move` through Socket.IO when position or direction
   changes.
4. The world gateway checks the basic payload shape.
5. The world service updates connected-player position in server memory.
6. The gateway broadcasts movement to other clients.
7. Position is persisted when the socket disconnects and during admin teleport.

#### Not verified

- Maximum speed validation.
- Allowed distance validation.
- Elapsed-time validation.
- Server-side gameplay collision validation.
- Server-side blocked-zone validation.
- Forbidden teleport prevention for normal movement.
- Client correction or rollback after rejected movement.
- Server-side authoritative map validation.

## State ownership and persistence

| State | Client local | Server memory | PostgreSQL | Authoritative source | Status |
|---|---|---|---|---|---|
| JWT token | Stored in browser storage and sent with HTTP/Socket.IO requests. | Decoded by guards and WebSocket auth for requests. | User identity and role are stored. | NestJS auth with PostgreSQL user data. | Implemented |
| UI open state | React and Zustand hold panels, tabs, and action state. | No server ownership verified. | No persistence verified. | Client local only. | Implemented |
| Displayed inventory | React and Zustand display inventory and equipment. | Server emits or returns updates. | Inventory, item, and equipment data are stored. | Server services and PostgreSQL for gameplay state. | Implemented |
| Local position | Phaser keeps and displays local position. | Not authoritative by itself. | Not written directly by the client. | Client visual state only. It is never authoritative for gameplay. | Implemented / Not verified |
| Connected position | Phaser sends position events. | World service stores connected players in memory. | Persisted later in specific flows. | Server memory represents the observed connected-session position, but full movement validation is not verified. | Implemented / Not verified |
| Saved position | Loaded into the client with character data. | May be copied into connected-player state. | Character position fields store saved position. | PostgreSQL through NestJS services for persisted position. This is distinct from the live connected-session position. | Implemented |
| Resources | Rendered and interacted with client-side. | Gather sessions and gateway checks exist in memory. | Resource and inventory state are stored. | Server services and PostgreSQL. | Implemented |
| Animals | Rendered and targeted client-side. | Animal service keeps live and patrol state in memory. | Animal, template, spawn, and character state are stored. | Server service logic with PostgreSQL persistence. | Implemented |
| Cooldowns | Client may show or trigger repeated actions. | Animal attack cooldowns and gather sessions exist server-side. | No cooldown persistence verified. | Server memory for observed cooldown behavior. | Implemented |
| Admin permissions | Admin tab display may use decoded JWT role. | Gateway role checks use authenticated socket data. | User role is stored. | NestJS HTTP guards, gateway role checks, and PostgreSQL user role. | Implemented |
| Map and mobility | Client maps, helpers, and collision data may exist locally. | Server map authority was not verified. | Authoritative map persistence was not verified. | TBD. | Not verified / TBD |

## Failure and desynchronization cases

- A modified client can send arbitrary Socket.IO payloads; server validation must
  reject unauthorized or invalid effects.
- If local Phaser position diverges from server memory, the correction or
  rollback behavior for normal movement was not verified.
- If server memory is lost, connected-player state and some live world state may
  need reconstruction; complete recovery behavior was not verified.
- If a socket disconnects, observed world logic persists character position and
  removes connected-player memory.
- Resource gathering includes server-side checks for range, movement during
  gathering, resource state, and duplicate same-target gathering.
- Animal combat includes server-side range and cooldown checks in observed
  service logic.
- Replayed or duplicated admin commands may be risky; full duplicate-execution
  protection was not verified.
- Broad broadcasts can send irrelevant updates to unrelated clients and increase
  network and processing load as the world grows.
- Client-side map or collision edits must not be accepted as server truth.

## Known gaps

- Normal movement speed, elapsed-time, collision, blocked-zone, and
  forbidden-teleport validation were not verified.
- Authoritative server-side map, collision, mobility, and chunk data are still
  `TBD` or `Not verified`.
- Client correction or reconciliation after rejected movement was not verified.
- Crash recovery and resynchronization between server memory and PostgreSQL were
  not verified.
- Chunk-scoped, room-scoped, or zone-scoped real-time communication was not
  verified.
- Complete protection against duplicated critical admin operations was not
  verified.
- Specialized client, server, world, and security documents are still `Draft`.

## Boundary sequence diagram

```mermaid
sequenceDiagram
    participant User
    participant React
    participant Phaser
    participant Zustand
    participant Socket
    participant NestJS
    participant PostgreSQL

    User->>React: Open world route
    React->>Zustand: Load character state
    React->>Phaser: Create game and attach socket
    User->>Phaser: Keyboard or pointer input
    Phaser->>Phaser: Move or predict local player
    Phaser->>Socket: emit player_move
    Socket->>NestJS: player_move payload
    Note over NestJS: Basic handling observed; full speed, collision, and map validation not verified
    NestJS->>NestJS: Apply observed checks and update connected-player memory
    NestJS-->>Socket: broadcast player_moved
    NestJS->>PostgreSQL: Persist position on disconnect
```

## Non-goals

- This document does not define new architecture.
- This document does not prove that unverified validations exist.
- This document does not replace the code or security documentation.
- This document does not create an ADR.
- This document does not change runtime behavior.
- This document does not document every route, event, entity, or component.

## Security notes

- The client and admin interface are untrusted.
- The server must remain authoritative for security-sensitive gameplay
  decisions.
- Phaser, Zustand, client-side maps, and client-side tile properties are not
  server authority.
- No secret, credential, token, or real `.env` value is documented here.
- Future changes that alter trust boundaries may require an ADR.

## Performance notes

This document has no runtime impact.

Boundary-related performance risks include movement message frequency, broad
Socket.IO broadcasts, entity volume, gateway memory state, frequent persistence,
and future scalability by chunks, rooms, or zones. Chunk-scoped, room-scoped, or
zone-scoped communication was not verified as implemented.

## Related files

- [Documentation Index](../README.md)
- [Architecture Overview](overview.md)
- [Architecture Decisions](decisions.md)
- [ADR Process](adr/README.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Phaser World](../03_Client/phaser-world.md)
- [Zustand State](../03_Client/zustand-state.md)
- [Server WebSockets](../04_Server/websockets.md)
- [NestJS API Gateway](../04_Server/nestjs-api-gateway.md)
- [Maps and Collisions](../05_World/maps-and-collisions.md)
- [World Chunks](../05_World/chunks.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- What is the authoritative source for each gameplay and world-state domain?
- Which server-side movement validations are required before movement is
  accepted?
- How should server-side map and collision data be represented?
- How should client correction or reconciliation work after rejected movement?
- When should position be persisted, and which position is authoritative during
  reconnects?
- When should rooms, zones, or chunks be introduced for real-time communication?
- How should world state recover after a server restart?

## TODO

- [ ] Validate these boundaries with a human reviewer.
- [ ] Fill specialized client, server, world, and security documents.
- [ ] Create the first ADR only if a real architecture decision needs to be
  recorded.
- [ ] Verify mobility, map, collision, and movement authority in code.
- [ ] Move this document to `Review` when it is ready for validation.
