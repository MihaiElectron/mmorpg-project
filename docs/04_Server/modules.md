# Server Modules

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/04_Server/nestjs-api-gateway.md, docs/04_Server/websockets.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document inventories the NestJS server modules observed under `apps/api-gateway/src`.

It documents module ownership, controllers, services, providers, imports, exports, TypeORM dependencies, cross-module interactions, security boundaries, and persistence boundaries visible in the inspected code.

It does not define new module boundaries or treat undocumented behavior as implemented.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: configured in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

The purpose of this document is to make the server module graph reviewable. It helps developers and repository-aware assistants understand which NestJS module owns each HTTP controller, gateway provider, service, and persistence dependency before changing server behavior.

Module ownership is descriptive. It is not proof that boundaries are strict or that every cross-module interaction is complete.

## Module overview

The backend is a NestJS application rooted in `AppModule`. The root module loads configuration, configures TypeORM, and imports domain modules for authentication, users, shared code, characters, inventory, items, resources, world services, creatures, and admin functionality.

Observed local modules:

- `AppModule`
- `AuthModule`
- `UserModule`
- `CommonModule`
- `CharactersModule`
- `InventoryModule`
- `ItemModule`
- `ResourcesModule`
- `WorldModule`
- `CreaturesModule`
- `AdminModule`

Framework modules observed in the module graph include `ConfigModule`, `TypeOrmModule`, `PassportModule`, and `JwtModule`.

## Module inventory

| Module | File or package | Main responsibility | Controllers | Services or providers | Status |
|---|---|---|---|---|---|
| AppModule | `apps/api-gateway/src/app.module.ts` | Root application composition and TypeORM configuration | `AppController` | `AppService` | Implemented |
| ConfigModule | `@nestjs/config` | Environment-backed configuration access | None observed | `ConfigService` | Configured |
| TypeOrmModule | `@nestjs/typeorm` | Database connection and repository registration | None observed | TypeORM connection and repositories | Configured |
| AuthModule | `apps/api-gateway/src/auth/auth.module.ts` | Registration, login, JWT signing, and JWT strategy registration | `AuthController` | `AuthService`, `JwtStrategy` | Implemented |
| UserModule | `apps/api-gateway/src/users/user.module.ts` | User repository access and user service export | None observed | `UserService` | Implemented |
| CommonModule | `apps/api-gateway/src/common/common.module.ts` | Shared auth support for socket-facing providers | None observed | `WsAuthService` | Implemented |
| CharactersModule | `apps/api-gateway/src/characters/characters.module.ts` | Character HTTP routes, equipment actions, and character persistence service | `CharacterController` | `CharacterService` | Implemented |
| InventoryModule | `apps/api-gateway/src/inventory/inventory.module.ts` | Inventory HTTP routes and inventory persistence service | `InventoryController` | `InventoryService` | Implemented |
| ItemModule | `apps/api-gateway/src/items/item.module.ts` | Item catalogue HTTP routes and item service | `ItemController` | `ItemService` | Implemented |
| ResourcesModule | `apps/api-gateway/src/resources/resources.module.ts` | Resource providers and resource persistence service | None observed | `ResourcesService`, `ResourcesGateway`, `LootService` | Implemented |
| WorldModule | `apps/api-gateway/src/world/world.module.ts` | World providers, connected-player service, and respawn persistence | None observed | `WorldGateway`, `WorldService` | Implemented |
| CreaturesModule | `apps/api-gateway/src/creatures/creatures.module.ts` | Creature providers, creature state service, and creature persistence | None observed | `CreaturesGateway`, `CreaturesService` | Implemented |
| AdminModule | `apps/api-gateway/src/admin/admin.module.ts` | Admin HTTP routes and admin-facing providers | `AdminController` | `AdminService`, `AdminGateway` | Implemented |

## Dependency map

