# Database Schema

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-24
- Depends on: docs/README.md, docs/04_Server/typeorm.md, docs/06_Database/postgresql.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the logical schema observed from TypeORM entity classes under `apps/api-gateway/src`.

It covers entity inventory, probable table mapping, key fields, relations, constraints, indexes, ownership rules, security considerations, and known schema gaps.

It does not claim to be an exhaustive dump of the live database.

## Verification labels

- `Implemented`: observed in TypeORM entity or server code.
- `Configured`: present in configuration or module registration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

The schema documentation helps reviewers understand which persistent objects exist and how server services use them.

The database schema stores server-side state. It does not replace validation, authorization, ownership checks, transactions, or reviewed migrations.

## Schema overview

The inspected code defines eleven TypeORM entity classes:

- `User`
- `Character`
- `CharacterEquipment`
- `Inventory`
- `Item`
- `Resource`
- `ResourceTemplate`
- `Creature`
- `CreatureTemplate`
- `CreatureSpawn`
- `RespawnPoint`

Some table names are explicit through `@Entity('...')`. Others use TypeORM default naming from class names. The exact generated physical schema should be verified against the live database before treating this document as exhaustive.

## Entity inventory

| Entity | Probable table | Domain | Main purpose | Status |
|---|---|---|---|---|
| `User` | `user` | Accounts | Store account identity, active flag, role, password hash column, timestamps | Implemented |
| `Character` | `character` | Characters | Store playable character state, owner id, stats, sex, position, timestamps | Implemented |
| `CharacterEquipment` | `character_equipment` | Equipment | Store equipped item per character slot | Implemented |
| `Inventory` | `inventory` | Inventory | Store item quantities and equipped flag per character | Implemented |
| `Item` | `item` | Items | Store item catalogue and equipment metadata | Implemented |
| `Resource` | `resources` | Resources | Store resource type, coordinates, state, remaining loot count | Implemented |
| `ResourceTemplate` | `resource_templates` | Resources | Store resource type defaults | Implemented |
| `Creature` | `creatures` | Creatures | Store creature instance position, health, state, and spawn reference | Implemented |
| `CreatureTemplate` | `creature_template` | Creatures | Store creature base stats, behavior fields, and texture key | Implemented |
| `CreatureSpawn` | `creature_spawn` | Creatures | Store spawn key, template reference, coordinates, respawn delay | Implemented |
| `RespawnPoint` | `respawn_point` | World | Store character respawn coordinates and radius | Implemented |

## Table mapping

| Table or entity | Key fields observed | Relations observed | Persistence owner | Status |
|---|---|---|---|---|
| `User` | `id`, `username`, `password`, `isActive`, `role`, `createdAt`, `updatedAt` | One user has many characters | User and auth services | Implemented |
| `Character` | `id`, `name`, `level`, `health`, `maxHealth`, `experience`, `attack`, `defense`, `positionX`, `positionY`, `userId`, `sex`, timestamps | Many characters belong to one user; one character has many equipment and inventory rows | Character, world, creature, and admin services | Implemented |
| `CharacterEquipment` | `id`, `characterId`, `itemId`, `slot`, timestamps | Many rows reference one character and one item | Character service | Implemented |
| `Inventory` | `id`, `quantity`, `equipped`, timestamps | Many rows reference one character and one item | Inventory and character services | Implemented |
| `Item` | `id`, `name`, `type`, `category`, `attack`, `defense`, `range`, `slot`, `image`, timestamps | One item can appear in inventory and equipment rows | Item service | Implemented |
| `Resource` | `id`, `type`, `x`, `y`, `worldX`, `worldY`, `mapId`, `state`, `remainingLoots`, `respawnAt`, `respawnDelayMs` | No TypeORM relation observed | Resource and admin services | Implemented |
| `ResourceTemplate` | `id`, `type`, `defaultRemainingLoots`, `respawnDelayMs`, `lootPool` | No TypeORM relation observed | Resource and admin services | Implemented |
| `Creature` | `id`, `spawn`, `x`, `y`, `worldX`, `worldY`, `mapId`, `health`, `state`, `respawnAt`, `respawnDelayMs` | Many creatures may reference one creature spawn | Creature and admin services | Implemented |
| `CreatureTemplate` | `id`, `key`, `name`, `textureKey`, `baseHealth`, `baseArmor`, `baseAttack`, `patrolRadius`, `speedMin`, `speedMax`, `pauseMinMs`, `pauseMaxMs`, `aggroRadius`, `fleeThresholdPct`, `respawnDelayMs` | Referenced by creature spawns | Creature and admin services | Implemented |
| `CreatureSpawn` | `id`, `key`, `template`, `spawnX`, `spawnY`, `respawnDelayMs` | Many spawns reference one creature template | Creature and admin services | Implemented |
| `RespawnPoint` | `id`, `x`, `y`, `radius` | No TypeORM relation observed | World service | Implemented |

