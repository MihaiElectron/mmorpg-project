# Database Migrations

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/06_Database/postgresql.md, docs/06_Database/schema.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the observed migration state for the PostgreSQL and TypeORM setup.

It covers runtime schema synchronization, migration file absence, available scripts, development behavior, production gaps, seed behavior, data safety, security considerations, and performance considerations.

It does not create migrations or define a production migration process as implemented.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: present in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

Database migrations are the controlled way to evolve persistent schema over time.

The current inspected repository uses TypeORM schema synchronization at runtime and does not provide verified production migration files. This document records that state so development convenience is not mistaken for production readiness.

## Migration overview

The root TypeORM configuration enables `synchronize: true`. This means TypeORM can create or adjust schema objects when the server starts.

No migration directory or migration file was found under `apps/api-gateway` during inspection. No npm script named for TypeORM migration execution was observed in the current `apps/api-gateway/package.json`.

Production migration workflow, rollback, migration tests, backup-before-migration, zero-downtime strategy, and destructive-change handling are Not verified.

## Observed migration setup

| Area | Observed setup | Risk or gap | Status |
|---|---|---|---|
| Runtime schema management | `synchronize: true` in TypeORM root configuration | Convenient for development but unsafe as a production migration strategy | Configured / Not verified |
| Migration files | No migration file or migration directory observed under `apps/api-gateway` | No reviewed schema history exists in code | Not verified |
| Migration scripts | No current npm migration script observed in `apps/api-gateway/package.json` | Command path for generation or execution is Not verified | Not verified |
| Entity discovery | Entity file pattern auto-loads `*.entity` files | Schema can change when entities change, without an explicit migration review | Configured |
| Development setup note | Project docs mention synchronization for development and migrations for production | Production process remains future work | Not verified |
| Seeds | Several services seed or upsert initial data during module initialization | Seed reproducibility and production seed governance are Not verified | Implemented / Not verified |
| Rollback | No rollback implementation observed | Recovery from bad schema change is Not verified | Not verified |

## Schema synchronization

`apps/api-gateway/src/app.module.ts` configures TypeORM with `synchronize: true`.

Observed implication:

- entity changes can affect the database at application startup;
- schema changes are not represented as reviewed migration files;
- startup behavior can hide schema drift during development;
- production use would need explicit review and likely a different setting.

This document does not claim synchronization is safe for production.

## Migration files

| File or directory | Purpose | Observed content | Status |
|---|---|---|---|
| `apps/api-gateway/src/**` migration search | Expected place to find source-level migrations if they existed there | No migration files found | Not verified |
| `apps/api-gateway` migration directory search | Expected place to find migration directories if configured there | No migration directory found | Not verified |
| `apps/api-gateway/package.json` | Expected place to find migration scripts if provided as npm commands | No migration command observed | Not verified |
| `apps/api-gateway/ENTITIES_SETUP.md` | Historical or setup documentation | Mentions future migration commands, but matching script was not observed in current package scripts | Not verified |

## Development workflow

| Step | Observed command or behavior | Risk | Status |
|---|---|---|---|
| Start backend in development | `npm run start:dev` is present in the API package | Startup may synchronize schema automatically | Implemented / Not verified |
| Entity changes | Entity auto-loading and synchronization can update schema at runtime | No explicit migration review is required by current config | Configured |
| Initial world data | Resource templates, creature templates, creature spawns, creature instances, and respawn point are seeded or upserted in services | Seed timing and idempotence are partial and service-owned | Implemented / Not verified |
| Local reset | No dedicated database reset script observed | Manual reset process is Not verified | Not verified |
| Migration generation | No supported script observed | Developer command path is Not verified | Not verified |

## Production workflow

| Step | Expected need | Observed implementation | Status |
|---|---|---|---|
| Disable runtime schema synchronization | Prevent uncontrolled startup schema changes | Not implemented in inspected runtime config | Not verified |
| Generate reviewed migrations | Track schema changes as code | No migration files observed | Not verified |
| Run migrations during deploy | Apply schema changes in controlled order | No command or deployment flow observed | Not verified |
| Backup before schema change | Protect data before risky changes | Not observed | Not verified |
| Rollback or forward-fix plan | Recover from failed migration | Not observed | Not verified |
| Test migrations | Verify schema changes against realistic data | Not observed | Not verified |
| Lock concurrent migration execution | Prevent duplicate migration runners | Not observed | Not verified |
| Zero-downtime strategy | Avoid incompatible app and schema rollout | Not observed | Not verified |

## Rollback strategy

