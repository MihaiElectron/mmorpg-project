# Authentication JWT

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/02_Security/client-server-trust.md, docs/01_Architecture/realtime-socketio.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the JWT authentication behavior observed in the current
repository.

It covers:

- public authentication routes;
- password hashing and password comparison;
- JWT creation, configuration, claims, and validation;
- HTTP guards and role guards;
- client token storage and transport;
- Socket.IO JWT authentication;
- observed token lifecycle behavior;
- security gaps that were not verified in the inspected code.

It does not define new authentication behavior.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: configured in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

The purpose of this document is to give a repository-faithful reference for JWT
authentication.

The document distinguishes authentication from authorization. A valid JWT proves
that a request or socket presented a token accepted by the server. It does not
prove that every action made with that token is authorized.

## Authentication flow overview

Implemented:

- A browser user can register through `POST /auth/register`.
- A browser user can log in through `POST /auth/login`.
- Registration accepts `RegisterUserDto`.
- Login accepts `LoginUserDto`.
- Login returns an object containing `access_token`.
- The client stores the returned token with
  `localStorage.setItem("token", data.access_token)`.
- HTTP calls that need authentication read the token with
  `localStorage.getItem("token")` and send `Authorization: Bearer <token>`.
- The world page creates a Socket.IO client with `auth: { token }`.
- Logout removes the browser token with `localStorage.removeItem("token")`.

Not verified:

- Server-side session storage.
- Refresh token flow.
- JWT revocation.
- Forced logout.
- Multi-factor authentication.
- Authentication audit trail.

## Public authentication routes

| Route | Method | Controller | Input DTO | Server checks observed | Response summary | Status |
|---|---|---|---|---|---|---|
| `/auth/register` | `POST` | `AuthController.register` | `RegisterUserDto` | `username` string, `password` string, password minimum length 6 through DTO validation; duplicate username check in `AuthService.register`; password hashed with bcrypt cost `10`; `isActive` set to `true`. | Returns the saved user entity from `userRepository.save(user)`. Excluding the password hash from this response is `Not verified`. | `Implemented` |
| `/auth/login` | `POST` | `AuthController.login` | `LoginUserDto` | `username` string and `password` string through DTO validation; user lookup by username; active-account check; bcrypt password comparison. | Returns `{ access_token }` when credentials are valid. | `Implemented` |

## Password handling

Implemented:

- `RegisterUserDto` requires `username` to be a string.
- `RegisterUserDto` requires `password` to be a string with minimum length `6`.
- `LoginUserDto` requires `username` to be a string.
- `LoginUserDto` requires `password` to be a string.
- `AuthService.register` hashes the submitted password with bcrypt cost `10`.
- `AuthService.login` compares the submitted password with the stored hash by
  using bcrypt comparison.
- The `User` entity stores a `password` column described in code as hashed with
  bcrypt.

Not verified:

- Password complexity rules beyond minimum length.
- Password reuse prevention.
- Password-change flow.
- Password-change invalidation of existing JWTs.
- Response filtering that removes the password hash from registration output.

## JWT generation

Implemented:

- `AuthModule` configures `JwtModule` with the secret name `JWT_SECRET`.
- `AuthModule` configures `signOptions: { expiresIn: '1h' }`.
- `AuthService.login` signs a payload containing `sub`, `username`, and `role`.
- The returned response field is `access_token`.

| Claim or field | Source | Purpose | Exposed to client? | Status |
|---|---|---|---|---|
| `access_token` | `AuthService.login` response | Carries the signed JWT to the client after login. | Yes | `Implemented` |
| `sub` | `user.id` | Identifies the authenticated user. | Yes, inside the JWT payload. | `Implemented` |
| `username` | `user.username` | Carries the username in the signed payload. | Yes, inside the JWT payload. | `Implemented` |
| `role` | `user.role` | Carries the application role used by HTTP role guards and socket role checks. | Yes, inside the JWT payload. | `Implemented` |
| `JWT_SECRET` | Configuration name read by `ConfigService` | Signing and verification secret. Real value must not be documented. | No | `Configured` |
| Expiration `1h` | `JwtModule` sign options in `AuthModule` | Limits JWT lifetime for tokens signed by that module. | Yes, as JWT expiration metadata. | `Configured` |

