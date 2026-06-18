# Development Workflow

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/09_Workflow/ai-assistant-workflow.md, docs/09_Workflow/review-checklist.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the local development workflow verified from repository files.

It covers repository structure, required tools, environment variable names, install commands, run commands, build commands, test commands, lint and formatting commands, database workflow, documentation workflow, Git workflow, AI-assisted workflow, and safety checks before commit.

It does not invent commands that are not present in `package.json`, `README.md`, Docker Compose, or inspected workflow documentation.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: configured in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

The development workflow gives contributors and repository-aware coding agents a safe path for local work without staging unrelated files or documenting unverified mechanisms.

The project is an npm workspace monorepo with a React/Vite client, a NestJS API gateway, a minimal shared package, and local Docker services.

## Local development overview

The observed local flow is:

1. Install workspace dependencies from the repository root.
2. Start local infrastructure with Docker Compose.
3. Start the NestJS API gateway in watch mode.
4. Start the Vite client dev server.
5. Run targeted build, lint, or test commands before commit.
6. Update documentation when behavior or workflow changes.
7. Stage only in-scope files and create targeted commits when explicitly requested.

Production deployment, release, rollback, and CI workflow are Not verified.

## Repository structure

- `apps/api-gateway`: NestJS backend application.
- `apps/client`: React/Vite frontend application with Phaser world integration.
- `packages/shared`: shared workspace package; complete runtime role is Not verified.
- `docker/docker-compose.yml`: local PostgreSQL, Redis, and RabbitMQ services.
- `docs`: project documentation organized by numbered topic directories.
- `README.md`: project overview, local setup, and useful commands.
- `CLAUDE.md`: assistant/development guidance and commit message expectations.
- `STATUS.md`: current project status and known debt.

## Required tools

| Tool | Purpose | Observed source | Status |
| --- | --- | --- | --- |
| Node.js | Run npm workspaces, NestJS, Vite, tests, and build tools. | `README.md` recommends Node.js 22 or Node.js 20 minimum. | Configured |
| npm | Install dependencies and run workspace scripts. | Root `package.json`, `package-lock.json`, `README.md`. | Configured |
| Docker | Run local infrastructure. | `README.md`, `docker/docker-compose.yml`. | Configured |
| Docker Compose | Start and stop PostgreSQL, Redis, and RabbitMQ. | `README.md`, `docker/docker-compose.yml`. | Configured |
| PostgreSQL | Local database for the API gateway. | `docker/docker-compose.yml`, API TypeORM configuration docs. | Configured |
| Redis | Local service exposed by Docker Compose. | `docker/docker-compose.yml`, `README.md`. Active app usage is Not verified. | Configured |
| RabbitMQ | Local service exposed by Docker Compose. | `docker/docker-compose.yml`, `README.md`. Active app usage is Not verified. | Configured |
| Git | Version control, status checks, targeted staging, and commits. | Workflow docs and repository state. | Configured |

## Environment configuration

Environment variable names are documented without real values.