## User and authentication data

`User` stores account-level data. Observed fields include a generated UUID id, unique username, password hash column, active flag, role enum, and timestamps.

Observed role enum values are `player` and `admin`. The default role is `player`.

No real account values, password values, or password hashes are documented here.

Complete account lifecycle, password reset, role audit, and forced session invalidation are Not verified.

## Character data

`Character` stores playable character data and belongs to a user through `userId`.

Observed character fields include name, level, health, max health, experience, attack, defense, position, owner id, sex, and timestamps.

Character position is updated by world-related server flows such as disconnect persistence, teleport, and respawn. Server-side validation for all normal movement constraints is Not verified.

## Inventory and item data

`Item` stores catalogue data used by inventory and equipment. Optional fields include attack, defense, range, slot, and image.

`Inventory` stores character-item quantities and an equipped flag.

`CharacterEquipment` stores the item currently equipped in a character slot. Character equipment changes use explicit transactions in observed character service flows.

Complete inventory route ownership and all concurrent inventory write safety are Not verified.

## Resource data

`Resource` stores live resource instances with type, coordinates, state, and remaining loot count.

`ResourceTemplate` stores defaults per resource type. `ResourcesService` seeds observed default templates on module initialization using insert-or-ignore — existing rows are never overwritten on restart, preserving admin-edited values.

No TypeORM relation between resource instances and templates was observed. Resource consume and inventory update are not verified as one shared transaction.

## Creature and spawn data

`CreatureTemplate` stores creature category fields such as base stats, movement behavior values, and texture key.

`CreatureSpawn` stores spawn key, template reference, spawn coordinates, and respawn delay.

`Creature` stores live creature instance position, health, state, and optional spawn reference with eager loading.

Creature service initialization seeds templates, spawns, and instances where missing. Complete production seed workflow and concurrency behavior are Not verified.

## Admin-related data

Admin services read and mutate creature templates, creature spawns, creatures, characters, resources, and resource templates.

No dedicated audit log entity was observed. No admin action history table was observed. Per-field admin authorization beyond observed server-side handlers is Not verified.

## Relations

