# Admin Tool

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/02_Security/admin-permissions.md, docs/03_Client/react-vite.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the admin tool observed in the React client and NestJS API gateway.

It covers the admin React panel, admin command console, admin HTTP reads and patches, admin Socket.IO events, server-side role checks, payload validation visible in code, repeated execution risks, and known gaps.

It does not define a new permission model or a new moderation workflow.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: configured in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

The admin tool gives an authenticated administrator a React interface and command console for inspecting and changing world state during development.

The observed tool can display overview data, creatures, resources, and characters; update selected fields; spawn creatures and resources; teleport characters; move animals; delete animals or resources; and force creature respawn by template.

The admin UI is not a security boundary. Server-side HTTP guards and Socket.IO role checks are the relevant authorization mechanisms observed in code.

## Admin tool overview

The client-side admin tool is implemented through `CharacterLayout`, `AdminPanel`, `ActionPanel`, the admin Zustand store, and Phaser admin command helpers.

The admin tab is shown when the browser decodes a JWT role equal to `admin`. The same browser-decoded role controls the admin console inside the action panel. This is display logic only and must not be treated as authorization.

The server-side admin surface is split between HTTP routes under `/admin/*` and Socket.IO events named `admin:*`. HTTP routes are protected by `JwtAuthGuard`, `RolesGuard`, and `@Roles(UserRole.ADMIN)` on `AdminController`. Observed admin socket handlers check `client.data.role !== 'admin'` before running their action.

## Entry points