| Module | Imports observed | Exports observed | Depends on TypeORM entities? | Status |
|---|---|---|---|---|
| AppModule | `ConfigModule.forRoot`, `TypeOrmModule.forRootAsync`, AuthModule, CommonModule, CharactersModule, InventoryModule, ResourcesModule, WorldModule, CreaturesModule, AdminModule | None observed | Entity auto-loading configured through TypeORM | Implemented |
| AuthModule | ConfigModule, UserModule, TypeOrmModule for User, PassportModule, JwtModule | None observed | User | Implemented |
| UserModule | TypeOrmModule for User | UserService, TypeOrmModule | User | Implemented |
| CommonModule | JwtModule registered with ConfigModule | WsAuthService | No direct entity dependency observed | Implemented |
| CharactersModule | TypeOrmModule for Character, CharacterEquipment, Item, Inventory; ItemModule | CharacterService | Character, CharacterEquipment, Item, Inventory | Implemented |
| InventoryModule | TypeOrmModule for Inventory, Character, Item | InventoryService | Inventory, Character, Item | Implemented |
| ItemModule | TypeOrmModule for Item | ItemService, TypeOrmModule | Item | Implemented |
| ResourcesModule | TypeOrmModule for Resource, InventoryModule, CommonModule | ResourcesService, ResourcesGateway | Resource | Implemented |
| WorldModule | TypeOrmModule for Character and RespawnPoint, CommonModule | WorldService | Character, RespawnPoint | Implemented |
| CreaturesModule | TypeOrmModule for Creature, CreatureTemplate, CreatureSpawn, Character; CommonModule; WorldModule | CreaturesService | Creature, CreatureTemplate, CreatureSpawn, Character | Implemented |
| AdminModule | TypeOrmModule for CreatureTemplate, CreatureSpawn, Creature; CreaturesModule; WorldModule; CommonModule | None observed | CreatureTemplate, CreatureSpawn, Creature | Implemented |

## Controller ownership

| Controller | Owning module | Route area | Guards observed | Status |
|---|---|---|---|---|
| AppController | AppModule | `/` | None | Implemented |
| AuthController | AuthModule | `/auth` | None | Implemented |
| CharacterController | CharactersModule | `/characters` | `JwtAuthGuard` | Implemented |
| InventoryController | InventoryModule | `/inventory` | `JwtAuthGuard` | Implemented |
| ItemController | ItemModule | `/item` | `JwtAuthGuard`; `RolesGuard` on write methods | Implemented |
| AdminController | AdminModule | `/admin` | `JwtAuthGuard`, `RolesGuard`, `@Roles(UserRole.ADMIN)` | Implemented |

## Service ownership

| Service or provider | Owning module | Main responsibility | Persistence access observed | Status |
|---|---|---|---|---|
| AppService | AppModule | Root application response | None observed | Implemented |
| AuthService | AuthModule | Register users, verify login, sign JWT | User repository | Implemented |
| JwtStrategy | AuthModule | Validate HTTP bearer JWT payload | None observed directly | Implemented |
| UserService | UserModule | Query users and related characters | User repository | Implemented |
| WsAuthService | CommonModule | Validate socket authentication tokens | None observed directly | Implemented |
| CharacterService | CharactersModule | Character CRUD, equipment mutation, character inventory relation loading | Character, CharacterEquipment, Item, Inventory repositories; DataSource transactions | Implemented |
| InventoryService | InventoryModule | Add, read, equip, and unequip inventory entries | Inventory, Character, Item repositories | Implemented |
| ItemService | ItemModule | Create, read, update, delete item definitions | Item repository | Implemented |
| ResourcesService | ResourcesModule | Read resources and update resource loot state | Resource repository | Implemented |
| LootService | ResourcesModule | Generate item references for resource loot | None observed | Implemented |
| WorldService | WorldModule | Connected-player memory, character joins, position persistence, respawn point setup | Character and RespawnPoint repositories | Implemented |
| CreaturesService | CreaturesModule | Creature setup, creature combat state, creature persistence, admin creature operations | Creature, CreatureTemplate, CreatureSpawn, Character repositories | Implemented |
| AdminService | AdminModule | Read admin overview data and update creature templates | CreatureTemplate, CreatureSpawn, Creature repositories | Implemented |
| ResourcesGateway | ResourcesModule | Socket-facing resource provider | Calls ResourcesService, LootService, InventoryService | Implemented |
| WorldGateway | WorldModule | Socket-facing world provider | Calls WorldService | Implemented |
| CreaturesGateway | CreaturesModule | Socket-facing creature provider | Calls CreaturesService | Implemented |
| AdminGateway | AdminModule | Socket-facing admin provider | Calls CreaturesService, WorldService, AdminService | Implemented |

