# Admin Permissions

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/02_Security/client-server-trust.md, docs/02_Security/authentication-jwt.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the admin permission behavior observed in the current
repository.

It covers:

- how admin rights are represented;
- how admin HTTP routes are protected;
- how admin Socket.IO events are checked;
- which admin commands exist in the client command registry;
- which payload validations are visible in code;
- which protections remain `Not verified`.

It does not create a new permission model.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: configured in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

The purpose of this document is to make admin permissions reviewable without
treating the browser UI as an authority.

Admin actions can change server-side state. Every admin route or event must
therefore be checked on the server, even when the official React interface hides
the control from non-admin users.

## Core admin security rule

The React admin interface is not trusted.

Displaying or hiding an admin button is not authorization. A role decoded in
the browser is not server proof. Every sensitive admin action must be
authorized on the server. Admin payloads are untrusted even when they come from
the official client.

Repeated admin commands can duplicate effects if idempotence is not guaranteed.
A timeout followed by a retry must be treated as a security and consistency
risk for commands that create, move, reset, or update server-side state.

## Admin trust boundary

| Component or data source | Trusted? | User-controlled? | Allowed responsibility | Forbidden authority | Status |
|---|---|---|---|---|---|
| React admin UI | No | Yes | Display admin panels, collect command text, show responses. | Authorize admin actions or prove admin identity. | `Implemented` |
| Client route guard or UI visibility | No | Yes | Hide or show admin controls based on a browser-decoded role. | Grant permission on the server. | `Implemented` |
| localStorage token | No | Yes | Store the bearer token used by client requests. | Protect the token from a compromised browser context. | `Implemented` |
| Decoded client role | No | Yes | Drive UI visibility in `CharacterLayout` and `ActionPanel`. | Prove role to NestJS or Socket.IO handlers. | `Implemented` |
| HTTP admin request | No | Yes | Send requests with an `Authorization` header. | Become authorized without server-side guards. | `Implemented` |
| Socket.IO admin event | No | Yes | Send an admin command payload to the server. | Become trusted without server-side role and payload checks. | `Implemented` |
| `RolesGuard` | Server-controlled | No direct user control | Compare required role metadata with `request.user.role`. | Replace payload validation or action-specific checks. | `Implemented` |
| `AdminGateway` | Server-controlled | No direct user control | Check `client.data.role` and route admin events to services. | Prove role provenance without guaranteed socket authentication order. | `Not verified` |
| Server services | Server-controlled | No direct user control | Read, update, and persist admin-targeted state through repositories. | Treat client payloads as valid without checks. | `Implemented` |
| PostgreSQL | Server-controlled persistence | No direct user control | Store users, roles, templates, spawns, creatures, and character positions. | Decide authorization by itself. | `Implemented` |

## Role model

| Role or permission source | Location | Used by | Server-verified? | Notes | Status |
|---|---|---|---|---|---|
| `UserRole.PLAYER` / `player` | `apps/api-gateway/src/users/entities/user.entity.ts` | Default user role in the `User` entity. | Yes, as persisted server-side role data. | The role enum contains only `player` and `admin`. | `Implemented` |
| `UserRole.ADMIN` / `admin` | `apps/api-gateway/src/users/entities/user.entity.ts` | `@Roles(UserRole.ADMIN)`, `RolesGuard`, JWT payload, and socket role checks. | Yes for HTTP guarded routes; `client.data.role` provenance for `AdminGateway` is `Not verified`. | The entity comment says switching to admin happens outside the API. | `Implemented` |
| JWT `role` claim | `AuthService.login` and `JwtStrategy.validate` | HTTP `request.user.role`; socket `client.data.role` when gateways populate it. | Yes for HTTP JWT validation; socket propagation into `AdminGateway` is `Not verified`. | Role-change invalidation for already issued JWTs is `Not verified`. | `Implemented` |
| Browser-decoded role | `CharacterLayout.jsx` and `ActionPanel.tsx` | Admin tab and admin console visibility. | No | Used only as client display logic in inspected code. | `Implemented` |

## HTTP admin permissions