Rollback strategy is Not verified.

No down migrations, rollback command, restore procedure, migration tag policy, forward-fix policy, or deployment gate was observed.

Until a reviewed migration workflow exists, destructive schema changes should be treated as high risk.

## Seeds and initial data

Observed seed or startup data behavior:

- `ResourcesService.onModuleInit` upserts resource templates for `dead_tree` and `ore`.
- `CreaturesService.onModuleInit` seeds creature templates, spawns, and creature instances when missing.
- `WorldService.onModuleInit` creates a default respawn point when none exist and updates dead characters to full health at startup.

These are service startup behaviors, not reviewed migration files.

Seed reproducibility, seed ordering, seed rollback, environment-specific seed policy, and production seed governance are Not verified.

## Data safety

Current development synchronization can be useful for rapid iteration, but it does not provide the same auditability as explicit migrations.

Risks to review:

- accidental schema drift;
- destructive entity changes;
- nullable-to-required changes on existing data;
- enum changes;
- relation and cascade changes;
- seed side effects during startup;
- concurrent writes during schema evolution;
- missing restore path.

Backup before migration and restore testing are Not verified.

## Security considerations

- Migration files can expose schema and data assumptions; no migration files were observed.
- Real database credentials must not be committed into migration tooling or documentation.
- Seed code must not embed real secrets or private user data.
- Admin or account data migrations would need explicit review before production use.
- Least-privilege migration execution user is Not verified.
- Audit of schema changes is Not verified.

## Performance considerations

Schema changes can lock tables, rewrite data, invalidate query plans, or add costly indexes.

Because no migration workflow is verified, migration performance testing is also Not verified. Large-table migration behavior, concurrent deployment behavior, index build strategy, and maintenance windows are TBD.

## Verified behavior

- TypeORM root configuration sets `synchronize: true`.
- Entity auto-loading is configured.
- No migration files were found under `apps/api-gateway` during inspection.
- No npm migration script was observed in `apps/api-gateway/package.json`.
- Service startup seed or upsert behavior exists for resource templates, creature data, creature instances, and respawn points.
- Production migration workflow is Not verified.

## Known gaps

- Migration generation: Not verified.
- Migration execution: Not verified.
- Rollback: Not verified.
- Backup before migration: Not verified.
- Production migration workflow: Not verified.
- Migration tests: Not verified.
- Reproducible seed process: Not verified.
- Zero-downtime strategy: Not verified.
- Destructive-change handling: Not verified.
- Concurrent migration lock: Not verified.
- Restore tests: Not verified.
- Schema drift detection: Not verified.

## Review checklist

- [ ] Runtime synchronization is not treated as a production migration process.
- [ ] Every schema change has an explicit migration plan before production.
- [ ] Destructive changes include backup and restore review.
- [ ] New required columns define a safe existing-data strategy.
- [ ] Enum and relation changes are reviewed for compatibility.
- [ ] Seed behavior is separated from migration behavior where appropriate.
- [ ] Migration commands are verified before being documented as available.
- [ ] Rollback or forward-fix plan is documented before release.
- [ ] This document is validated before moving to `Review`.

## Non-goals

- This document does not create migration files.
- This document does not define a complete production deployment process.
- This document does not document real database values.
- This document does not replace schema review.
- This document does not replace backup and restore planning.
- This document does not authorize destructive schema changes.

## Security notes

Never document real credentials, tokens, password hashes, connection strings, copied environment values, or private user data in migration documentation.

Review seed data carefully. Startup seed code must not become a path for inserting sensitive or environment-specific secrets.

## Performance notes

Before production migrations exist, define how large tables, indexes, locks, and long-running changes will be handled. Current migration performance behavior is Not verified.

## Related files

- [Documentation Index](../README.md)
- [PostgreSQL](postgresql.md)
- [Database Schema](schema.md)
- [TypeORM](../04_Server/typeorm.md)
- [NestJS API Gateway](../04_Server/nestjs-api-gateway.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- What migration command and configuration should the project standardize on?
- When should `synchronize: true` be disabled?
- Should startup seed behavior remain in services or move to explicit seed tooling?
- What rollback policy is acceptable for production schema changes?
- What backup and restore checks are required before migrations run?
- How should schema drift be detected?

## TODO

- [ ] Add or verify a TypeORM migration configuration.
- [ ] Add or verify migration generation and execution scripts.
- [ ] Add or verify a rollback or forward-fix policy.
- [ ] Add or verify backup-before-migration procedure.
- [ ] Add or verify migration tests.
- [ ] Review startup seed behavior before production use.
