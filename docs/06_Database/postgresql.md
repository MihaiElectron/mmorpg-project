# PostgreSQL

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/04_Server/typeorm.md, docs/06_Database/schema.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes PostgreSQL usage observed in the repository.

It covers server connection configuration, TypeORM integration, environment variable names, persisted domains, local development setup, production considerations, backup gaps, security considerations, and performance considerations.

It does not document real environment values, credentials, complete physical schema output, or database administration procedures that were not verified in code.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: present in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

PostgreSQL is the persistent data store used by the NestJS server. TypeORM connects the server application to PostgreSQL and exposes repositories for domain services.

The database stores durable application state. It is not a substitute for server-side validation, ownership checks, authorization, concurrency control, or operational backup planning.

## PostgreSQL overview

The backend configures TypeORM with database type `postgres` in `apps/api-gateway/src/app.module.ts`.

Local infrastructure includes a PostgreSQL service in `docker/docker-compose.yml`. The server reads database connection settings through `ConfigService` using environment variable names. Real values are intentionally not documented.

The current runtime configuration uses `synchronize: true`, which lets TypeORM create or adjust schema objects automatically during development. Production-safe schema change management is Not verified.

## Runtime configuration

| Area | Observed configuration | Source | Status |
|---|---|---|---|
| Database engine | TypeORM database type is `postgres` | `apps/api-gateway/src/app.module.ts` | Configured |
| Server configuration access | `ConfigModule.forRoot({ isGlobal: true })` and `ConfigService` | `apps/api-gateway/src/app.module.ts` | Configured |
| Connection setup | `TypeOrmModule.forRootAsync` builds the connection settings | `apps/api-gateway/src/app.module.ts` | Configured |
| Entity discovery | Entity file pattern uses `__dirname + '/**/*.entity.{ts,js}'` | `apps/api-gateway/src/app.module.ts` | Configured |
| Schema synchronization | `synchronize: true` is enabled | `apps/api-gateway/src/app.module.ts` | Configured |
| Repository registration | Domain modules use `TypeOrmModule.forFeature` | Server module files under `apps/api-gateway/src` | Implemented |
| Local data volume | A named volume stores PostgreSQL data for the local service | `docker/docker-compose.yml` | Configured |

## Connection configuration

The server connection uses `TypeOrmModule.forRootAsync` with `ConfigService`.

Observed connection settings by name:

- host from `DB_HOST`;
- port from `DB_PORT`;
- username from `DB_USERNAME`;
- password from `DB_PASSWORD`;
- database name from `DB_NAME`.

The code provides fallback values for host and port. Required database username, password, and database name use `getOrThrow`, so missing values should fail configuration at startup.

Connection pool sizing, SSL mode, connection timeouts, application name, statement timeout, and production tuning are Not verified.

## Database usage by the server

The NestJS server registers repositories in domain modules and injects them into services with `@InjectRepository`.

Observed usage includes:

- account lookup and creation;
- character creation, lookup, equipment changes, position persistence, and health updates;
- inventory item quantity updates;
- item catalogue reads and admin mutations;
- resource reads and state updates;
- resource template reads and upserts;
- animal, creature template, and spawn reads or writes;
- respawn point reads and seed creation;
- admin overview and mutation support.

Some multi-entity character flows use explicit TypeORM transactions. Complete transaction coverage across all multi-entity writes is Not verified.

## Environment variables

| Variable name | Used by | Purpose | Real value documented? | Status |
|---|---|---|---|---|
| `DB_HOST` | `apps/api-gateway/src/app.module.ts` | Database host name | No | Configured |
| `DB_PORT` | `apps/api-gateway/src/app.module.ts` | Database port | No | Configured |
| `DB_USERNAME` | `apps/api-gateway/src/app.module.ts` | Database user name | No | Configured |
| `DB_PASSWORD` | `apps/api-gateway/src/app.module.ts` | Database password secret name | No | Configured |
| `DB_NAME` | `apps/api-gateway/src/app.module.ts` | Database name | No | Configured |
| `POSTGRES_USER` | `docker/docker-compose.yml` | Local PostgreSQL service user name | No | Configured |
| `POSTGRES_PASSWORD` | `docker/docker-compose.yml` | Local PostgreSQL service password secret name | No | Configured |
| `POSTGRES_DB` | `docker/docker-compose.yml` | Local PostgreSQL database name | No | Configured |

## Persistence domains

| Domain | Data stored | Access path observed | Status |
|---|---|---|---|
| Users | Account id, username, password hash column, active flag, role, timestamps | `AuthService`, `UserService`, `User` repository | Implemented |
| Characters | Character identity, owner id, stats, sex, position, timestamps | `CharacterService`, `WorldService`, `AnimalsService`, `AdminService` | Implemented |
| Character equipment | Equipped item per character slot | `CharacterService`, `CharacterEquipment` repository | Implemented |
| Inventory | Character item quantity and equipped flag | `InventoryService`, `CharacterService`, resource interaction paths | Implemented |
| Items | Item catalogue fields, equipment slot, optional image path, optional combat values | `ItemService`, character and inventory services | Implemented |
| Resources | Resource type, coordinates, state, remaining loot count | `ResourcesService`, `AdminService` | Implemented |
| Resource templates | Resource type and default remaining loot count | `ResourcesService`, `AdminService` | Implemented |
| Animals | Animal instance position, health, and state | `AnimalsService`, `AdminService` | Implemented |
| Creature templates | Creature base stats, texture key, movement and behavior fields | `AnimalsService`, `AdminService` | Implemented |
| Creature spawns | Spawn key, creature template, coordinates, respawn delay | `AnimalsService`, `AdminService` | Implemented |
| Respawn points | Respawn coordinates and radius | `WorldService` | Implemented |

