# NestJS API Gateway

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/01_Architecture/overview.md, docs/02_Security/client-server-trust.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the HTTP-facing NestJS API Gateway observed under `apps/api-gateway/src`.

It covers the application bootstrap, imported server modules, HTTP controllers, public routes, JWT-protected routes, admin-only routes, DTO validation, Swagger setup, CORS setup, TypeORM setup, environment variable names, and security or production gaps visible from the inspected code.

Realtime gateway behavior is intentionally out of scope except where a module registers a provider that explains why the module is present in the API application.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: configured in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

The NestJS API Gateway is the backend application entry point for HTTP API access. It starts the Nest application, wires the root module graph, applies global DTO validation, enables CORS, exposes Swagger documentation, and serves HTTP controllers for authentication, characters, inventory, items, and admin data.

The gateway relies on JWT bearer authentication for protected HTTP routes. Admin-only HTTP routes use a role decorator and role guard where observed.

## Application role

The application role is to expose server-side APIs and to centralize HTTP security boundaries. The code shows public authentication endpoints, authenticated player-facing endpoints, and admin-only endpoints.

The root application imports domain modules for authentication, users, characters, inventory, resources, world services, animals, admin functionality, and common shared services. Some imported modules provide non-HTTP providers; their HTTP routes are only documented when a controller is observed.

## Bootstrap configuration

`apps/api-gateway/src/main.ts` creates the Nest application from `AppModule`.

Observed bootstrap configuration:

- Global `ValidationPipe` is configured with `whitelist`, `forbidNonWhitelisted`, `transform`, and implicit primitive conversion.
- CORS is enabled with origin configuration derived from `CLIENT_ORIGIN`.
- CORS credentials are enabled.
- CORS methods include `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS`.
- CORS allowed headers include `Content-Type` and `Authorization`.
- Swagger is configured with the title `API Gateway`, version `1.0`, and bearer auth support.
- Swagger UI is mounted at `/api/docs`.
- The HTTP listener uses `PORT`.

## Module inventory

| Module | File or package | Main responsibility | Imported dependencies observed | Status |
| --- | --- | --- | --- | --- |
| AppModule | `apps/api-gateway/src/app.module.ts` | Root Nest module and application composition | ConfigModule, TypeOrmModule, AuthModule, CommonModule, CharactersModule, InventoryModule, ResourcesModule, WorldModule, AnimalsModule, AdminModule | Implemented |
| ConfigModule | `@nestjs/config` | Load configuration for injected `ConfigService` usage | Global root import in AppModule | Configured |
| TypeOrmModule root | `@nestjs/typeorm` | Configure database connection and entity loading | ConfigService, database environment variable names | Configured |
| AuthModule | `apps/api-gateway/src/auth/auth.module.ts` | Authentication routes, JWT signing, JWT strategy | ConfigModule, UserModule, TypeOrmModule for User, PassportModule, JwtModule | Implemented |
| UserModule | `apps/api-gateway/src/users/user.module.ts` | User repository access and user service export | TypeOrmModule for User | Implemented |
| CommonModule | `apps/api-gateway/src/common/common.module.ts` | Shared services and JWT-backed shared auth service | JwtModule, ConfigModule, ConfigService | Implemented |
| CharactersModule | `apps/api-gateway/src/characters/characters.module.ts` | Character HTTP routes and character domain service | TypeOrmModule for Character, CharacterEquipment, Item, Inventory; ItemModule | Implemented |
| InventoryModule | `apps/api-gateway/src/inventory/inventory.module.ts` | Inventory HTTP routes and inventory service | TypeOrmModule for Inventory, Character, Item | Implemented |
| ItemModule | `apps/api-gateway/src/items/item.module.ts` | Item catalogue HTTP routes and item service | TypeOrmModule for Item | Implemented |
| ResourcesModule | `apps/api-gateway/src/resources/resources.module.ts` | Resource service provider registration | TypeOrmModule for Resource, InventoryModule, CommonModule | Implemented |
| WorldModule | `apps/api-gateway/src/world/world.module.ts` | World service provider registration | TypeOrmModule for Character and RespawnPoint, CommonModule | Implemented |
| AnimalsModule | `apps/api-gateway/src/animals/animals.module.ts` | Animal service provider registration | TypeOrmModule for Animal, CreatureTemplate, CreatureSpawn, Character; CommonModule; WorldModule | Implemented |
| AdminModule | `apps/api-gateway/src/admin/admin.module.ts` | Admin HTTP routes and admin providers | TypeOrmModule for CreatureTemplate, CreatureSpawn, Animal; AnimalsModule; WorldModule; CommonModule | Implemented |
| Swagger | `@nestjs/swagger` and `swagger-ui-express` | Generate and serve API documentation | DocumentBuilder, SwaggerModule | Configured |
| CORS | `app.enableCors` in `main.ts` | Browser-facing cross-origin HTTP access | `CLIENT_ORIGIN` environment variable name | Configured |