| Entry point | File or route | Responsibility | Access control observed | Status |
| --- | --- | --- | --- | --- |
| Admin tab | `apps/client/src/components/CharacterLayout/CharacterLayout.jsx` | Displays the `Admin` tab and mounts `AdminPanel`. | Browser-decoded JWT role controls visibility only. | Implemented |
| Admin panel | `apps/client/src/components/AdminPanel/AdminPanel.tsx` | Loads admin data, displays grouped sections, runs commands, applies edits, and handles drag-to-map actions. | Uses bearer token for HTTP fetches and current socket for admin events; visibility depends on parent UI. | Implemented |
| Action panel admin console | `apps/client/src/components/ActionPanel/ActionPanel.tsx` | Runs admin commands against the selected world target and exposes delete action for non-player targets. | Browser-decoded JWT role controls visibility only; server checks are required. | Implemented |
| Admin command registry | `apps/client/src/phaser/admin/commandRegistry.ts` | Defines command syntax and maps commands to admin action helpers. | Client-side validation and routing only. | Implemented |
| Admin HTTP controller | `/admin/*` in `apps/api-gateway/src/admin/admin.controller.ts` | Exposes overview, templates, spawns, animals, characters, resources, and resource templates. | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)`. | Implemented |
| Admin Socket.IO gateway | `apps/api-gateway/src/admin/admin.gateway.ts` | Handles `admin:*` world mutations and broadcasts updates. | Each observed handler checks `client.data.role === 'admin'`; independent gateway authentication is Not verified. | Not verified |

## UI responsibilities

- Display an admin tab inside the character layout when the decoded browser token has role `admin`.
- Display an admin command console in the admin panel and action panel.
- Parse commands beginning with `/`.
- Provide command history with arrow-key navigation.
- Provide command autocomplete with Tab.
- Disable Phaser global keyboard capture while admin inputs are focused.
- Fetch overview, creature templates, animals, resource templates, resources, and characters through HTTP.
- Display grouped creature and resource sections with editable group and instance fields.
- Display a flat player section.
- Filter sections by name and paginate section lists.
- Track dirty fields and show an apply button before sending updates.
- Drag creature, resource, or player handles to the map to spawn or teleport through Socket.IO.
- Show recent success or error command results.
- Delete animal and resource instances through admin Socket.IO events.

## HTTP admin interactions

| Interaction | Client source | HTTP route | Server guard observed | Status |
| --- | --- | --- | --- | --- |
| Load overview | `AdminPanel.tsx` | `GET /admin/overview` | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Implemented |
| Load creature templates | `AdminPanel.tsx` | `GET /admin/templates` | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Implemented |
| Load creature spawns | Not used by current `AdminPanel`; route exists | `GET /admin/spawns` | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Implemented |
| Load live animals | `AdminPanel.tsx` | `GET /admin/animals` | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Implemented |
| Patch creature template | `admin.actions.ts`; controller route exists | `PATCH /admin/templates/:key` | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Implemented |
| Load characters | `AdminPanel.tsx` | `GET /admin/characters` | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Implemented |
| Patch character | Controller route exists | `PATCH /admin/characters/:id` | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Implemented |
| Load resource templates | `AdminPanel.tsx` | `GET /admin/resource-templates` | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Implemented |
| Load resources | `AdminPanel.tsx` | `GET /admin/resources` | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Implemented |
| Patch resource | Controller route exists | `PATCH /admin/resources/:id` | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Implemented |

## Socket.IO admin interactions

| Event | Client source | Server gateway | Role check observed | Side effect | Status |
| --- | --- | --- | --- | --- | --- |
| `admin:spawn` | `commandRegistry.ts`, `AdminPanel.tsx` drag | `AdminGateway.onSpawn` | `client.data.role === 'admin'` | Creates an admin creature spawn and animal, then emits `animal_update`. | Implemented |
| `admin:spawn_resource` | `AdminPanel.tsx` drag | `AdminGateway.onSpawnResource` | `client.data.role === 'admin'` | Creates a resource and emits `resource_update`. | Implemented |
| `admin:teleport` | `commandRegistry.ts`, `AdminPanel.tsx` drag and teleport buttons | `AdminGateway.onTeleport` | `client.data.role === 'admin'` | Resolves a connected character by name or id and teleports it. | Implemented |
| `admin:move_animal` | `commandRegistry.ts` | `AdminGateway.onMoveAnimal` | `client.data.role === 'admin'` | Moves a live animal through `AnimalsService`. | Implemented |
| `admin:update_template` | `commandRegistry.ts`, `AdminPanel.tsx` | `AdminGateway.onUpdateTemplate` | `client.data.role === 'admin'` | Updates creature template fields, refreshes in-memory animal template data, emits `category:updated`. | Implemented |
| `admin:update_resource_template` | `AdminPanel.tsx` | `AdminGateway.onUpdateResourceTemplate` | `client.data.role === 'admin'` | Updates resource template defaults. | Implemented |
| `admin:update_character` | `AdminPanel.tsx` | `AdminGateway.onUpdateCharacter` | `client.data.role === 'admin'` | Updates editable character numeric fields. | Implemented |
| `admin:update_resource` | `AdminPanel.tsx` | `AdminGateway.onUpdateResource` | `client.data.role === 'admin'` | Updates resource state, position, or loot count and emits `resource_update`. | Implemented |
| `admin:update_animal` | `AdminPanel.tsx` | `AdminGateway.onUpdateAnimal` | `client.data.role === 'admin'` | Updates animal state, health, or coordinates. | Implemented |
| `admin:delete_animal` | `AdminPanel.tsx`, `ActionPanel.tsx` | `AdminGateway.onDeleteAnimal` | `client.data.role === 'admin'` | Deletes an animal through `AnimalsService` and emits a dead `animal_update`. | Implemented |
| `admin:delete_resource` | `AdminPanel.tsx`, `ActionPanel.tsx` | `AdminGateway.onDeleteResource` | `client.data.role === 'admin'` | Deletes a resource and emits `resource_update` with deletion marker. | Implemented |
| `admin:respawn_all` | `commandRegistry.ts` | `AdminGateway.onRespawnAll` | `client.data.role === 'admin'` | Forces all matching animals for a template back to spawn state. | Implemented |

## Available admin actions

| Action | Transport | Target | Main effect | Risk if repeated | Status |
| --- | --- | --- | --- | --- | --- |
| View overview | HTTP | Admin dashboard counters | Reads template, spawn, and active animal counts. | Low; read-only. | Implemented |
| View creatures | HTTP | Creature templates and animal instances | Reads editable creature data. | Low; read-only. | Implemented |
| View resources | HTTP | Resource templates and resource instances | Reads editable resource data. | Low; read-only. | Implemented |
| View players | HTTP | Character list | Reads editable character data. | Low; read-only. | Implemented |
| `/spawn <template> [x] [y]` | Socket.IO | Creature template and coordinates | Creates a new admin creature spawn and animal. | May create duplicate spawns or animals; idempotence is Not verified. | Implemented |
| Drag creature group to map | Socket.IO | Creature template and drop coordinates | Creates a new creature spawn and animal. | May create duplicate spawns or animals; idempotence is Not verified. | Implemented |
| Drag resource group to map | Socket.IO | Resource type and drop coordinates | Creates a new resource instance. | May create duplicate resources; idempotence is Not verified. | Implemented |
| Drag player to map | Socket.IO | Character and drop coordinates | Teleports a character. | Repeated movement may overwrite intended position. | Implemented |
| `/tp [id] <x> <y>` | Socket.IO | Player id/name or selected animal | Teleports a connected player or moves a selected animal. | Repeated command can move the target repeatedly; destination bounds are Not verified. | Implemented |
| `/sethp <template> <value>` | Socket.IO | Creature template | Updates `baseHealth`. | Repeated updates overwrite template value; audit is Not verified. | Implemented |
| `/aggro <template> <radius>` | Socket.IO | Creature template | Updates `aggroRadius`. | Repeated updates overwrite template value; audit is Not verified. | Implemented |
| `/respawn all <template>` | Socket.IO | Animals for one template | Resets matching animals to spawn state. | Mass-operation idempotence and replay protection are Not verified. | Implemented |
| Apply creature template fields | Socket.IO | Creature template | Updates allowed numeric template fields. | Repeated updates overwrite template values. | Implemented |
| Apply animal instance fields | Socket.IO | Animal instance | Updates state, health, x, or y. | Repeated updates overwrite instance values. | Implemented |
| Apply resource template fields | Socket.IO | Resource template | Updates default remaining loots. | Repeated updates overwrite template values. | Implemented |
| Apply resource instance fields | Socket.IO | Resource instance | Updates state, x, y, or remaining loots. | Repeated updates overwrite instance values. | Implemented |
| Apply player fields | Socket.IO | Character | Updates level, health, maxHealth, attack, or defense. | Repeated updates overwrite character values. | Implemented |
| Delete animal | Socket.IO | Animal instance | Deletes animal and emits dead update. | Repeated delete becomes target-missing behavior; audit is Not verified. | Implemented |
| Delete resource | Socket.IO | Resource instance | Deletes resource and emits deleted resource update. | Repeated delete becomes target-missing behavior; audit is Not verified. | Implemented |
| `/decor <sprite> [x] [y]` | None observed | Decoration sprite | Returns a client-side not-implemented result. | No server effect observed. | TBD |
| `/help [command]` | Local command registry | Command metadata | Displays command help. | Low; local read-only. | Implemented |

## Data displayed

- Overview counters: templates, spawns, active animals.
- Creature groups: template name and editable creature template fields.
- Creature instances: id fragment, state badge, health, x, and y.
- Resource groups: resource type and default remaining loots.
- Resource instances: id fragment, state badge, x, y, and remaining loots.
- Player entries: name, level, health, maxHealth, attack, defense, and teleport position when available.
- Recent admin command results, limited to the latest five lines in the observed panel code.

## Server-side authorization

HTTP admin routes are protected at controller level with `JwtAuthGuard`, `RolesGuard`, and `@Roles(UserRole.ADMIN)`.

Observed admin Socket.IO handlers check `client.data.role === 'admin'` before performing their action. Independent authentication in `AdminGateway`, guaranteed socket authentication ordering, and provenance of `client.data.role` are Not verified.

The React admin UI is untrusted. Hiding or showing an admin button is not authorization. A client-side role is not server proof. All admin actions must be server-validated.

## Payload validation

Observed Socket.IO payload checks include required ids or keys, numeric coordinate checks, allowed-field lists for template, character, resource, and animal updates, and allowed state values for animal and resource state changes.

HTTP patch routes accept `Record<string, number>` bodies at controller level. Complete runtime DTO validation, allowed-field parity with socket handlers, numeric bounds, coordinate bounds, UUID validation, and malformed body handling are Not verified for all HTTP admin patches.

## Repeated execution risks

Admin socket calls use acknowledgement callbacks with a client-side timeout of `5000` ms. If the client times out and the admin retries, the original command may still have completed on the server.

Repeated admin command may duplicate effect if idempotence is not verified. This is especially relevant for spawn, spawn resource, delete, teleport, update, and respawn commands.

Not verified:

- Idempotence.
- Deduplication.
- Retry-safe command ids.
- Replay protection.
- Rate limiting.
- Spam protection.
- Server-side confirmation for mass actions.

## Error handling

The admin panel catches failed HTTP loading and displays a generic admin data loading error. Command execution displays recent success or error messages from client validation or server acknowledgements.

The server returns structured `{ success, message, data? }` results for observed admin socket handlers. HTTP controller methods throw `NotFoundException` for missing patch targets.

Uniform error shape across HTTP and Socket.IO, structured server logging, and complete admin failure monitoring are Not verified.

## Security boundaries

- The React admin UI is untrusted.
- Hiding or showing a button does not authorize an action.
- A client role decoded in the browser is not server proof.
- Bearer tokens in browser storage must be treated as sensitive credentials.
- Every admin HTTP route must stay protected by server-side authentication and authorization.
- Every admin Socket.IO event must validate role and payload server-side.
- Admin payloads are untrusted even when sent by the official client.
- Repeated admin commands can duplicate effects when idempotence is Not verified.
- Full audit, fine-grained permissions per action, and revocation of an already connected admin session are Not verified.

## Performance considerations

The admin panel fetches several admin datasets on mount. Grouped sections paginate display to 20 groups per page, but server-side pagination is Not verified.

Admin Socket.IO broadcasts observed in gateway code use `server.emit` for world updates. Room- or zone-scoped admin broadcasts are Not verified.

Large worlds, large character lists, high-frequency admin operations, and repeated drag/drop actions should be reviewed before production use.

## Verified behavior

- The admin tab is mounted from `CharacterLayout` when the decoded browser role is `admin`.
- `AdminPanel` fetches `/admin/overview`, `/admin/animals`, `/admin/templates`, `/admin/resource-templates`, `/admin/resources`, and `/admin/characters`.
- `AdminPanel` subscribes to `animal_update` and `resource_update`.
- `ActionPanel` exposes an admin console and delete action when the decoded browser role is `admin`.
- Admin command parsing supports `/command arg --flag=value`.
- Commands `spawn`, `tp`, `sethp`, `aggro`, `respawn`, `decor`, and `help` are registered.
- HTTP admin routes are guarded by JWT and admin role checks.
- Observed admin socket handlers check `client.data.role === 'admin'`.
- Observed admin socket handlers validate required payload fields before service calls.
- No real secret, token, password, or hash is documented here.

## Known gaps

- Full audit: Not verified.
- Complete traceability: Not verified.
- Idempotence: Not verified.
- Deduplication: Not verified.
- Rate limiting: Not verified.
- Replay protection: Not verified.
- Complete payload validation: Not verified.
- Complete HTTP admin DTO validation: Not verified.
- Fine-grained permissions per action: Not verified.
- Revocation of connected admin session: Not verified.
- Independent `AdminGateway` authentication: Not verified.
- Server-side pagination for admin datasets: Not verified.
- Admin UI tests: Not verified.
- Production readiness: Not verified.

## Review checklist

- [ ] Admin UI visibility is not treated as authorization.
- [ ] Every `/admin/*` route remains guarded by JWT and admin role checks.
- [ ] Every `admin:*` event validates server-side role before side effects.
- [ ] Every admin payload has server-side validation.
- [ ] Repeated commands are reviewed for idempotence or duplication risk.
- [ ] Destructive actions have appropriate confirmation and audit strategy.
- [ ] Admin data lists are reviewed for production-scale pagination.
- [ ] No real secrets, tokens, passwords, or hashes are documented.

## Non-goals

- This document does not define a production moderation policy.
- This document does not define new admin permissions.
- This document does not replace server-side tests.
- This document does not document real credentials.
- This document does not document unrelated gameplay systems.

## Security notes

Keep this document limited to verified mechanisms, route names, event names, and variable names. Do not add real credentials, JWT values, password examples, password hashes, or copied environment files.

Before moving this document out of Draft, verify admin socket authentication provenance, audit logging, action-specific payload validation, and retry behavior for mutating admin commands.

## Performance notes

The current admin tool is suitable for a development-facing control surface as observed. Production use would need review of server-side pagination, broadcast scope, bulk actions, rate limiting, and audit storage.

## Related files

- [Documentation Index](../README.md)
- [Admin Permissions](../02_Security/admin-permissions.md)
- [Authentication JWT](../02_Security/authentication-jwt.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [React Vite](../03_Client/react-vite.md)
- [Phaser World](../03_Client/phaser-world.md)
- [Zustand State](../03_Client/zustand-state.md)
- [NestJS API Gateway](../04_Server/nestjs-api-gateway.md)
- [Server WebSockets](../04_Server/websockets.md)
- [Server Modules](../04_Server/modules.md)
- [TypeORM](../04_Server/typeorm.md)
- [PostgreSQL](../06_Database/postgresql.md)
- [Database Schema](../06_Database/schema.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should `AdminGateway` perform independent JWT authentication instead of relying on previously populated socket data?
- Should admin actions have durable audit records with actor, target, payload summary, and result?
- Should mutating admin commands use idempotency keys?
- Should HTTP admin patch routes use DTOs with the same allowed-field rules as socket handlers?
- Should admin lists be server-paginated before production use?
- Should connected admin sockets be revoked when an admin role changes?

## TODO

- [ ] Verify admin socket authentication provenance and connection ordering.
- [ ] Add or verify structured audit logging for admin actions.
- [ ] Add or verify idempotence and deduplication for repeated mutating commands.
- [ ] Add or verify rate limiting and replay protection for admin events.
- [ ] Add or verify DTO validation for HTTP admin patch routes.
- [ ] Add or verify admin UI tests.
- [ ] Review server-side pagination for admin datasets.