Not verified:

- Secret strength.
- Secret rotation.
- Per-user signing versions.
- Token identifier claim.
- Refresh-token pair generation.

## JWT validation on HTTP

Implemented:

- `JwtStrategy` extracts bearer tokens from the HTTP `Authorization` header.
- `JwtStrategy` uses the secret name `JWT_SECRET`.
- `JwtStrategy` sets `ignoreExpiration: false`.
- `JwtStrategy.validate` returns `userId`, `username`, and `role` for
  `request.user`.
- `JwtAuthGuard` extends Passport `AuthGuard('jwt')`.

| Protected area | Guard observed | User context used | Ownership check observed | Status |
|---|---|---|---|---|
| `CharacterController` under `/characters` | Class-level `JwtAuthGuard` | `req.user.userId` | Character create/list/current/read/delete and equip/unequip call service methods with authenticated user id. | `Implemented` |
| `InventoryController` under `/inventory` | Class-level `JwtAuthGuard` | No `request.user` usage observed in controller methods. | Not proven by the inspected controller path; methods accept `characterId` from body or route parameters. | `Not verified` |
| `ItemController` under `/item` | Class-level `JwtAuthGuard`; method-level `RolesGuard` for write routes | `request.user.role` through `RolesGuard` for admin-only writes. | Item catalog ownership is not applicable in the observed controller. | `Implemented` |
| `AdminController` under `/admin` | Class-level `JwtAuthGuard` and `RolesGuard` with `@Roles(UserRole.ADMIN)` | `request.user.role` | Admin role check observed; per-operation ownership is not the relevant model for the inspected admin endpoints. | `Implemented` |

Not verified:

- Complete ownership coverage for every inventory operation.
- Full consistency of HTTP error response shape across all protected endpoints.
- JWT revocation checks during HTTP validation.
- Rechecking the database user state during every JWT validation.

## Authorization and roles

Implemented:

- The `UserRole` enum contains `player` and `admin`.
- The `User` entity has a `role` column with default `player`.
- `AuthService.login` includes `role` in the JWT payload.
- `JwtStrategy.validate` exposes `role` on `request.user`.
- `@Roles` stores required roles as route metadata.
- `RolesGuard` reads required role metadata and compares it with
  `request.user.role`.
- `AdminController` requires `JwtAuthGuard`, `RolesGuard`, and
  `@Roles(UserRole.ADMIN)`.
- Item create, update, and delete routes require `RolesGuard` and
  `@Roles(UserRole.ADMIN)` after the controller-level JWT guard.

Not verified:

- Permission model beyond a single role value.
- Role-change invalidation for already issued JWTs.
- Server-side guarantee that a browser-decoded role is never used as
  authorization.
- Centralized audit of admin actions.

## JWT usage on the client

Implemented:

- `LoginPage.jsx` stores successful login tokens with
  `localStorage.setItem("token", data.access_token)`.
- `LoginPage.jsx` also logs in after successful registration and stores the
  returned token the same way.
- `WorldPage.jsx`, `CreateCharacterPage.jsx`, `character.store.js`,
  `AdminPanel.tsx`, and admin HTTP helpers read the token with
  `localStorage.getItem("token")`.
- Observed HTTP calls send `Authorization: Bearer <token>`.
- `WorldPage.jsx` creates the Socket.IO client with `auth: { token }`.
- `WorldPage.jsx` implements local logout with
  `localStorage.removeItem("token")` and navigation to `/`.

Not verified:

- Protection against browser token theft.
- Token storage in an HTTP-only cookie.
- Client-side token expiration handling before making requests.
- Automatic logout when a token expires.
- Clearing an active Socket.IO connection during logout.

## WebSocket authentication

Implemented:

- `WsAuthService` extracts a token from Socket.IO `handshake.auth.token`.
- `WsAuthService` also accepts a handshake `Authorization: Bearer ...` header.
- `WsAuthService` validates the JWT with `JwtService.verifyAsync`.
- `WsAuthService` returns `userId`, optional `username`, and optional `role`
  when the token is valid.
- `WorldGateway`, `ResourcesGateway`, and `AnimalsGateway` call
  `WsAuthService.authenticate` in `handleConnection`.
- Those gateways disconnect the socket when authentication fails.
- Those gateways set `client.data.userId` and `client.data.role` after
  successful authentication.
- `join_world` sets `client.data.player` after server-side character ownership
  verification.

| Gateway | JWT validation observed | `client.data` fields | Authorization observed | Gaps | Status |
|---|---|---|---|---|---|
| `WorldGateway` | Calls `WsAuthService.authenticate` in `handleConnection`; disconnects invalid sockets. | `userId`, `role`, and later `player` after `join_world`. | `join_world` checks that the character belongs to `client.data.userId`. | Normal movement authorization beyond basic payload and joined-player state is outside this JWT document and not treated as proven here. | `Implemented` |
| `ResourcesGateway` | Calls `WsAuthService.authenticate` in `handleConnection`; disconnects invalid sockets. | `userId`, `role`, and uses `player` after world join. | Resource interaction uses joined socket player state instead of trusting a submitted character id. | General abuse protection for repeated events is `Not verified`. | `Implemented` |
| `AnimalsGateway` | Calls `WsAuthService.authenticate` in `handleConnection`; disconnects invalid sockets. | `userId`, `role`, and uses `player` after world join. | Animal attack uses joined socket player state instead of trusting a submitted character id. | General replay or duplicate-event protection is `Not verified`. | `Implemented` |
| `AdminGateway` | No independent JWT `handleConnection` hook observed. | Reads `client.data.role`. | Each observed admin socket handler checks `client.data.role === 'admin'`. | Server-guaranteed provenance of `client.data.role` is `Not verified`; connection hook ordering is `Not verified`; independent `AdminGateway` authentication is `Not verified`. | `Not verified` |

Not verified:

- Token expiration handling after a socket is already connected.
- Refreshing socket authentication without reconnecting.
- Independent authentication in `AdminGateway`.
- Guaranteed server-side initialization order for shared socket data.

## Token lifecycle

| Lifecycle item | Observed behavior | Security implication | Status |
|---|---|---|---|
| Token creation | Created during successful `POST /auth/login` with claims `sub`, `username`, and `role`. | The token becomes bearer credentials for HTTP and Socket.IO. | `Implemented` |
| localStorage storage | Client stores the token with `localStorage.setItem("token", data.access_token)`. | Browser JavaScript can read the token; a compromised browser context can expose it. | `Implemented` |
| Expiration `1h` | `AuthModule` configures JWT signing with `expiresIn: '1h'`; `JwtStrategy` does not ignore expiration. | Limits accepted lifetime for HTTP tokens signed with that configuration. | `Configured` |
| Local logout | Client removes the token with `localStorage.removeItem("token")`. | Removes the local browser copy but does not revoke already issued JWTs server-side. | `Implemented` |
| Refresh token | No refresh-token implementation was found in the inspected auth code. | Users may need to log in again after expiration; compromise response has no refresh-token control. | `Not verified` |
| Revocation | No JWT blacklist, allowlist, token version, or revocation store was found. | A stolen unexpired token may remain usable until expiration. | `Not verified` |
| Forced logout | No server-side forced logout mechanism was found. | The server cannot be documented as able to invalidate all active tokens on demand. | `Not verified` |
| Role-change invalidation | No issued-token invalidation after role changes was found. | A token may continue carrying the old role until expiration. | `Not verified` |
| Password-change invalidation | No password-change flow or JWT invalidation after password change was found. | Existing tokens cannot be documented as invalidated after password change. | `Not verified` |
| Account deletion invalidation | No JWT invalidation after account deletion was found. | Existing tokens cannot be documented as invalidated after deletion. | `Not verified` |
| JWT secret rotation | No rotation strategy was found for `JWT_SECRET`. | Secret compromise response is not documented as implemented. | `Not verified` |

