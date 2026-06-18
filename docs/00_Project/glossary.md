# Glossary

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document defines project vocabulary used across the MMORPG repository and documentation.

It focuses on terms observed in documentation, code structure, package configuration, client code, server code, world systems, database documentation, admin tooling, and AI workflow instructions.

It does not introduce new architecture or gameplay rules.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: configured in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

The glossary gives humans and repository-aware coding agents a shared vocabulary before modifying code or documentation.

Definitions marked `Not verified` must not be treated as implemented behavior.

## Project terms

- **MMORPG**: multiplayer online role-playing game project; the repository is a web prototype with React/Vite, Phaser, NestJS, Socket.IO, TypeORM, and PostgreSQL.
- **Project owner**: human authority for scope, validation, trade-offs, commits, and push decisions.
- **Prototype**: current project maturity implied by documentation and status notes; production readiness is Not verified.
- **Monorepo**: repository layout with npm workspaces for `apps/*` and `packages/*`.
- **Workspace**: npm package area declared by the root `package.json`, including `apps/api-gateway`, `apps/client`, and `packages/shared`.
- **Shared package**: `packages/shared`; its complete runtime role is Not verified from the inspected files.
- **Draft**: documentation status meaning the content is incomplete, under review, or still needs verification.
- **Review**: documentation status for material ready to be checked by humans or agents before stabilization.
- **Stable**: documentation status for material considered accepted; current target documents remain Draft.
- **TBD**: placeholder for intentionally undecided or future work.

## Architecture terms

- **Client**: browser application under `apps/client`, built with React, Vite, Phaser, Zustand, and Socket.IO client.
- **Server**: NestJS application under `apps/api-gateway`, exposing HTTP controllers and Socket.IO gateways.
- **Authoritative server**: design principle that game authority should remain on the server; complete enforcement for every gameplay path is Not verified.
- **API gateway**: NestJS backend application that bootstraps HTTP routes, Swagger, CORS, TypeORM, and server modules.
- **Gateway**: in NestJS WebSocket context, a class that handles Socket.IO events such as world, resource, animal, and admin events.
- **HTTP controller**: NestJS class exposing REST routes such as `/auth`, `/characters`, `/inventory`, `/item`, and `/admin`.
- **Module**: NestJS composition unit used to group providers, controllers, and repository registrations.
- **DTO**: data transfer object used for validated request bodies where implemented.
- **CORS**: cross-origin resource sharing configuration applied during NestJS bootstrap.
- **Swagger**: generated HTTP API documentation exposed at `/api/docs`.
- **Socket.IO**: realtime transport used between the client world scene and NestJS gateways.

## Client terms

- **React**: UI framework used by the client application.
- **Vite**: client build and dev server tool configured by the `client` package scripts.
- **Phaser**: browser game engine used for the world scene, sprites, input, and camera behavior.
- **Zustand**: client state library used by stores such as character, action panel, item, and admin stores.
- **World page**: React page that creates the Socket.IO connection and Phaser game instance.
- **World scene**: Phaser scene responsible for map display, player/world interaction, and realtime updates.
- **Action panel**: React UI shown for selected resources, animals, or remote players; also contains an admin console when browser display logic says the user is admin.
- **Character layout**: React UI that displays character, inventory, and admin tabs.
- **Admin panel**: React UI that displays admin overview, grouped creature/resource sections, player section, command console, and drag-to-map controls.
- **Client role display**: browser-decoded JWT role used to show admin UI; this is not server authorization.
- **Local storage token**: bearer token stored by the browser client; token theft protection is Not verified.

## Server terms

- **NestJS**: server framework used by `apps/api-gateway`.
- **TypeORM**: object-relational mapper used by the API gateway to access PostgreSQL entities.
- **PostgreSQL**: primary relational database configured for local development through Docker Compose and TypeORM.
- **Repository**: TypeORM data access object injected into services.
- **Service**: NestJS provider containing domain logic such as auth, world, animals, resources, or admin behavior.
- **Guard**: NestJS authorization/authentication mechanism, including `JwtAuthGuard` and `RolesGuard`.
- **JWT strategy**: Passport strategy that validates bearer JWTs and maps claims to request user data.
- **WebSocket handler**: method decorated with `@SubscribeMessage` to process a Socket.IO event.
- **Broadcast**: server emission to connected Socket.IO clients; room- or zone-scoped broadcasting is Not verified globally.
- **Healthcheck**: operational endpoint for service health; dedicated implementation is Not verified.