## Shared and common code

`CommonModule` currently exports `WsAuthService`, which validates socket authentication tokens using `JwtModule` configured with the `JWT_SECRET` variable name. `RolesGuard` and `Roles` decorator live under `apps/api-gateway/src/common`, but they are not registered as providers by `CommonModule` in the inspected code.

`AuthModule` owns HTTP JWT strategy registration through `JwtStrategy` and `JwtAuthGuard`. `CommonModule` owns the shared socket auth service. This split is implemented, but a broader shared-auth abstraction is Not verified.

## Cross-module interactions

| Source module | Target module or service | Interaction observed | Risk or coupling | Status |
|---|---|---|---|---|
| AuthModule | UserModule | AuthService injects UserService and User repository | Auth depends on user persistence shape | Implemented |
| CharactersModule | ItemModule | CharactersModule imports ItemModule and also registers Item repository | Character equipment depends on item catalogue data | Implemented |
| CharactersModule | Inventory domain | CharacterService reads and updates Inventory entries during equipment changes | Equipment and inventory consistency requires careful transaction coverage | Implemented |
| InventoryModule | Characters and Items domains | InventoryService loads Character and Item before inventory mutation | Ownership checks through authenticated user are Not verified for inventory routes | Not verified |
| ResourcesModule | InventoryModule | Resource interaction path uses InventoryService to add generated loot | Resource persistence and inventory mutation can become coupled | Implemented |
| ResourcesModule | CommonModule | ResourcesGateway can use shared socket authentication | Gateway auth behavior depends on CommonModule provider | Implemented |
| WorldModule | CommonModule | WorldGateway can use shared socket authentication | Gateway auth behavior depends on CommonModule provider | Implemented |
| CreaturesModule | WorldModule | CreaturesService uses WorldService for connected players and respawn handling | Creature service depends on world runtime memory | Implemented |
| CreaturesModule | CommonModule | CreaturesGateway can use shared socket authentication | Gateway auth behavior depends on CommonModule provider | Implemented |
| AdminModule | CreaturesModule | AdminGateway calls CreaturesService for creature admin operations | Admin actions can affect creature persistence | Implemented |
| AdminModule | WorldModule | AdminGateway calls WorldService for player teleport handling | Admin actions can affect character position persistence | Implemented |
| AdminModule | CommonModule | AdminModule imports CommonModule | Independent admin socket authentication is Not verified | Not verified |

## Security boundaries

- HTTP authentication is owned by AuthModule and applied by guards in controller modules.
- Admin HTTP authorization is applied in AdminController and item write routes through role checks.
- CharacterController passes authenticated user id into CharacterService for most character operations.
- InventoryController is JWT-protected, but complete ownership for routes accepting `characterId` directly is Not verified.
- `CommonModule` provides shared socket authentication support.
- Strict boundaries between modules are Not verified.
- Complete ownership of routes across all modules is Not verified.
- Documentation of every provider-level security assumption is Not verified.

## Persistence boundaries

TypeORM repositories are registered per module with `TypeOrmModule.forFeature`. Services, not controllers, perform repository reads and writes in the inspected code.