## Local development

Local development is configured around a PostgreSQL service and TypeORM schema synchronization.

Observed local behavior:

- the infrastructure file defines a PostgreSQL service and persistent local volume;
- the server reads its own database connection variable names;
- TypeORM entity discovery is automatic;
- `synchronize: true` is enabled for development-style schema updates;
- module initialization code seeds or repairs some world data.

The local database is development infrastructure. It should not be treated as a production operations model.

## Production considerations

Production readiness is Not verified.

Areas requiring explicit review before production:

- disable or replace runtime schema synchronization;
- introduce reviewed database migrations;
- define backup and restore procedures;
- define connection pool sizing;
- define monitoring and alerting;
- define retention policy;
- define rollback strategy;
- review indexes and constraints;
- review transaction coverage and concurrent write safety;
- review access controls and credential rotation.

## Backup and recovery

Backup procedures are Not verified. Restore procedures are Not verified. Retention policy is Not verified. Recovery time and recovery point objectives are TBD.

No automated backup job, restoration test, point-in-time recovery setup, or documented restore drill was observed in the inspected files.

## Security considerations

- Real database credentials are not documented here.
- Real environment values are not documented here.
- PostgreSQL stores sensitive account and gameplay state.
- The database should be accessed through server-side services and validated persistence flows.
- Database rows do not prove that a client request is authorized.
- Ownership, authorization, and gameplay checks must happen in server code before writes.
- Encryption at rest, transport encryption, credential rotation, least-privilege database users, and audit logging are Not verified.

## Performance considerations

Observed services use repository reads, relation loading, saves, updates, query builders, and some explicit transactions.

Production performance tuning is Not verified. Pool sizing, slow query monitoring, query plan review, pagination strategy, index coverage, connection limits, and load testing are Not verified.

## Verified behavior

- PostgreSQL is configured as the TypeORM database type.
- The server uses `TypeOrmModule.forRootAsync`.
- The server reads database setting names through `ConfigService`.
- Entity auto-loading is configured.
- `synchronize: true` is configured.
- Domain modules register repositories with `TypeOrmModule.forFeature`.
- A local PostgreSQL service is configured in `docker/docker-compose.yml`.
- Persistent domains include users, characters, equipment, inventory, items, resources, resource templates, animals, creature templates, creature spawns, and respawn points.

## Known gaps

- Backup: Not verified.
- Restore: Not verified.
- Monitoring: Not verified.
- Tuning: Not verified.
- Replication: Not verified.
- Encryption configuration: Not verified.
- Production pool sizing: Not verified.
- Production migrations: Not verified.
- Rollback strategy: Not verified.
- Retention policy: Not verified.
- Restoration tests: Not verified.
- Production access model: Not verified.

## Review checklist

- [ ] Database variable names are documented without values.
- [ ] New persisted domains are added to the persistence inventory.
- [ ] Server-side validation is reviewed before new writes are introduced.
- [ ] Multi-entity writes are reviewed for transaction needs.
- [ ] `synchronize: true` is not treated as a production strategy.
- [ ] Backups and restores are defined before production use.
- [ ] Index and constraint needs are reviewed before large data volumes.
- [ ] No real secret, credential, token, password, hash, or environment value is added.
- [ ] This document is validated before moving to `Review`.

## Non-goals

- This document does not define a complete physical schema.
- This document does not define a production operations runbook.
- This document does not create migrations.
- This document does not document real environment values.
- This document does not document real credentials.
- This document does not replace database tests.

## Security notes

Keep this document limited to variable names, configuration structure, and verified behavior. Do not add real database usernames, passwords, connection strings, tokens, hashes, copied environment files, or private user data.

## Performance notes

Before production use, review connection pool settings, indexes, query volume, relation loading, large table behavior, and observability. Current production performance behavior is Not verified.

## Related files

- [Documentation Index](../README.md)
- [TypeORM](../04_Server/typeorm.md)
- [Database Schema](schema.md)
- [Database Migrations](migrations.md)
- [NestJS API Gateway](../04_Server/nestjs-api-gateway.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- When should runtime schema synchronization be disabled?
- What migration workflow should replace synchronization for production?
- What backup and restore targets are required?
- Which tables need explicit indexes before larger data volumes?
- Should gameplay state changes be covered by additional transaction boundaries?
- What monitoring signals should be required for database health?

## TODO

- [ ] Define or verify a production migration workflow.
- [ ] Define or verify backup and restore procedures.
- [ ] Review connection pool and timeout settings.
- [ ] Review index requirements for all high-cardinality tables.
- [ ] Review transaction needs for resource, inventory, animal, and admin writes.
- [ ] Define or verify database monitoring and alerting.
