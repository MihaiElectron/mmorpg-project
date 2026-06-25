# TypeORM

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/04_Server/nestjs-api-gateway.md, docs/06_Database/postgresql.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the TypeORM integration observed in the NestJS server under `apps/api-gateway/src`.

It covers configuration, connection settings by environment variable name, entity inventory, repository usage, observed relations, persistence flows, transaction usage, schema management, error handling, and verified or unverified persistence risks.

It does not document real environment values, full database schema details, or production database operations that were not observed in code.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: configured in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

The purpose of this document is to make server persistence behavior reviewable without treating the database as an authorization layer.

TypeORM is the server data access layer. Services use repositories to query, create, update, and delete persistent state. Authorization, ownership, payload validation, and domain rules still need to happen in server code before persistence changes are accepted.

## TypeORM overview

The NestJS API configures TypeORM in `AppModule` through `TypeOrmModule.forRootAsync`. Domain modules register repositories through `TypeOrmModule.forFeature`.

Observed persistence domains include users, characters, character equipment, inventory, items, resources, creatures, creature templates, creature spawns, and respawn points.

The database type is configured as `postgres`. Production readiness of the current TypeORM configuration is Not verified.

## Configuration

| Setting or variable name | Used by | Purpose | Real value documented? | Status |
|---|---|---|---|---|
| `TypeOrmModule.forRootAsync` | `apps/api-gateway/src/app.module.ts` | Builds TypeORM configuration through `ConfigService` | No | Configured |
| `ConfigModule.forRoot({ isGlobal: true })` | `apps/api-gateway/src/app.module.ts` | Makes configuration service available globally | No | Configured |
| `DB_HOST` | `app.module.ts` | Database host name | No | Configured |
| `DB_PORT` | `app.module.ts` | Database port | No | Configured |
| `DB_USERNAME` | `app.module.ts` | Database username | No | Configured |
| `DB_PASSWORD` | `app.module.ts` | Database password secret name | No | Configured |
| `DB_NAME` | `app.module.ts` | Database name | No | Configured |
| `entities` file pattern | `app.module.ts` | Auto-load entity classes matching `*.entity` files | No | Configured |
| `synchronize` | `app.module.ts` | Auto-create or update schema at runtime | No | Configured |
| `TypeOrmModule.forFeature` | Domain modules | Registers repositories for injected entities | No | Implemented |

## Database connection

The inspected code configures a PostgreSQL connection through TypeORM. The connection settings are read by name through `ConfigService`.

Real environment values are not documented here. Variable names are documented only so reviewers can find where the configuration is used.

The root configuration uses entity auto-loading through a file pattern and has `synchronize: true` configured. This is useful for development but production schema management is Not verified.

## Entity inventory

| Entity | Module or domain | Main purpose | Key relations observed | Status |
|---|---|---|---|---|
| `User` | Users, Auth | Stores account identity, password hash column, active flag, and role | One user has many characters | Implemented |
| `Character` | Characters, World, Creatures | Stores playable character data, stats, position, owner id, and sex | Many characters belong to one user; one character has many equipment entries and inventory entries | Implemented |
| `CharacterEquipment` | Characters | Stores equipped item per character slot | Many equipment entries belong to one character; many equipment entries reference one item; unique character-slot constraint | Implemented |
| `Inventory` | Inventory, Characters | Stores character item quantities and equipped flag | Many inventory entries belong to one character; many inventory entries reference one item; unique character-item constraint | Implemented |
| `Item` | Items, Characters, Inventory | Stores item catalogue data and equipment metadata | One item can be referenced by equipment entries and inventory entries | Implemented |
| `Resource` | Resources | Stores resource type, coordinates, state, and remaining loot count | No TypeORM relation observed | Implemented |
| `Creature` | Creatures, Admin | Stores creature instance position, health, and state | Many creatures may reference one creature spawn | Implemented |
| `CreatureTemplate` | Creatures, Admin | Stores creature category data and combat or movement fields | Referenced by creature spawns | Implemented |
| `CreatureSpawn` | Creatures, Admin | Stores spawn key, template, coordinates, and respawn delay | Many spawns reference one creature template; creatures reference spawns | Implemented |
| `RespawnPoint` | World | Stores character respawn coordinates and radius | No TypeORM relation observed | Implemented |