| Route or area | Method | Guard or decorator observed | Role required | Server checks observed | Status |
|---|---|---|---|---|---|
| `/admin/overview` | `GET` | Class-level `JwtAuthGuard`, `RolesGuard`, and `@Roles(UserRole.ADMIN)` on `AdminController`. | `admin` | Authenticated JWT and required role through guards; service counts templates, spawns, and active creatures. | `Implemented` |
| `/admin/templates` | `GET` | Class-level `JwtAuthGuard`, `RolesGuard`, and `@Roles(UserRole.ADMIN)` on `AdminController`. | `admin` | Authenticated JWT and required role through guards; service returns templates ordered by name. | `Implemented` |
| `/admin/spawns` | `GET` | Class-level `JwtAuthGuard`, `RolesGuard`, and `@Roles(UserRole.ADMIN)` on `AdminController`. | `admin` | Authenticated JWT and required role through guards; service returns spawns with template relation. | `Implemented` |
| `/admin/templates/:key` | `PATCH` | Class-level `JwtAuthGuard`, `RolesGuard`, and `@Roles(UserRole.ADMIN)` on `AdminController`. | `admin` | Authenticated JWT and required role through guards; template key is used to find a template; missing template throws `NotFoundException`. Field whitelist equivalent to the socket template command is `Not verified`. | `Not verified` |
| `/item` write routes | `POST`, `PATCH`, `DELETE` | Controller-level `JwtAuthGuard`; method-level `RolesGuard` and `@Roles(UserRole.ADMIN)`. | `admin` | Authenticated JWT and required role for create, update, and delete item routes. | `Implemented` |

## WebSocket admin permissions

| Event | Gateway | Role check observed | Payload validation observed | Side effect | Gaps | Status |
|---|---|---|---|---|---|---|
| `admin:spawn` | `AdminGateway` | `client.data.role === 'admin'` | Requires `templateKey`, numeric `x`, numeric `y`; service returns null for unknown template. | Creates a spawn and an creature, then sends an update event. | Independent JWT authentication in `AdminGateway`, role provenance, idempotence, and rate limiting are `Not verified`. | `Not verified` |
| `admin:teleport` | `AdminGateway` | `client.data.role === 'admin'` | Requires `characterId`, numeric `x`, numeric `y`; resolves a connected player by id or name. | Updates a connected character position and persists rounded coordinates. | UUID validation, authorization beyond admin role, idempotence, and replay protection are `Not verified`. | `Not verified` |
| `admin:update_template` | `AdminGateway` | `client.data.role === 'admin'` | Requires `key` and `fields`; allows only listed numeric fields; rejects negative or non-numeric values; checks template existence. | Updates a template and sends a category update response. | Fine-grained permissions, audit, idempotence, and concurrent update handling are `Not verified`. | `Not verified` |
| `admin:move_creature` | `AdminGateway` | `client.data.role === 'admin'` | Requires `creatureId`, numeric `x`, numeric `y`; service rejects missing or dead creature. | Moves a live creature, persists rounded coordinates, and returns the moved creature data. | UUID validation, replay protection, idempotence, and rate limiting are `Not verified`. | `Not verified` |
| `admin:respawn_all` | `AdminGateway` | `client.data.role === 'admin'` | Requires `templateKey`; service counts matching live creatures. | Resets matching creatures for the template and persists state changes. | Mass-operation confirmation on the server, idempotence, rate limiting, and audit are `Not verified`. | `Not verified` |

For `AdminGateway`, no independent JWT `handleConnection` hook was observed.
The gateway depends on `client.data.role`. Guaranteed server-side provenance of
`client.data.role` is `Not verified`. Connection hook ordering is
`Not verified`.

## Admin command registry