## Error handling

Implemented:

- Duplicate registration username throws `ConflictException`.
- Login with unknown username throws `NotFoundException`.
- Login with inactive account throws `UnauthorizedException`.
- Login with invalid password throws `UnauthorizedException`.
- `JwtAuthGuard` rejects absent or invalid bearer tokens through Passport JWT
  behavior.
- `JwtStrategy` throws `UnauthorizedException` when the payload lacks a usable
  user identifier.
- WebSocket gateways that call `WsAuthService` disconnect clients when JWT
  authentication fails.
- Client auth helpers parse JSON error bodies when possible and raise readable
  frontend errors.

Not verified:

- Uniform error messages that avoid user enumeration.
- Rate limiting after repeated authentication failures.
- Security logging for failed login attempts.
- Security logging for invalid socket authentication attempts.

## Security risks

| Risk | Attack path | Existing protection observed | Missing or unverified protection | Status |
|---|---|---|---|---|
| Browser JWT theft | Malicious script or compromised browser reads `localStorage`. | Token is removed on local logout. | XSS mitigation and safer token storage are `Not verified`. | `Not verified` |
| XSS | Injected client-side code reads or uses the bearer token. | No JWT-specific XSS mitigation was verified in inspected auth code. | Content security policy, output escaping review, and token theft mitigation are `Not verified`. | `Not verified` |
| Replayed token | Attacker reuses a copied unexpired JWT. | JWT signature and expiration are checked. | Revocation, token binding, replay detection, and token identifier tracking are `Not verified`. | `Not verified` |
| Brute force login | Repeated password guesses against `/auth/login`. | Password comparison uses bcrypt. | Login rate limiting, lockout, CAPTCHA, and abuse monitoring are `Not verified`. | `Not verified` |
| Credential stuffing | Reused leaked credentials tried repeatedly against `/auth/login`. | Active-account check and bcrypt comparison are present. | Credential-stuffing detection, rate limiting, IP/user throttling, and alerting are `Not verified`. | `Not verified` |
| Expired token | Client sends a token after expiration. | HTTP JWT strategy has `ignoreExpiration: false`; `WsAuthService.verifyAsync` is used during socket authentication. | Client-side expiration handling and already-connected socket expiration behavior are `Not verified`. | `Not verified` |
| Client-side role modification | User edits local client state or tampers with decoded role display. | HTTP admin routes use server-side `RolesGuard`; admin socket handlers check `client.data.role`. | Guaranteed provenance of `client.data.role` for `AdminGateway` is `Not verified`. | `Not verified` |
| Compromised JWT secret | Attacker signs arbitrary tokens if the signing secret is exposed. | Secret is referenced by configuration name only. | Secret strength, storage hardening, rotation, and emergency invalidation are `Not verified`. | `Not verified` |
| No revocation | Valid token remains accepted until expiration. | Expiration is configured as `1h`. | Revocation, forced logout, and token versioning are `Not verified`. | `Not verified` |
| WebSocket with invalid token | Client connects with absent, malformed, or invalid JWT. | `WorldGateway`, `ResourcesGateway`, and `AnimalsGateway` disconnect invalid sockets. | Independent `AdminGateway` authentication and shared-hook ordering are `Not verified`. | `Not verified` |
| Admin operation through authenticated but unauthorized socket | Authenticated non-admin socket emits admin events. | Observed admin socket handlers check `client.data.role === 'admin'`. | Role provenance and connection ordering for `client.data.role` are `Not verified`. | `Not verified` |

## Verified protections

Implemented:

- Public auth routes use DTO classes.
- Global validation pipe is configured for DTO validation.
- Registration checks duplicate usernames.
- Registration hashes passwords with bcrypt cost `10`.
- Login compares passwords with bcrypt.
- Login checks `isActive` before issuing a JWT.
- Login signs JWT claims `sub`, `username`, and `role`.
- JWT signing uses the configuration name `JWT_SECRET`.
- JWT signing in `AuthModule` has expiration `1h`.
- HTTP bearer extraction is configured in `JwtStrategy`.
- HTTP JWT expiration is not ignored.
- `JwtAuthGuard` protects observed character, inventory, item, and admin
  controllers.