## Repository usage

| Service or provider | Entity or repository used | Operation type | Validation before persistence observed | Status |
|---|---|---|---|---|
| AuthService | User repository | Find by username, create, save | Duplicate username check; password hash before save | Implemented |
| UserService | User repository | Find one, find by username, find all | Throws not found for missing user in `findOne` | Implemented |
| CharacterService | Character repository | Create, find, delete | Authenticated user id passed into create and most lookups | Implemented |
| CharacterService | CharacterEquipment repository | Find, create, delete | Item and slot checks observed during equip and unequip flows | Implemented |
| CharacterService | Item repository | Find item by id | Throws not found when requested item is missing | Implemented |
| CharacterService | Inventory repository | Find or update inventory entries through transaction manager | Updates equipped flag around equipment changes | Implemented |
| InventoryService | Inventory repository | Find, create, save, update equipped flag | Character and item existence checks observed; request user ownership is Not verified | Not verified |
| InventoryService | Character repository | Find by id | Character existence check before adding inventory | Implemented |
| InventoryService | Item repository | Find by id, type, or category | Item existence check before adding inventory | Implemented |
| ItemService | Item repository | Create, find, update, remove | Item existence check before update and remove | Implemented |
| ResourcesService | Resource repository | Find, update | Resource existence and state checks in consume flow | Implemented |
| WorldService | Character repository | Find, update position, update health | Character ownership check during join; position updates after runtime state changes | Implemented |
| WorldService | RespawnPoint repository | Count, save, find | Creates default respawn point when none exist | Implemented |
| CreaturesService | Creature repository | Find, save, update, delete through query builder | Target existence, state, health, range, and cooldown checks observed in attack flow | Implemented |
| CreaturesService | CreatureTemplate repository | Find, upsert | Template existence checks for admin spawn and seed setup | Implemented |
| CreaturesService | CreatureSpawn repository | Find, save, update | Existing spawn check during seed setup | Implemented |
| CreaturesService | Character repository | Find and update health | Character existence and health checks during attack flow | Implemented |
| AdminService | CreatureTemplate repository | Find, save, count | Template existence check before update | Implemented |
| AdminService | CreatureSpawn repository | Find, count | No mutation in AdminService except through other services | Implemented |
| AdminService | Creature repository | Count | Counts active creatures | Implemented |

## Relations and ownership

| Data relationship | Entities involved | Ownership or access rule observed | Risk or gap | Status |
|---|---|---|---|---|
| Account to characters | User, Character | Character lookups often include authenticated user id | Complete coverage for every character-related mutation is Not verified | Not verified |
| Character equipment | Character, CharacterEquipment, Item | Unique character-slot constraint and transactional replacement observed | Slot validation is split across DTO and service checks | Implemented |
| Character inventory | Character, Inventory, Item | Unique character-item constraint observed | Inventory routes do not prove request user ownership in inspected controller path | Not verified |
| Resource persistence | Resource | Resource state and remaining loot count update after interaction service flow | Exactly-once loot delivery and concurrent gather safety are Not verified | Not verified |
| Creature spawn relationship | Creature, CreatureSpawn, CreatureTemplate | Creature references spawn; spawn references template with eager loading | Cascade safety and template deletion behavior are Not verified | Not verified |
| Respawn points | Character, RespawnPoint | WorldService finds nearest respawn point and updates character state | Multiple-respawn policy and concurrency behavior are Not verified | Not verified |
| Admin template updates | CreatureTemplate | Admin HTTP route requires admin role; service checks template existence | Field whitelist and concurrency handling for HTTP update are Not verified | Not verified |
| User role | User | Role is persisted and included in JWT at login | Role-change invalidation for existing tokens is Not verified | Not verified |