## Security terms

- **JWT**: JSON Web Token returned by login and used as bearer authentication for HTTP and Socket.IO.
- **Bearer token**: credential sent in `Authorization: Bearer <token>` or socket auth; real token values must never be documented.
- **Role**: user role value such as `player` or `admin`.
- **Admin**: elevated role used by guarded HTTP routes and observed admin socket checks.
- **Authentication**: proving a request or socket presents an accepted JWT.
- **Authorization**: proving an authenticated actor may perform a specific action.
- **Role guard**: server-side check comparing required route roles against authenticated user role.
- **Client-server trust boundary**: rule that the browser is untrusted and server validation is required.
- **Ownership check**: server verification that a user owns or may access a resource; complete coverage is Not verified.
- **Payload validation**: server-side validation of request or event data before side effects.
- **Rate limiting**: protection against excessive requests or events; Not verified globally.
- **Replay protection**: protection against resending previously valid commands; Not verified.
- **Audit log**: durable record of sensitive actions; admin audit logging is Not verified.
- **Revocation**: invalidation of issued credentials or connected sessions; JWT and connected admin session revocation are Not verified.

## World and map terms

- **Tiled**: map editor associated with map and collision documentation.
- **Map**: world layout loaded by the client; server-authoritative map enforcement is Not verified for every rule.
- **Tileset**: image or data source used by Tiled maps for tile graphics and properties.
- **Tile**: individual map cell or rendered map unit.
- **Isometric**: map projection style referenced by world/map documentation.
- **Collision**: blocked or constrained movement area; complete server-side collision enforcement is Not verified.
- **Mobility**: whether a tile or destination can be traversed; client-side mobility alone is not authoritative.
- **Chunk**: partition of a world map or world data; full server-authoritative chunk implementation is Not verified.
- **Resource**: harvestable world entity such as a tree or ore resource.
- **Resource template**: database-backed resource type definition with default remaining loot count.
- **Loot**: reward or item output generated by server-side resource or gameplay interactions where implemented.
- **Inventory**: character-owned item storage exposed by inventory HTTP routes.
- **Item**: database-backed object with type, category, and optional combat fields.
- **Animal**: creature instance in the world with state, health, position, and template relation.
- **Creature template**: reusable creature definition for base stats and behavior parameters.
- **Spawn**: stored location/template configuration used to create or reset animal instances.
- **Respawn**: return of a dead or reset entity to a live state or spawn position.
- **Teleportation**: admin action that moves a connected character or selected animal to target coordinates.

## Database terms

- **Entity**: TypeORM class mapped to a database table.
- **Schema**: database structure made of tables, columns, relations, and constraints; complete production schema governance is Not verified.
- **Migration**: versioned database change; production migration workflow is Not verified.
- **Synchronize**: TypeORM schema synchronization option; observed as configured and requiring production review.
- **Seed**: startup or setup process that inserts default data where implemented.
- **Primary key**: unique identifier for a database row.
- **Foreign key**: relation between database rows; complete constraint coverage is Not verified.
- **Relation**: TypeORM association loaded between entities such as templates, spawns, characters, inventory, and items.
- **Docker Compose**: local infrastructure definition for PostgreSQL, Redis, and RabbitMQ.
- **Redis**: local Docker service present in infrastructure; active application usage is Not verified.
- **RabbitMQ**: local Docker service present in infrastructure; active application usage is Not verified.

## Admin terms

- **Admin tool**: client and server admin surface documented in `docs/07_Admin/admin-tool.md`.
- **Admin command**: slash command parsed by the client admin console and mapped to local or Socket.IO behavior.
- **Admin event**: Socket.IO event prefixed with `admin:` and handled by `AdminGateway`.
- **Admin overview**: HTTP data showing counts for templates, spawns, and active animals.
- **Grouped section**: admin panel section with a group/template level and an instance level.
- **Flat section**: admin panel section with a single list, observed for players.
- **Dirty field**: admin UI field whose draft value differs from the loaded value.
- **Drag-to-map**: admin panel interaction that resolves canvas coordinates and emits spawn or teleport events.
- **Delete action**: admin socket action for animals or resources; audit and idempotence are Not verified.
- **Fine-grained permission**: permission below the single admin role; Not verified.