- Root Docker Compose variables: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.
- API gateway variables: `PORT`, `JWT_SECRET`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`.
- Client variable: `VITE_API_URL`.

Do not document real credentials, bearer tokens, passwords, or hashes. Production environment configuration is Not verified.

## Install commands

| Command | Purpose | Source | Status |
| --- | --- | --- | --- |
| `npm install` | Install dependencies for npm workspaces declared at the repository root. | `README.md`, root `package.json`. | Configured |

No `pnpm` or `yarn` workflow is observed. The repository contains `package-lock.json`, so npm is the expected package manager.

## Run commands

| Command | Target | Purpose | Status |
| --- | --- | --- | --- |
| `docker compose -f docker/docker-compose.yml up -d` | Local infrastructure | Start PostgreSQL, Redis, and RabbitMQ. | Configured |
| `docker compose -f docker/docker-compose.yml down` | Local infrastructure | Stop local Docker Compose services. | Configured |
| `docker compose -f docker/docker-compose.yml logs -f` | Local infrastructure | Follow service logs. | Configured |
| `npm --workspace api-gateway run start:dev` | API gateway | Start NestJS in watch mode. | Configured |
| `npm --workspace api-gateway run start` | API gateway | Start NestJS through `nest start`. | Configured |
| `npm --workspace api-gateway run start:debug` | API gateway | Start NestJS in debug watch mode. | Configured |
| `npm --workspace api-gateway run start:prod` | API gateway | Run `node dist/main`. Requires prior build. | Configured |
| `npm --workspace client run dev` | Client | Start Vite dev server. | Configured |
| `npm --workspace client run preview` | Client | Preview built Vite client. | Configured |

## Build commands

- `npm --workspace api-gateway run build`: builds the NestJS API gateway through `nest build`.
- `npm --workspace client run build`: builds the Vite client through `vite build`.

Root-level build command is Not verified.

## Test commands

| Command | Target | Observed behavior | Status |
| --- | --- | --- | --- |
| `npm --workspace api-gateway run test` | API gateway | Runs Jest. | Configured |
| `npm --workspace api-gateway run test:watch` | API gateway | Runs Jest in watch mode. | Configured |
| `npm --workspace api-gateway run test:cov` | API gateway | Runs Jest coverage. | Configured |
| `npm --workspace api-gateway run test:debug` | API gateway | Runs Jest with Node inspector and ts-node setup. | Configured |
| `npm --workspace api-gateway run test:e2e` | API gateway | Runs Jest with `./test/jest-e2e.json`. | Configured |

Client test command is Not verified. Complete test coverage is Not verified.

## Lint and formatting

- `npm --workspace api-gateway run lint`: runs ESLint on API TypeScript paths with `--fix`.
- `npm --workspace api-gateway run format`: runs Prettier over API `src/**/*.ts` and `test/**/*.ts`.
- `npm --workspace client run lint`: runs ESLint for the client workspace.

Client formatting command is Not verified. Root-level global lint and formatting commands are Not verified.

## Database workflow

Local database infrastructure is started through Docker Compose. The Compose file defines PostgreSQL, Redis, and RabbitMQ services. PostgreSQL uses a persistent Docker volume named `postgres_data`.

The API gateway reads database connection variable names through configuration. TypeORM synchronization is documented elsewhere as configured for development and requiring production review.

Observed related command:

- `npm --workspace api-gateway run make:entity`: runs `ts-node tools/cli/index.ts`.

Not verified:

- Production migration scripts.
- Migration generation command.
- Migration run command.
- Seed command.
- Rollback workflow.
- Production database setup.

## Documentation workflow

Documentation is kept under `docs` and organized by topic directory. Documentation updates must stay within the requested file scope.

When documenting code behavior:

- Read repository files before modifying documentation.
- Mark unproven behavior as `Not verified`.
- Do not copy real environment files or secret values.
- Do not invent mechanisms.
- Keep related-file links aligned with the document scope.
- Keep docs in `Draft` until reviewed.

## Git workflow

| Step | Expected action | Notes | Status |
| --- | --- | --- | --- |
| Check status before work | Run `git status --short`. | Stop or ask if unexpected doc or unknown files are already modified. | Configured |
| Modify only in-scope files | Edit only files named by the task. | Do not mix unrelated code and documentation changes. | Configured |
| Review diff | Run targeted `git diff -- <file>`. | Confirm no unrelated content was added. | Configured |
| Stage targeted files | Use `git add -- <file>`. | Do not use untargeted `git add .` or `git add -A` by default. | Configured |
| Commit only when requested | Create targeted commits after verification. | No automatic commit without explicit user request. | Configured |
| Use French Conventional Commits | Example: `docs(server): documenter les modules NestJS`. | Documentation commits use French description and relevant scope. | Configured |
| Push only after validation | Push after explicit human approval. | No automatic push without explicit instruction. | Configured |

Do not stage out-of-scope files. Do not mix code and docs in the same commit unless the task explicitly requires it.

## AI-assisted workflow

Conversational assistants prepare, clarify, review, and analyze reports. Repository-aware agents inspect the repository, modify allowed files, run checks, and report diffs and Git status. The human validates important decisions and remains the final authority.

Codex or another repository-aware agent must not modify files outside the requested scope. It must not claim a file was analyzed unless it was actually read. It must not push without explicit instruction.

For security, architecture, world, Socket.IO, admin, map, inventory, or permission work, the agent must preserve the principle that the server is authoritative and the client is untrusted.

## Safety checks before commit

- Run `git status --short` before edits.
- Read relevant code and docs before edits.
- Verify target files only.
- Run required greps or checks named by the task.
- Run targeted `git diff -- <file>`.
- Confirm no secret, token, password, or hash value is documented.
- Stage only requested files.
- Check `git diff --cached --name-only` before commit.
- Use the requested commit message when provided.
- Do not push unless explicitly requested.

## Verified behavior

- Root `package.json` declares npm workspaces for `apps/*` and `packages/*`.
- `npm install` is documented as the install command.
- Docker Compose starts PostgreSQL, Redis, and RabbitMQ.
- API gateway scripts include build, start, start:dev, start:debug, start:prod, lint, format, Jest tests, E2E tests, and `make:entity`.
- Client scripts include dev, build, lint, and preview.
- README documents local API and client startup commands.
- Workflow documentation requires status checks and targeted commits.
- Push requires explicit human validation.

## Known gaps

- Complete test coverage: Not verified.
- Global lint: Not verified.
- CI: Not verified.
- Production migration scripts: Not verified.
- Seed commands: Not verified.
- Healthcheck: Not verified.
- Release workflow: Not verified.
- Rollback workflow: Not verified.
- Branch conventions: Not verified.
- Production environment workflow: Not verified.
- Root-level run/build/test scripts: Not verified.

## Review checklist

- [ ] `git status --short` was checked before edits.
- [ ] Only requested files were modified.
- [ ] No out-of-scope files were staged.
- [ ] Required greps and diffs were run.
- [ ] Commands documented here exist in inspected files.
- [ ] Unverified workflows are marked `Not verified`.
- [ ] No real secret, token, password, or hash is documented.
- [ ] Commit messages follow the requested or project format.
- [ ] Push happens only after explicit approval.

## Non-goals

- This document does not define production deployment.
- This document does not define CI configuration.
- This document does not define release or rollback policy.
- This document does not replace package scripts.
- This document does not document real environment values.
- This document does not define coding standards outside the observed workflow.

## Security notes

Use environment variable names only. Never add real credentials, JWT values, password examples, password hashes, or copied `.env` contents.

Local client controls, admin UI visibility, and browser-decoded roles are not authorization. Security-sensitive behavior must be validated on the server.

## Performance notes

Local development commands are not evidence of production performance readiness.

Large database migrations, realtime broadcast scaling, server-side pagination, cache behavior, and observability are Not verified here and must be reviewed in their own documents or tasks.

## Related files

- [Documentation Index](../README.md)
- [AI Assistant Workflow](ai-assistant-workflow.md)
- [Documentation Guidelines](documentation-guidelines.md)
- [Review Checklist](review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [Architecture Overview](../01_Architecture/overview.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [React Vite](../03_Client/react-vite.md)
- [NestJS API Gateway](../04_Server/nestjs-api-gateway.md)
- [PostgreSQL](../06_Database/postgresql.md)
- [Database Migrations](../06_Database/migrations.md)
- [README.md](../../README.md)
- [CLAUDE.md](../../CLAUDE.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should root-level aggregate scripts be added for build, lint, and tests?
- Should production migration commands be added before the project leaves Draft documentation status?
- Should CI requirements be documented once a CI configuration exists?
- Should branch naming conventions be defined?
- Should seed commands be formalized for local development?

## TODO

- [ ] Add or verify production migration workflow.
- [ ] Add or verify CI workflow.
- [ ] Add or verify root-level aggregate scripts if desired.
- [ ] Add or verify client test workflow.
- [ ] Add or verify release and rollback documentation.
- [ ] Add or verify branch naming conventions.