| Relationship | Entities involved | Cardinality observed | Ownership implication | Status |
|---|---|---|---|---|
| User to characters | `User`, `Character` | One-to-many from user to characters; many-to-one from character to user | Character ownership is derived from `Character.userId` | Implemented |
| Character to equipment | `Character`, `CharacterEquipment` | One-to-many from character to equipment; many-to-one back to character | Equipment belongs to a character | Implemented |
| Item to equipment | `Item`, `CharacterEquipment` | One-to-many from item to equipment; many-to-one from equipment to item | Item catalogue rows can be equipped by many characters | Implemented |
| Character to inventory | `Character`, `Inventory` | One-to-many from character to inventory; many-to-one from inventory to character | Inventory belongs to a character | Implemented |
| Item to inventory | `Item`, `Inventory` | One-to-many from item to inventory; many-to-one from inventory to item | Item catalogue rows can appear in many inventories | Implemented |
| Spawn to creature | `CreatureSpawn`, `Creature` | Many creatures may reference one spawn | Creature instance origin can be tied to a spawn | Implemented |
| Template to spawn | `CreatureTemplate`, `CreatureSpawn` | Many spawns reference one template | Spawn behavior depends on creature template | Implemented |
| Resource template to resource | `ResourceTemplate`, `Resource` | No TypeORM relation observed | Resource type string is the apparent linkage | Not verified |
| Respawn point to character | `RespawnPoint`, `Character` | No TypeORM relation observed | Respawn uses runtime lookup, not a stored relation | Implemented / Not verified |

## Constraints and indexes

| Entity or table | Constraint or index observed | Purpose | Missing or unverified constraint | Status |
|---|---|---|---|---|
| `User` | `username` column has `unique: true` | Prevent duplicate usernames | Username normalization and case-insensitive uniqueness are Not verified | Implemented / Not verified |
| `CharacterEquipment` | `@Unique(['characterId', 'slot'])` | One equipped item per character slot | Slot enum storage constraint is Not verified at database level | Implemented / Not verified |
| `Inventory` | `@Unique(['character', 'item'])` | One inventory row per character and item pair | Concurrency behavior around quantity increments is Not verified | Implemented / Not verified |
| `CreatureTemplate` | `key` column has `unique: true` | Unique creature template key | Full template validation constraints are Not verified | Implemented / Not verified |
| `CreatureSpawn` | `key` column has `unique: true` | Unique spawn key | Admin-created spawn key collision handling is Not verified beyond current key format | Implemented / Not verified |
| `ResourceTemplate` | `type` column has `unique: true` | One default template per resource type | Type normalization is Not verified | Implemented / Not verified |
| Entity timestamps | `CreateDateColumn` and `UpdateDateColumn` on user, character, equipment, inventory, item | Track creation and update dates | Timestamps on resources, creatures, templates, spawns, and respawn points are Not verified | Implemented / Not verified |
| Soft delete | No `DeleteDateColumn` observed | Not applicable in current entities | Soft delete is Not verified | Not verified |
| Performance indexes | No `@Index` decorator observed | Not verified | Query performance indexes are Not verified | Not verified |

## Ownership and access rules

| Data area | Owner source | Server-side check observed | Missing or unverified check | Status |
|---|---|---|---|---|
| User account | `User.id` | Registration checks duplicate username; login checks active account and password comparison | Account update flows are Not verified | Implemented / Not verified |
| Character | `Character.userId` | Character list, read, delete, and unequip paths use authenticated user id | Complete ownership for equip target id is Not verified | Implemented / Not verified |
| Inventory | `Inventory.character` | Character and item existence checks are observed | Request user ownership for all inventory routes is Not verified | Not verified |
| Equipment | `CharacterEquipment.characterId` | Several equipment flows operate inside transactions | Complete target ownership in equip flow is Not verified | Not verified |
| Items | Server-side item service | Admin write routes are role-protected in observed HTTP controller docs | Business constraints and audit are Not verified | Implemented / Not verified |
| Resources | Resource id and server state | Resource interaction checks target existence, range, state, and remaining loot count | Duplicate write and full concurrency safety are Not verified | Implemented / Not verified |
| Resource templates | Resource type | Admin service checks template existence for updates | Full admin payload validation and audit are Not verified | Implemented / Not verified |
| Creatures | Creature id and spawn/template state | Creature attack checks target, character, range, cooldown, health, and state | Concurrent combat consistency is Not verified | Implemented / Not verified |
| Creature templates and spawns | Template key and spawn key | Admin and seed paths check existence in observed flows | Full deletion and cascade safety are Not verified | Implemented / Not verified |
| Respawn points | Server-managed rows | World service reads nearest point and seeds default when empty | Multiple-respawn policy and admin management are Not verified | Implemented / Not verified |