## HTTP controller inventory

| Controller | Base route | Main responsibility | Guards observed | Status |
| --- | --- | --- | --- | --- |
| AppController | `/` | Root public response | None | Implemented |
| AuthController | `/auth` | Registration and login | None | Implemented |
| CharacterController | `/characters` | Authenticated character CRUD and equipment actions | `JwtAuthGuard` at controller level | Implemented |
| InventoryController | `/inventory` | Authenticated inventory read and mutation actions | `JwtAuthGuard` at controller level | Implemented |
| ItemController | `/item` | Authenticated item catalogue reads and admin item mutations | `JwtAuthGuard` at controller level; `RolesGuard` on write methods | Implemented |
| AdminController | `/admin` | Admin overview, templates, spawns, and template updates | `JwtAuthGuard` and `RolesGuard` at controller level with `@Roles(UserRole.ADMIN)` | Implemented |

## Public routes

| Route | Method | Controller | Input DTO or parameters | Server checks observed | Status |
| --- | --- | --- | --- | --- | --- |
| `/` | GET | AppController | None | Returns `AppService.getHello()` | Implemented |
| `/auth/register` | POST | AuthController | `RegisterUserDto` | Username string, password string, password minimum length, duplicate username check, password hashing before save | Implemented |
| `/auth/login` | POST | AuthController | `LoginUserDto` | Username string, password string, user lookup, active-account check, bcrypt comparison, JWT signing | Implemented |
| `/api/docs` | GET | SwaggerModule | None | Swagger setup is configured with bearer auth metadata; access guard not observed | Configured |

## Protected routes

| Route or area | Method | Controller | Guard observed | Ownership or domain check observed | Status |
| --- | --- | --- | --- | --- | --- |
| `/characters` | POST | CharacterController | `JwtAuthGuard` | Uses `req.user.userId` when creating the character | Implemented |
| `/characters` | GET | CharacterController | `JwtAuthGuard` | Queries characters by `req.user.userId` | Implemented |
| `/characters/me` | GET | CharacterController | `JwtAuthGuard` | Queries first character by `req.user.userId` | Implemented |
| `/characters/:id` | GET | CharacterController | `JwtAuthGuard` | Character lookup includes both character id and `req.user.userId` | Implemented |
| `/characters/:id/equip` | POST | CharacterController | `JwtAuthGuard` | User id is passed to service, but service only proves the user has a character before using `characterId`; complete ownership for the target id is Not verified | Not verified |
| `/characters/:id/unequip` | POST | CharacterController | `JwtAuthGuard` | Service calls character lookup with id and user id before mutation | Implemented |
| `/characters/:id` | DELETE | CharacterController | `JwtAuthGuard` | Service calls character lookup with id and user id before deletion | Implemented |
| `/inventory` | POST | InventoryController | `JwtAuthGuard` | Character existence is checked; request user ownership is Not verified | Not verified |
| `/inventory/:characterId/equip/:itemId` | POST | InventoryController | `JwtAuthGuard` | Inventory entry existence is checked; request user ownership is Not verified | Not verified |
| `/inventory/:characterId/unequip/:slot` | POST | InventoryController | `JwtAuthGuard` | Inventory lookup by character and slot is performed; request user ownership is Not verified | Not verified |
| `/inventory/:characterId` | GET | InventoryController | `JwtAuthGuard` | Inventory lookup by character id is performed; request user ownership is Not verified | Not verified |
| `/item` | GET | ItemController | `JwtAuthGuard` | Authenticated catalogue read; no ownership requirement observed | Implemented |
| `/item/:id` | GET | ItemController | `JwtAuthGuard` | Item existence check in service | Implemented |

## Admin routes

| Route or area | Method | Controller | Guard or role check observed | Side effect | Status |
| --- | --- | --- | --- | --- | --- |
| `/admin/overview` | GET | AdminController | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | None; returns counts | Implemented |
| `/admin/templates` | GET | AdminController | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | None; returns templates | Implemented |
| `/admin/spawns` | GET | AdminController | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | None; returns spawns | Implemented |
| `/admin/templates/:key` | PATCH | AdminController | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Updates template fields passed in request body | Implemented |
| `/item` | POST | ItemController | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Creates an item | Implemented |
| `/item/:id` | PATCH | ItemController | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Updates an item | Implemented |
| `/item/:id` | DELETE | ItemController | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Deletes an item | Implemented |

## Guards and authorization