| Command | Transport | Target | Main effect | Persistence impact | Broadcast or response | Status |
|---|---|---|---|---|---|---|
| `/spawn <template> [x] [y]` | Socket.IO `admin:spawn` | Template key and coordinates. | Creates an admin spawn at a resolved position. | Persists a spawn row and an creature row through the service. | Acknowledgement result and update event from the server. | `Implemented` |
| `/tp [id] <x> <y>` | Socket.IO `admin:teleport` or `admin:move_creature` | Player id/name or selected creature. | Teleports a connected player or moves a live creature. | Persists character position for player teleport; persists creature coordinates for creature move. | Acknowledgement result and server update to affected clients. | `Implemented` |
| `/sethp <template> <value>` | Socket.IO `admin:update_template` | Template key. | Updates `baseHealth`. | Persists template field update. | Acknowledgement result and category update event. | `Implemented` |
| `/aggro <template> <radius>` | Socket.IO `admin:update_template` | Template key. | Updates `aggroRadius`. | Persists template field update. | Acknowledgement result and category update event. | `Implemented` |
| `/respawn all <template>` | Socket.IO `admin:respawn_all` | Template key. | Forces matching live creatures back to their spawn state. | Persists affected creature state and coordinates. | Acknowledgement result and service update events. | `Implemented` |
| `/decor <sprite> [x] [y]` | None observed | Client command text only. | Returns a not-implemented result. | None observed. | Local command response. | `TBD` |
| `/help [command]` | None observed | Command registry metadata. | Shows command usage. | None observed. | Local command response. | `Implemented` |

## Payload validation

| Input category | Source | Validation observed | Missing or unverified validation | Status |
|---|---|---|---|---|
| UUID | `creatureId`, `characterId`, item ids, and entity ids. | Required as non-empty values in some admin socket handlers; some ids are resolved by service lookups. | Formal UUID validation is `Not verified`. | `Not verified` |
| Coordinates | Admin spawn, teleport, and creature move commands. | Server checks `typeof x === 'number'` and `typeof y === 'number`; services round before persistence. | Bounds, allowed destination, and extreme-value handling are `Not verified`. | `Not verified` |
| Template | Template key in HTTP and socket admin paths. | Required key; service checks existence for update and spawn paths; command registry can compare against loaded template keys. | Server-side format constraints and rate limiting by template are `Not verified`. | `Not verified` |
| Spawn data | `admin:spawn`. | Requires template key and numeric coordinates; service creates a generated spawn key. | Idempotency key, duplicate prevention, and quota checks are `Not verified`. | `Not verified` |
| Creature id | `admin:move_creature`. | Requires non-empty `creatureId`; service checks live creature presence and rejects dead creatures. | UUID validation and authorization by target are `Not verified`. | `Not verified` |
| Character id | `admin:teleport`. | Requires non-empty value; server resolves by connected player id or name. | UUID-only enforcement, offline target handling, and destination policy are `Not verified`. | `Not verified` |
| Role | HTTP `request.user.role`; socket `client.data.role`. | HTTP role is checked by `RolesGuard`; socket role is compared with `admin`. | `AdminGateway` role provenance and connection ordering are `Not verified`. | `Not verified` |
| Free-form fields | HTTP `PATCH /admin/templates/:key` and socket template update fields. | Socket template update uses an allowed-field list and numeric non-negative checks. | Equivalent HTTP field whitelist is `Not verified`; complete DTO validation is `Not verified`. | `Not verified` |

## Client admin interface

Implemented:

- `CharacterLayout.jsx` reads the token from `localStorage`.
- `CharacterLayout.jsx` decodes the JWT payload in the browser and shows the
  admin tab when `role` equals `admin`.
- `ActionPanel.tsx` also decodes the JWT payload in the browser and displays an
  admin console when `role` equals `admin`.
- `AdminPanel.tsx` fetches `/admin/overview` and `/admin/templates` with
  `Authorization: Bearer <token>`.
- `AdminPanel.tsx` and `ActionPanel.tsx` parse command text and execute entries
  from the same command registry.
- Admin socket actions use acknowledgement callbacks with a client-side timeout
  of `5000` ms.
- The admin store keeps command history and avoids adding the same command twice
  in a row to local history.

Not verified:

- Any client-side admin visibility as a security control.
- Client-side retry safety after acknowledgement timeout.
- Server-side deduplication based on command history.

## Authorization versus visibility

Implemented:

- Admin UI visibility is based on a browser-decoded JWT role.
- HTTP admin routes use server-side guards.
- Socket admin events check a server-side socket data field.

Not verified:

- That `client.data.role` is always populated by trusted socket authentication
  before `AdminGateway` handles events.
- That an already connected socket is invalidated after role changes.
- That a stolen admin token can be revoked before token expiration.

The admin UI can help a legitimate admin discover available actions, but it is
not a permission boundary.

## Repeated execution and idempotence

Implemented:

- Client admin socket calls use acknowledgement callbacks.
- Client admin socket calls resolve as timeout failures after `5000` ms.
- The local admin command history avoids storing the same immediately previous
  command twice.

Not verified:

- Idempotence of `admin:spawn`.
- Idempotence of `admin:teleport`.
- Idempotence of `admin:update_template`.
- Idempotence of `admin:move_creature`.
- Idempotence of `admin:respawn_all`.
- Server-side deduplication keys.
- Retry protection after client timeout.
- Replay protection.
- Rate limiting.
- Spam protection.

## Logging and audit

Implemented:

- Admin socket handlers return success or failure messages to the caller.
- `AdminController.updateTemplate` throws `NotFoundException` when a template
  key is missing.
- The client displays recent command responses.

Not verified:

- Structured audit log for admin actions.
- Complete server-side logging of admin actor, target, payload, and result.
- Tamper-resistant audit storage.
- Admin failure monitoring.
- Traceability for repeated or destructive commands.

## Security risks

| Risk | Attack path | Existing protection observed | Missing or unverified protection | Status |
|---|---|---|---|---|
| Non-admin user displays admin UI | User modifies client code or local state to show admin controls. | HTTP admin routes use server-side guards; socket handlers check `client.data.role`. | UI visibility is not authorization; socket role provenance remains `Not verified`. | `Not verified` |
| Client-side role modification | User edits decoded token display logic or local variables. | HTTP role comes from validated JWT payload; socket handlers check server-side socket data. | Role-change invalidation and `AdminGateway` role provenance are `Not verified`. | `Not verified` |
| Fabricated admin Socket.IO event | User emits `admin:*` directly from a modified client. | Observed admin socket handlers check `client.data.role === 'admin'`. | Independent `AdminGateway` authentication and connection ordering are `Not verified`. | `Not verified` |
| `client.data.role` not initialized by guaranteed auth | Admin event reaches `AdminGateway` before trusted role population. | Other observed gateways populate `client.data.role` after JWT auth. | Guaranteed ordering and independent admin socket auth are `Not verified`. | `Not verified` |
| Repeated admin command | User or client resends the same command. | Some commands validate required fields and target existence. | Idempotence, deduplication, rate limiting, and replay protection are `Not verified`. | `Not verified` |
| Timeout followed by retry | Client times out after `5000` ms and user retries a command that may still complete server-side. | Client returns a timeout result locally. | Server-side idempotency key or retry-safe response handling is `Not verified`. | `Not verified` |
| Malformed payload | User sends missing or wrong-type fields. | Socket handlers check required fields for observed admin events; HTTP global validation is configured. | Complete DTO validation for every admin payload is `Not verified`. | `Not verified` |
| Mass spawn | User repeats `admin:spawn` many times. | Template existence is checked. | Quotas, rate limiting, deduplication, and abuse monitoring are `Not verified`. | `Not verified` |
| Unauthorized teleport | Non-admin or forged event attempts `admin:teleport`. | Socket handler checks `client.data.role === 'admin'`; target must resolve to a connected player. | `AdminGateway` role provenance and destination policy are `Not verified`. | `Not verified` |
| No audit | Admin action changes state without durable traceability. | User-facing command result is returned. | Structured audit and complete action logging are `Not verified`. | `Not verified` |
| Stolen admin token | Attacker uses a valid admin bearer token. | HTTP JWT validation and socket JWT validation in other gateways are observed. | Token revocation, forced logout, and already-connected admin session revocation are `Not verified`. | `Not verified` |

## Verified protections

Implemented:

- `UserRole` defines `player` and `admin`.
- Users have a persisted `role` column with default `player`.
- HTTP admin routes use `JwtAuthGuard`.
- HTTP admin routes use `RolesGuard`.
- HTTP admin routes use `@Roles(UserRole.ADMIN)`.
- `RolesGuard` compares required roles with `request.user.role`.
- Item write routes require admin role.
- Observed admin socket handlers check `client.data.role === 'admin'`.
- Observed admin socket handlers reject missing required payload fields.
- Observed coordinate payloads require numeric `x` and `y`.
- Socket template updates use an allowed-field list and numeric non-negative
  checks.
- Admin services return null or failure results for missing templates, missing
  connected players, or missing/dead creatures in observed paths.

## Known gaps

Not verified:

- Independent authentication of `AdminGateway`.
- Guaranteed provenance of `client.data.role`.
- Connection hook ordering.
- Idempotence of admin commands.
- Deduplication.
- Rate limiting.
- Structured audit.
- Complete logging of admin actions.
- Replay protection.
- Spam protection.
- Complete validation of all admin payloads.
- Fine-grained admin permissions by action.
- Revocation of an already connected admin session.
- HTTP admin template field whitelist equivalent to the socket whitelist.
- UUID validation for admin ids.
- Server-side confirmation for mass operations.

## Security checklist

- [ ] Admin UI visibility is not treated as authorization.
- [ ] Admin HTTP routes require server-side authentication.
- [ ] Admin HTTP routes require server-side authorization.
- [ ] Admin Socket.IO events check server-side role or permission.
- [ ] Admin payloads are validated server-side.
- [ ] Admin actions are safe against replay or duplication.
- [ ] Admin retries after timeout cannot duplicate critical effects.
- [ ] Admin actions are logged or audited when needed.
- [ ] Admin tokens are treated as sensitive.
- [ ] Admin permissions are reviewed before moving to `Review`.

## Non-goals

- This document does not define a new admin permission system.
- This document does not document full JWT authentication behavior outside
  admin permission checks.
- This document does not document real secrets, tokens, passwords, or hashes.
- This document does not prove that admin commands are safe under abuse.
- This document does not replace code review or human validation.

## Security notes

- Admin tokens must be treated as sensitive bearer credentials.
- Browser-decoded roles must remain display hints only.
- Socket admin authorization must not rely on client UI visibility.
- Any future admin command should define payload validation, authorization,
  idempotence expectations, and audit needs before it is treated as ready.
- `AdminGateway` role provenance should be reviewed before relying on it as a
  complete authorization boundary.

## Performance notes

- Admin overview performs count queries through `AdminService`.
- Admin template and spawn list routes read repository data directly.
- Admin socket commands can trigger persistent writes.
- No admin-specific rate limiting or throughput control was found.
- No admin command performance benchmark was found.

## Related files

- [Documentation Index](../README.md)
- [Client Server Trust](client-server-trust.md)
- [Authentication JWT](authentication-jwt.md)
- [Architecture Overview](../01_Architecture/overview.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Realtime Socket.IO](../01_Architecture/realtime-socketio.md)
- [NestJS API Gateway](../04_Server/nestjs-api-gateway.md)
- [Server WebSockets](../04_Server/websockets.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should `AdminGateway` authenticate JWTs independently in its own connection
  hook?
- Should admin permissions be split by action instead of using only the
  `admin` role?
- Should admin commands require idempotency keys?
- Should admin commands have rate limits?
- Should mass operations require server-side confirmation?
- Should admin actions write a structured audit record?
- Should role changes revoke already connected admin sockets?
- Should HTTP template updates use the same allowed-field list as socket
  template updates?

## TODO

- [ ] Validate this document with the project owner.
- [ ] Review all admin HTTP routes against the current code.
- [ ] Review all admin Socket.IO events against the current code.
- [ ] Audit `AdminGateway` authentication and `client.data.role` provenance.
- [ ] Audit idempotence and replay protection for admin commands.
- [ ] Audit admin logging and traceability.
- [ ] Move this document to `Review` only after human validation.