## Security considerations

- The database is not an authorization boundary by itself.
- Ownership must be checked before user-owned rows are returned or mutated.
- Stored roles and account flags require server-side enforcement.
- Real credentials and real sensitive values are not documented here.
- Password hash values are not documented here.
- Admin mutations should be audited before production use; audit storage is Not verified.
- Soft delete and historical recovery are Not verified.

## Performance considerations

Observed entity definitions include several relations and some unique constraints. Explicit performance indexes beyond uniqueness were not observed.

Pagination, relation loading strategy, large table query plans, N+1 query review, and production data-volume performance are Not verified.

## Verified behavior

- Eleven TypeORM entity classes were observed.
- PostgreSQL connection uses TypeORM entity auto-loading.
- User, character, equipment, inventory, item, resource, resource template, creature, creature template, creature spawn, and respawn point persistence are represented.
- Several relations are represented with TypeORM decorators.
- Several unique constraints are represented through `unique: true` or `@Unique`.
- Some entities have created and updated timestamp columns.
- Some character-owned relations use cascade delete settings.
- No soft delete column was observed.
- No explicit `@Index` decorator was observed.

## Known gaps

- Complete database constraints: Not verified.
- Performance indexes: Not verified.
- Complete business uniqueness: Not verified.
- Complete ownership coverage: Not verified.
- Cascade safety: Not verified.
- Soft delete: Not verified.
- Audit: Not verified.
- Versioning: Not verified.
- History tables: Not verified.
- Multi-instance consistency: Not verified.
- Exhaustive live schema documentation: Not verified.
- Migration-generated schema parity: Not verified.

## Review checklist

- [ ] New entities are added to the entity inventory.
- [ ] Table names are verified when explicit names are not declared.
- [ ] New relations are documented with ownership implications.
- [ ] New user-owned data has a server-side ownership check.
- [ ] New multi-entity writes are reviewed for transactions.
- [ ] New uniqueness or index needs are documented.
- [ ] Cascade behavior is reviewed before destructive changes.
- [ ] Audit needs are reviewed for admin and gameplay-sensitive changes.
- [ ] This document is validated before moving to `Review`.

## Non-goals

- This document does not list every generated column option from a live database.
- This document does not replace TypeORM entity files.
- This document does not create or describe migration files as implemented.
- This document does not document real data values.
- This document does not define a production audit model.
- This document does not define backup or restore procedures.

## Security notes

Never add real account values, credentials, tokens, password hashes, connection strings, copied environment values, or private user data to this document.

Every persisted change should remain behind server-side validation and ownership checks. Database uniqueness does not replace domain authorization.

## Performance notes

Before production use, review high-cardinality tables, unique constraints, query filters, relation loading, and missing indexes. Current production query performance is Not verified.

## Related files

- [Documentation Index](../README.md)
- [PostgreSQL](postgresql.md)
- [Database Migrations](migrations.md)
- [TypeORM](../04_Server/typeorm.md)
- [NestJS API Gateway](../04_Server/nestjs-api-gateway.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should table names be made explicit for every entity?
- Which query paths need explicit indexes before production data volume?
- Should admin actions write audit rows?
- Should soft delete be introduced for gameplay or admin-managed data?
- Should resource instances reference resource templates through a relation instead of type string?
- Which cascades are acceptable for item deletion and character deletion?

## TODO

- [ ] Verify generated table names against the live schema.
- [ ] Review index requirements for character, inventory, resource, creature, and admin queries.
- [ ] Review ownership checks for all user-owned rows.
- [ ] Review cascade safety for destructive operations.
- [ ] Add or verify audit storage for sensitive admin changes.
- [ ] Add or verify schema documentation generated from migrations once migrations exist.