| Guard or decorator | Used by | Purpose | Limitation or gap | Status |
| --- | --- | --- | --- | --- |
| `JwtAuthGuard` | CharacterController, InventoryController, ItemController, AdminController | Require a valid JWT bearer token through Passport JWT | Token revocation and database reload on every request are Not verified | Implemented |
| `JwtStrategy` | `JwtAuthGuard` | Extract bearer token, verify signature and expiration, map payload to `req.user` | Runtime validation of active user status during protected requests is Not verified | Implemented |
| `RolesGuard` | AdminController and item write methods | Compare required roles against `request.user.role` | Depends on role present in JWT payload | Implemented |
| `@Roles(UserRole.ADMIN)` | AdminController and item write methods | Declare admin-only handlers | Broader permission model beyond admin role is Not verified | Implemented |

## Validation and DTOs

| Input area | DTO or validation observed | What is validated | Missing or unverified validation | Status |
| --- | --- | --- | --- | --- |
| Registration | `RegisterUserDto` | `username` string, `password` string, password minimum length | Username length, username format, password complexity, and response password stripping are Not verified | Implemented |
| Login | `LoginUserDto` | `username` string, `password` string | Brute-force protection and rate limiting are Not verified | Implemented |
| Character creation | `CreateCharacterDto` | `name` string, name minimum length, `sex` string in allowed values | Name uniqueness and profanity checks are Not verified | Implemented |
| Character equip | `EquipItemDto` | `itemId` UUID, optional equipment slot enum | Complete target character ownership is Not verified | Not verified |
| Character unequip | `UnequipItemDto` | `slot` string | Slot enum validation is Not verified for this DTO | Not verified |
| Inventory add | `CreateInventoryDto` | `characterId` UUID, `itemId` UUID, integer quantity minimum, optional boolean equipped flag | Request user ownership is Not verified | Not verified |
| Item create | `CreateItemDto` | `name`, `type`, `category` strings; optional numeric attack and defense | Slot validation and business constraints are Not verified | Not verified |
| Item update | `UpdateItemDto` | Optional string and numeric fields | Empty update behavior and full business constraints are Not verified | Not verified |
| Admin template update | `Record<string, number>` body type | TypeScript type annotation only | Runtime DTO validation for allowed keys and numeric bounds is Not verified | Not verified |
| Global request bodies | Global `ValidationPipe` | Whitelist, unknown-field rejection, transform, implicit conversion | Complete DTO validation across all inputs is Not verified | Configured |

## Swagger and API documentation

Swagger is configured in `main.ts` with `DocumentBuilder`, bearer auth metadata, title `API Gateway`, and version `1.0`. The Swagger UI is mounted at `/api/docs`.

Decorator-level Swagger descriptions for each route are Not verified. Protection of the Swagger UI itself is Not verified.

## CORS and network exposure

CORS is configured in `main.ts` using `app.enableCors`.

Observed configuration:

- Origin is derived from the `CLIENT_ORIGIN` environment variable name.
- Multiple origins are supported when the raw origin string contains commas.
- Credentials are enabled.
- HTTP methods are explicitly listed.
- Allowed headers are explicitly listed.

Production CORS hardening is Not verified.

## TypeORM integration

TypeORM is configured in `AppModule` using `TypeOrmModule.forRootAsync` and `ConfigService`.

Observed configuration:

- Database type is configured as `postgres`.
- Connection settings are read from database environment variable names.
- Entity loading uses a file pattern under the compiled source directory.
- `synchronize: true` is configured.
- Feature repositories are registered per module with `TypeOrmModule.forFeature`.

Production database migrations are Not verified. Use of `synchronize: true` in production would need explicit review before this document can move out of Draft.

## Error handling

Observed service and controller code uses Nest exceptions such as `ConflictException`, `UnauthorizedException`, `NotFoundException`, and `BadRequestException`.

A global exception filter, uniform error response shape, structured error logging, and sensitive error redaction policy are Not verified.

## Environment configuration

| Variable name | Used by | Purpose | Real value documented? | Status |
| --- | --- | --- | --- | --- |
| `PORT` | `main.ts` | HTTP listen port | No | Configured |
| `CLIENT_ORIGIN` | `main.ts`, `common/cors.constants.ts` | CORS origin configuration | No | Configured |
| `JWT_SECRET` | `auth/auth.module.ts`, `auth/jwt.strategy.ts`, `common/common.module.ts` | JWT signing and verification secret name | No | Configured |
| `DB_HOST` | `app.module.ts` | Database host name | No | Configured |
| `DB_PORT` | `app.module.ts` | Database port | No | Configured |
| `DB_USERNAME` | `app.module.ts` | Database username | No | Configured |
| `DB_PASSWORD` | `app.module.ts` | Database password secret name | No | Configured |
| `DB_NAME` | `app.module.ts` | Database name | No | Configured |

## Security considerations