- `RolesGuard` and `@Roles` protect observed admin HTTP endpoints and item
  write endpoints.
- `WsAuthService` validates Socket.IO JWTs for the observed world, resources,
  and animals gateways.
- Local logout removes the token from browser storage.

## Known gaps

Not verified:

- Brute-force protection.
- Credential-stuffing protection.
- Refresh token.
- JWT revocation.
- Forced logout.
- JWT secret rotation.
- Invalidation after role change.
- Invalidation after password change.
- Invalidation after account deletion.
- Multi-factor authentication.
- Authentication audit trail.
- XSS/token theft mitigation.
- Registration response excluding the password hash.
- Independent JWT authentication in `AdminGateway`.
- Guaranteed server-side provenance of `client.data.role` for admin socket
  handlers.
- Socket connection hook ordering for shared `client.data` initialization.

## Security checklist

- [ ] Passwords are never stored in plain text.
- [ ] JWT secrets are never documented with real values.
- [ ] Public auth routes validate DTOs.
- [ ] Login abuse protection is reviewed.
- [ ] Protected HTTP routes use authentication guards.
- [ ] Sensitive routes use authorization checks.
- [ ] WebSocket connections validate JWTs.
- [ ] WebSocket events check authorization where needed.
- [ ] Browser-stored tokens are treated as stealable.
- [ ] Token revocation and compromise response are reviewed.

## Non-goals

- This document does not define a new auth architecture.
- This document does not document real secret values, real tokens, passwords, or
  password hashes.
- This document does not prove that all protected routes are secure.
- This document does not replace code review.
- This document does not document gameplay systems beyond JWT authentication
  boundaries.

## Security notes

- A bearer JWT must be treated as sensitive.
- Browser storage must be treated as readable by client-side JavaScript.
- A browser-decoded role is not authorization.
- HTTP authorization must remain server-side.
- Socket authorization must be checked per sensitive event.
- `JWT_SECRET` may be documented by name only; its real value must never be
  copied into documentation.
- Any future refresh, revocation, rotation, or invalidation behavior must be
  verified in code before being documented as implemented.

## Performance notes

- JWT validation is performed per protected HTTP request.
- WebSocket JWT validation is observed at connection time for
  `WorldGateway`, `ResourcesGateway`, and `AnimalsGateway`.
- No JWT-specific performance benchmark was found.
- No token cache, revocation lookup, or session lookup cost was observed in the
  inspected auth code.

## Related files

- [Documentation Index](../README.md)
- [Client Server Trust](client-server-trust.md)
- [Admin Permissions](admin-permissions.md)
- [Architecture Overview](../01_Architecture/overview.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Realtime Socket.IO](../01_Architecture/realtime-socketio.md)
- [NestJS API Gateway](../04_Server/nestjs-api-gateway.md)
- [Server WebSockets](../04_Server/websockets.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should registration responses exclude the password hash explicitly?
- Should login failures avoid distinguishing unknown usernames from wrong
  passwords?
- Should the project add rate limiting for `/auth/login`?
- Should the project introduce refresh tokens or keep short-lived access tokens
  only?
- Should JWT revocation use token versions, a server-side store, or another
  design?
- Should role changes invalidate already issued JWTs immediately?
- Should password changes invalidate already issued JWTs immediately?
- Should `AdminGateway` authenticate JWTs independently in its own connection
  hook?
- Should socket authentication be rechecked after JWT expiration?

## TODO

- [ ] Validate this document with the project owner.
- [ ] Review all protected HTTP routes against the current code.
- [ ] Review WebSocket authentication and authorization boundaries.
- [ ] Audit login brute-force and credential-stuffing protection.
- [ ] Audit token revocation and compromise response.
- [ ] Move this document to `Review` only after human validation.