## Persistence flows

| Flow | Entry point | Entities affected | Transaction observed? | Status |
|---|---|---|---|---|
| User registration | `POST /auth/register` through AuthService | User | No explicit transaction observed | Implemented |
| User login | `POST /auth/login` through AuthService | User read only | No explicit transaction observed | Implemented |
| Character creation | `POST /characters` through CharacterService | Character | No explicit transaction observed | Implemented |
| Character list and lookup | `GET /characters`, `/characters/me`, `/characters/:id` | Character, CharacterEquipment, Inventory, Item through relations | No explicit transaction observed | Implemented |
| Character equip | `POST /characters/:id/equip` through CharacterService | CharacterEquipment, Inventory, Character readback | Yes, DataSource transaction observed | Implemented / Not verified |
| Character unequip | `POST /characters/:id/unequip` through CharacterService | CharacterEquipment, Inventory, Character readback | Yes, DataSource transaction observed | Implemented |
| Character delete | `DELETE /characters/:id` through CharacterService | CharacterEquipment, Inventory, Character | Yes, DataSource transaction observed | Implemented |
| Inventory add | `POST /inventory` through InventoryService | Inventory, Character, Item | No explicit transaction observed | Not verified |
| Inventory equip or unequip | `/inventory` route area through InventoryService | Inventory | No explicit transaction observed | Not verified |
| Item create, update, delete | `/item` admin write routes through ItemService | Item | No explicit transaction observed | Implemented |
| Resource consume | Resource interaction service flow through ResourcesService | Resource, Inventory through InventoryService | No shared explicit transaction observed | Not verified |
| Character position persistence | WorldService disconnect or teleport path | Character | No explicit transaction observed | Implemented |
| Character respawn | WorldService respawn path | Character, RespawnPoint | No explicit transaction observed | Implemented |
| Creature startup seed | CreaturesService module init | CreatureTemplate, CreatureSpawn, Creature | No explicit transaction observed | Implemented |
| Creature attack | CreaturesService attack path | Creature, Character | No explicit transaction observed | Not verified |
| Admin spawn | AdminGateway through CreaturesService | CreatureSpawn, Creature | No explicit transaction observed | Not verified |
| Admin template update | AdminController or AdminGateway through AdminService | CreatureTemplate | No explicit transaction observed | Implemented / Not verified |

## Transactions and concurrency

`CharacterService` uses `DataSource.transaction` for character equipment replacement, unequip, and character removal. These transactions group multiple updates that affect equipment and inventory consistency.

No explicit transaction was observed for inventory add, resource consume plus inventory update, creature attack, admin spawn, template update, or respawn flows.

Database locking, optimistic locking, idempotence keys, rollback guarantees, and concurrent update handling are Not verified.

## Migrations and schema management

The root TypeORM configuration has `synchronize: true` configured. A search for migration files under `apps/api-gateway` did not find migration files.

Production migration management is Not verified. Migration tests are Not verified. Rollback strategy is Not verified.

The entity definitions contain some unique constraints and cascade options, but this document does not describe a complete database schema.

## Error handling

Observed persistence-facing code uses Nest exceptions such as `NotFoundException`, `ConflictException`, `UnauthorizedException`, and `BadRequestException` in service or controller flows.

Some service methods return `null` or failure objects instead of throwing. Uniform database error handling, query error mapping, transaction rollback reporting, and structured persistence audit logging are Not verified.

## Security considerations

- TypeORM is a data access layer, not an authorization layer.
- Repositories should only persist changes after server-side validation.
- User ownership is observed in several character and world flows.
- Inventory route ownership is Not verified in the inspected HTTP controller path.
- Admin HTTP routes use role guards before admin persistence actions.
- Real database credentials and secret values are not documented here.
- Password hash values are not documented here.
- Audit logging for persistence changes is Not verified.
- Soft delete is Not verified.
- Cascade safety is Not verified.