- JWT bearer authentication is implemented for protected HTTP controllers.
- JWT expiration checking is enabled by Passport JWT configuration.
- Admin routes use `RolesGuard` and `@Roles(UserRole.ADMIN)` where observed.
- Passwords are hashed with bcrypt during registration.
- Login compares submitted passwords with bcrypt.
- User role is included in the JWT payload.
- User activation is checked during login.
- Active-user revalidation after JWT issuance is Not verified.
- Token revocation is Not verified.
- HTTP rate limiting is Not verified.
- Brute-force protection is Not verified.
- Structured audit is Not verified.
- Complete ownership on all routes is Not verified.
- Error response hardening is Not verified.
- No real secret, token, password, or hash is documented here.

## Performance considerations

The inspected code uses direct TypeORM repository queries and relations for several endpoints. No cache layer is verified for HTTP responses.

Global pagination is Not verified. Metrics, tracing, and multi-instance readiness are Not verified. Query performance characteristics under production load are Not verified.

## Verified behavior

- The application bootstraps through `NestFactory.create(AppModule)`.
- Global `ValidationPipe` is configured.
- CORS is configured.
- Swagger is configured at `/api/docs`.
- TypeORM root configuration is present.
- Auth routes `/auth/register` and `/auth/login` are public.
- Character routes are protected by `JwtAuthGuard`.
- Inventory routes are protected by `JwtAuthGuard`.
- Item read routes are protected by `JwtAuthGuard`.
- Item write routes require admin role checks.
- Admin HTTP routes require JWT and admin role checks.
- Registration checks duplicate usernames before creating a user.
- Login checks user existence, active status, and password validity before issuing a JWT.

## Known gaps

- HTTP rate limiting: Not verified.
- Brute-force protection: Not verified.
- Structured audit: Not verified.
- Global pagination: Not verified.
- Complete DTO validation: Not verified.
- Complete ownership on all routes: Not verified.
- Uniform error handling: Not verified.
- Production config: Not verified.
- Production DB migrations: Not verified.
- Healthcheck: Not verified.
- Metrics: Not verified.
- Tracing: Not verified.
- Cache: Not verified.
- Multi-instance: Not verified.
- E2E tests on all routes: Not verified.
- Swagger UI access control: Not verified.
- Token revocation: Not verified.
- Active-user revalidation on protected requests: Not verified.

## Review checklist

- [ ] Public routes expose only intended unauthenticated behavior.
- [ ] Protected routes use authentication guards.
- [ ] Sensitive routes use authorization checks.
- [ ] DTO validation is reviewed for each route.
- [ ] Ownership checks are reviewed for user-owned resources.
- [ ] Admin routes are reviewed against server-side role checks.
- [ ] Error responses do not expose sensitive data.
- [ ] Environment variable names are documented without values.
- [ ] Production configuration gaps are documented.
- [ ] This document is validated before moving to `Review`.

## Non-goals

- This document does not define client UI implementation.
- This document does not define realtime event behavior.
- This document does not define deployment infrastructure.
- This document does not document a complete database schema.
- This document does not document real secret values.
- This document does not replace endpoint tests.

## Security notes

Keep this document limited to variable names and verified mechanisms. Do not add real credentials, JWT values, password examples, password hashes, or copied environment files.

Before moving this document out of Draft, review ownership checks for inventory routes and character equip behavior, review admin mutation DTO validation, and confirm production-safe database configuration.

## Performance notes

The API currently documents no verified cache, no verified pagination standard, and no verified observability setup. High-cardinality list endpoints and relation-heavy reads should be reviewed with production data volumes before release.

## Related files

- [Documentation Index](../README.md)
- [Architecture Overview](../01_Architecture/overview.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Realtime Socket.IO](../01_Architecture/realtime-socketio.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Authentication JWT](../02_Security/authentication-jwt.md)
- [Admin Permissions](../02_Security/admin-permissions.md)
- [Server WebSockets](websockets.md)
- [Server Modules](modules.md)
- [TypeORM](typeorm.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should inventory routes enforce ownership through `req.user.userId` before every inventory read or mutation?
- Should `/characters/:id/equip` verify the requested character id belongs to the authenticated user before applying equipment changes?
- Should admin template updates use a DTO with explicit allowed fields and bounds?
- Should Swagger UI remain public in non-development environments?
- Should the API add a dedicated healthcheck endpoint?
- Should protected requests reload the user from storage to enforce `isActive` after token issuance?

## TODO

- [ ] Review ownership checks for all inventory routes.
- [ ] Review ownership check behavior for character equip.
- [ ] Add or verify DTO validation for admin template updates.
- [ ] Add or verify production-safe database migration strategy.
- [ ] Add or verify HTTP rate limiting and brute-force protection.
- [ ] Add or verify healthcheck, metrics, and tracing.
- [ ] Add or verify E2E coverage for public, protected, and admin routes.