## Workflow terms

- **Repository-aware coding agent**: tool or assistant that can inspect and modify repository files it can actually access.
- **Conversational assistant**: assistant used for clarification, planning, review, or prompt preparation; repository access must not be assumed.
- **Human validation**: project owner review and acceptance before important changes, commits, or pushes.
- **Out-of-scope file**: file not explicitly allowed by the current task.
- **Targeted commit**: commit containing only the file or files requested for that task.
- **Push**: publishing commits to a remote; must not happen without explicit human approval.
- **Review checklist**: workflow document used before validation, commit, or delivery.
- **Conventional Commit**: commit message style using `type(scope): description`.

## Naming conventions

- **Package names**: observed npm workspace names include `api-gateway` and `client`.
- **Route names**: HTTP routes use lower-case path segments such as `/auth/login`, `/characters`, and `/admin/overview`.
- **Socket event names**: realtime events use snake_case or colon-separated prefixes such as `admin:spawn` and `resource_update`.
- **Environment variable names**: configuration names are uppercase with underscores, such as `JWT_SECRET`, `DB_HOST`, and `VITE_API_URL`.
- **Documentation file names**: documentation files use lower-case kebab-case where observed.
- **Commit messages**: documentation workflow expects French Conventional Commits with a scope when commits are requested.

## Known gaps

- Some terms describe intended boundaries and must not be read as complete implementation.
- Production readiness is Not verified.
- Complete test coverage is Not verified.
- Complete migration workflow is Not verified.
- Complete ownership checks are Not verified.
- Complete admin audit and traceability are Not verified.
- Complete client-server anti-cheat enforcement is Not verified.

## Review checklist

- [ ] Terms are based on observed code or documentation.
- [ ] `Not verified` is used for unproven behavior.
- [ ] No term introduces a new mechanism.
- [ ] No real secret, token, password, or hash is documented.
- [ ] Security boundary terms do not imply client trust.
- [ ] Workflow terms remain aligned with project rules.

## Non-goals

- This document does not replace architecture documents.
- This document does not define new gameplay mechanics.
- This document does not define a database schema.
- This document does not document deployment infrastructure.
- This document does not document real credentials or real token values.

## Security notes

Glossary entries may name secret-bearing variables, but must never include real values, copied environment files, bearer tokens, password examples, or password hashes.

Security-sensitive terms should preserve the distinction between client display logic and server authorization.

## Related files

- [Documentation Index](../README.md)
- [Architecture Overview](../01_Architecture/overview.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Realtime Socket.IO](../01_Architecture/realtime-socketio.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Authentication JWT](../02_Security/authentication-jwt.md)
- [Admin Permissions](../02_Security/admin-permissions.md)
- [React Vite](../03_Client/react-vite.md)
- [Phaser World](../03_Client/phaser-world.md)
- [Zustand State](../03_Client/zustand-state.md)
- [NestJS API Gateway](../04_Server/nestjs-api-gateway.md)
- [Server WebSockets](../04_Server/websockets.md)
- [Server Modules](../04_Server/modules.md)
- [TypeORM](../04_Server/typeorm.md)
- [World Assets](../05_World/assets.md)
- [World Chunks](../05_World/chunks.md)
- [Maps and Collisions](../05_World/maps-and-collisions.md)
- [Tiled](../05_World/tiled.md)
- [PostgreSQL](../06_Database/postgresql.md)
- [Database Schema](../06_Database/schema.md)
- [Database Migrations](../06_Database/migrations.md)
- [Admin Tool](../07_Admin/admin-tool.md)
- [AI Assistant Workflow](../09_Workflow/ai-assistant-workflow.md)
- [Documentation Guidelines](../09_Workflow/documentation-guidelines.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [README.md](../../README.md)
- [CLAUDE.md](../../CLAUDE.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should the glossary include only documented terms, or also common code terms used in file names?
- Should unstable feature names be removed until implementation is complete?
- Should admin command names be documented here or only in the admin tool document?
- Should workflow roles list specific assistant products or remain product-neutral?

## TODO

- [ ] Review glossary terms after each major documentation batch.
- [ ] Mark newly implemented terms as verified only after code inspection.
- [ ] Remove terms that no longer appear in code or documentation.
- [ ] Keep security-sensitive entries free of real credential material.