## Performance considerations

The inspected services use repository queries, relation loading, query builders, and in-memory runtime state backed by persisted rows.

Global pagination is Not verified. N+1 query review is Not verified. Index coverage beyond observed unique constraints is Not verified. Query performance under production data volume is Not verified.

## Verified behavior

- `TypeOrmModule.forRootAsync` is configured in `AppModule`.
- Database type is configured as `postgres`.
- Database configuration is read by variable names through `ConfigService`.
- Entity auto-loading is configured with a file pattern.
- `synchronize: true` is configured.
- Domain modules register entity repositories with `TypeOrmModule.forFeature`.
- Ten entity classes were observed.
- Repository injection with `@InjectRepository` is used by server services.
- `CharacterService` uses explicit TypeORM transactions for some multi-step character flows.
- Unique constraints are observed on user username, character equipment character-slot, inventory character-item, creature template key, and creature spawn key.
- Cascading delete options are observed on some character, equipment, and inventory relations.

## Known gaps

- Transactions across all multi-entity flows: Not verified.
- Concurrent locking: Not verified.
- Database idempotence: Not verified.
- Production migration management: Not verified.
- Rollback strategy: Not verified.
- Seeds as a reviewed production process: Not verified.
- Complete indexes: Not verified.
- Complete database constraints: Not verified.
- Cascade safety: Not verified.
- Soft delete: Not verified.
- Audit: Not verified.
- Multi-instance consistency: Not verified.
- Migration tests: Not verified.
- Full schema documentation: Not verified.
- Query performance under load: Not verified.

## Review checklist

- [ ] Every new repository injection is registered through the owning module.
- [ ] Every multi-entity write is reviewed for transaction needs.
- [ ] Every user-owned entity write is reviewed for ownership checks.
- [ ] Inventory and equipment consistency is reviewed after related changes.
- [ ] Resource and loot flows are reviewed for duplicate write risk.
- [ ] Creature and character health updates are reviewed for concurrency risk.
- [ ] Admin persistence actions are reviewed for role checks and payload validation.
- [ ] Production schema changes use an explicit migration plan.
- [ ] Environment variable names are documented without values.
- [ ] This document is validated before moving to `Review`.

## Non-goals

- This document does not define a complete database schema.
- This document does not document real environment values.
- This document does not describe detailed realtime events.
- This document does not define client rendering behavior.
- This document does not create migrations.
- This document does not define a production database operations plan.

## Security notes

Never add real database credentials, JWT secrets, password hashes, access tokens, connection strings, or copied environment files to this document.

Before treating this document as review-ready, verify ownership coverage on inventory routes, transaction needs for resource and inventory writes, and production schema management.

## Performance notes

Relation-heavy reads and repeated repository calls should be reviewed before production load assumptions are made. Pagination, indexes, query count limits, and observability are Not verified.

## Related files

- [Documentation Index](../README.md)
- [NestJS API Gateway](nestjs-api-gateway.md)
- [Server Modules](modules.md)
- [PostgreSQL](../06_Database/postgresql.md)
- [Database Schema](../06_Database/schema.md)
- [Database Migrations](../06_Database/migrations.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should `synchronize: true` be disabled outside local development?
- Which flows should be wrapped in explicit transactions?
- Should inventory writes enforce ownership in the service layer?
- Should resource consume and inventory add become a single transaction?
- Which unique constraints and indexes are required for production data volume?
- Should admin persistence actions write an audit record?

## TODO

- [ ] Add or verify production migration strategy.
- [ ] Review transaction needs for inventory, resource, creature, and admin flows.
- [ ] Review ownership checks before all user-owned persistence writes.
- [ ] Review complete index and constraint requirements.
- [ ] Add or verify migration tests.
- [ ] Add or verify persistence audit strategy.