Observed persistence ownership:

- User persistence is owned by UserModule and used by AuthModule.
- Character persistence is primarily owned by CharactersModule and also used by WorldModule and CreaturesModule.
- Inventory persistence is owned by InventoryModule and also touched by CharacterService for equipment consistency.
- Item persistence is owned by ItemModule and used by character and inventory services.
- Resource persistence is owned by ResourcesModule.
- Creature, template, and spawn persistence is owned by CreaturesModule and read or updated by AdminModule.
- Respawn point persistence is owned by WorldModule.

Database-level module isolation is Not verified.

## Verified behavior

- `AppModule` imports all observed domain modules.
- `ConfigModule.forRoot({ isGlobal: true })` is configured.
- `TypeOrmModule.forRootAsync` is configured in `AppModule`.
- Local feature modules use `TypeOrmModule.forFeature` where repositories are injected.
- HTTP controllers are declared in their owning modules.
- Services and gateway providers are declared in their owning modules.
- Several modules export services for cross-module use.
- AdminModule imports the modules whose services it calls.
- CreaturesModule imports WorldModule for `WorldService`.

## Known gaps

- Strict boundaries between modules: Not verified.
- Integration tests by module: Not verified.
- Cyclic dependencies: Not verified.
- Complete route ownership checks: Not verified.
- Future microservices split: Not verified.
- Healthcheck by module: Not verified.
- Metrics by module: Not verified.
- Exhaustive provider documentation: Not verified.
- Runtime module graph validation: Not verified.

## Review checklist

- [ ] Each controller is owned by exactly one documented module.
- [ ] Each provider is documented under its owning module.
- [ ] Cross-module service calls are reviewed before changing module imports.
- [ ] Repository access remains in services or providers, not in controllers.
- [ ] Security-sensitive routes keep guards in the owning controller.
- [ ] Admin-facing providers keep server-side role checks where applicable.
- [ ] Inventory and character ownership checks are reviewed when module calls change.
- [ ] New providers are added to the correct module.
- [ ] New exports are justified by a real consumer.
- [ ] This document is validated before moving to `Review`.

## Non-goals

- This document does not describe detailed realtime event behavior.
- This document does not document detailed JWT internals.
- This document does not define deployment infrastructure.
- This document does not document a complete database schema.
- This document does not define a future service split.
- This document does not document real secret values.

## Security notes

Module imports do not prove authorization. Every route or provider that accepts user-controlled input still needs authentication, authorization, payload validation, ownership checks, and domain checks where relevant.

Do not add real environment values, secrets, tokens, passwords, hashes, or copied configuration values to this document.

## Performance notes

The module graph currently keeps several providers inside one NestJS application process. Module-level metrics and per-module healthchecks are Not verified.

Cross-module calls between world, creatures, resources, and inventory should be reviewed carefully before scaling assumptions are made.

## Related files

- [Documentation Index](../README.md)
- [NestJS API Gateway](nestjs-api-gateway.md)
- [Server WebSockets](websockets.md)
- [TypeORM](typeorm.md)
- [Architecture Overview](../01_Architecture/overview.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should `CommonModule` also own role guard provider registration, or should guards stay as direct imports where used?
- Should inventory ownership checks move into InventoryService, controller methods, or a shared policy helper?
- Should `ItemModule` be imported by `InventoryModule` instead of registering the Item repository directly?
- Should module-level healthchecks and metrics be added later?
- Should admin socket authentication be made independent from other gateway connection hooks?

## TODO

- [ ] Review inventory route ownership boundaries.
- [ ] Review character equipment and inventory consistency boundaries.
- [ ] Verify cyclic dependency behavior with Nest tooling or tests.
- [ ] Add or verify integration tests by module.
- [ ] Add or verify module-level healthcheck and metrics strategy.
- [ ] Document new modules here when they are added.
