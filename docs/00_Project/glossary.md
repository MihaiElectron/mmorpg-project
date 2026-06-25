# Glossary

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-24
- Depends on: docs/README.md, docs/ROADMAP.md, docs/08_Gameplay/README.md, docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md, docs/01_Architecture/adr/ADR-0002-entity-positioning.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document is the official vocabulary reference for the MMORPG project.

It covers terms from architecture, gameplay, coordinates, graphics, assets, networking, client, server, database, admin tooling, and workflow.

It does not introduce new architecture or gameplay rules.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: configured in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `Planned concept`: defined in documentation but not yet implemented in code.
- `TBD`: intentionally undecided or future work.

## Purpose

The glossary gives humans and repository-aware coding agents a shared vocabulary before modifying code or documentation.

Definitions marked `Not verified` or `Planned concept` must not be treated as implemented behavior.

---

## Project terms

- **MMORPG**: multiplayer online role-playing game project; the repository is a web prototype with React/Vite, Phaser, NestJS, Socket.IO, TypeORM, and PostgreSQL.
- **Project owner**: human authority for scope, validation, trade-offs, commits, and push decisions.
- **Prototype**: current project maturity; production readiness is Not verified.
- **Monorepo**: repository layout with npm workspaces for `apps/*` and `packages/*`.
- **Workspace**: npm package area declared by the root `package.json`, including `apps/api-gateway`, `apps/client`, and `packages/shared`.
- **Shared package**: `packages/shared`; its complete runtime role is Not verified.
- **Draft**: documentation status meaning the content is incomplete, under review, or still needs verification.
- **Review**: documentation status for material ready to be checked before stabilization.
- **Stable**: documentation status for material considered accepted and usable as reference.
- **TBD**: placeholder for intentionally undecided or future work.

---

## Architecture terms

- **Architecture**: the structural decisions that define how the system is decomposed into components, how those components communicate, and what rules govern their responsibilities. Documented in `docs/01_Architecture/`.
- **ADR**: Architecture Decision Record. A short document that captures a single durable architecture decision, its context, the options considered, and the consequences. ADRs are stored in `docs/01_Architecture/adr/`. Superseded ADRs are kept — a new ADR is created and the old one is marked Superseded.
- **Roadmap**: `docs/ROADMAP.md`. The primary entry point for any new development session. Describes frozen decisions, the active milestone, domain progress, and the parking lot. Consulted before STATUS.md.
- **Status**: `STATUS.md`. Describes the current implementation state: what works, recent changes, and known technical debt. Updated at the end of each session.
- **Domain model**: a model describing the concepts and relationships of a specific domain, independent of any implementation technology. The gameplay domain is documented in `docs/08_Gameplay/`.
- **Gameplay model**: the domain model specific to MMORPG gameplay rules. Describes entities, the world hierarchy, and gameplay rules. Technology-independent. See `docs/08_Gameplay/`.
- **Frozen decision**: a project decision that cannot be reversed without creating a new ADR. Listed in `docs/ROADMAP.md` under Frozen Decisions.
- **Client**: browser application under `apps/client`, built with React, Vite, Phaser, Zustand, and Socket.IO client.
- **Server**: NestJS application under `apps/api-gateway`, exposing HTTP controllers and Socket.IO gateways.
- **Authoritative server**: design principle that game authority remains on the server; the server validates all gameplay-sensitive values regardless of client input. Complete enforcement is Not verified.
- **API gateway**: NestJS backend application that bootstraps HTTP routes, Swagger, CORS, TypeORM, and server modules.
- **Gateway**: in NestJS WebSocket context, a class that handles Socket.IO events such as world, resource, creature, and admin events.
- **HTTP controller**: NestJS class exposing REST routes such as `/auth`, `/characters`, `/inventory`, `/item`, and `/admin`.
- **Module**: NestJS composition unit used to group providers, controllers, and repository registrations.
- **DTO**: data transfer object used for validated request bodies where implemented.
- **CORS**: cross-origin resource sharing configuration applied during NestJS bootstrap.
- **Swagger**: generated HTTP API documentation exposed at `/api/docs`.
- **Socket.IO**: realtime transport used between the client world scene and NestJS gateways.

---

## Coordinate terms

All coordinates in this section are defined by ADR-0001 (Accepted — 2026-06-22). The active world/admin protocol uses WU for player movement and admin placement flows covered by the P0-P6 migration. Some legacy database columns remain as migration debt — see `docs/01_Architecture/wu-migration-audit.md`.

- **World Unit (WU)**: the official server-side position unit. `1 tile = 1024 WU = 2^10 WU`. Defined by ADR-0001, implemented in `world-coordinates.ts`. Stored as `worldX` (integer) and `worldY` (integer). Tile index = `worldX >> 10`; sub-tile offset = `worldX & 1023`.
- **`worldX`**: the X component of the World Unit coordinate. Signed integer (int32). Defined by ADR-0001. Column type `INTEGER` in PostgreSQL. Implemented.
- **`worldY`**: the Y component of the World Unit coordinate. Signed integer (int32). Defined by ADR-0001. Implemented.
- **`mapId`**: identifier of the Map an entity belongs to. Required in every position-bearing entity record and socket payload (phase 2 target for payloads). Defined by ADR-0001 and ADR-0002. Column `INTEGER`, nullable. Implemented for player entities.
- **Logical coordinate**: the server-side numeric position of an entity in the game world. For current WU-aware runtime and admin flows, this is `worldX/worldY/mapId`. Pixel screen coordinates are derived for rendering and must not be treated as gameplay truth.
- **Chunk coordinate** (`chunkX`, `chunkY`): the position of a chunk within a map. Derived: `chunkX = worldX >> 16`, `chunkY = worldY >> 16` (bit-shift by `CHUNK_SHIFT = 16`). Never persisted. Defined by ADR-0001.
- **Local tile coordinate** (`localTileX`, `localTileY`): the position of a tile within its chunk. Derived: `localTileX = (worldX >> 10) & 63`, `localTileY = (worldY >> 10) & 63`. Range 0–63. Never persisted. Defined by ADR-0001.
- **Screen coordinate** (`screenX`, `screenY`): the pixel position of an entity or tile in the Phaser world. Derived by the client using the isometric projection formula. Never persisted. Client-only. Defined by ADR-0001.
- **Isometric projection**: the mathematical transformation applied by the Phaser client to convert World Unit coordinates to screen pixel coordinates. Formula: `screenX = 1000 + (worldX − worldY) / 16`, `screenY = (worldX + worldY) / 32`. Inverse: `worldX = round(8*(screenX−1000) + 16*screenY)`, `worldY = round(−8*(screenX−1000) + 16*screenY)`. Implemented in `world-coordinates.ts`. Defined by ADR-0001.
- **Origin**: the Phaser world pixel position corresponding to the north vertex of tile (0, 0). `WORLD_ORIGIN_X_PX = 1000`, `WORLD_ORIGIN_Y_PX = 0`. Per-map origins are a planned concept. Defined by ADR-0001.
- **`CHUNK_SIZE`**: the constant `64`, representing the number of tiles per side of a chunk (64 × 64 = 4096 tiles per chunk). Invariant of the project. `CHUNK_SIZE_WU = 65 536`. Defined by ADR-0001.

---

## World and map terms

- **World**: the totality of the game universe. Unique. Contains all Maps, entities, and player sessions. The top level of the world hierarchy. Defined in `docs/08_Gameplay/world-model.md`.
- **Map**: a distinct, bounded area of the World identified by a `mapId`. Contains a variable number of Chunks. The level at which a player enters or leaves an area. Defined in `docs/08_Gameplay/world-model.md` and ADR-0001. Server-authoritative map enforcement is Not verified.
- **Chunk**: a fixed-size subdivision of a Map containing exactly 64 × 64 Tiles (`CHUNK_SIZE = 64`). Addressed by `chunkX` and `chunkY` within a Map. Allows progressive world loading and scoped event broadcasting. Full server-side chunk implementation is Planned concept.
- **Tile**: the smallest logical unit of the terrain. Every world position corresponds to exactly one tile. A tile is not a pixel — it represents a logical unit of game space. May carry terrain type and walkability. Defined in `docs/08_Gameplay/world-model.md`.
- **Tileset**: a collection of tile images used by a Tiled map. Authored as `.tsx` files (Tiled Tileset XML) and embedded inline in the TMJ export for Phaser to load at runtime.
- **Layer**: a named grouping of tiles within a Tiled map file. Each layer occupies the same tile grid. Loaded dynamically by name at runtime to resist Tiled renaming on re-export.
- **TMJ**: Tiled Map JSON. The official runtime map format of this project. Exported from Tiled, placed in `public/assets/maps/`. Phaser loads TMJ files via `tilemapTiledJSON`. Tileset data must be inlined — no external TSX reference allowed at runtime.
- **TSX**: Tiled Tileset XML. The official tileset authoring format. A `.tsx` file defines a tileset in Tiled. Authoring artifact only — Phaser does not load TSX files at runtime.
- **Biome**: a region of the world characterized by a distinct terrain type, visual palette, and set of resources or creatures. Planned concept.
- **Spawn**: the creation of an entity instance from a template at a defined world position. Also refers to the stored configuration (`creature_spawn`) that defines where and how an creature instance is created.
- **Spawn point**: a fixed world position (stored in `creature_spawn`) from which an creature instance is created. The creature returns to this point when its patrol leash is exceeded. Distinct from the abstract Spawn concept.
- **Respawn**: the return of a dead or exhausted entity to a live state at a designated position. Characters respawn at the nearest `respawn_point`. Creatures respawn at their `creature_spawn` position after a delay; the scheduled time is persisted as `respawnAt` and reloaded on server restart. Resources follow the same pattern with a configurable `respawnDelayMs`. Implemented.
- **Teleportation**: admin action that moves a connected character or selected creature to target coordinates. Implemented.
- **Resource**: a harvestable world entity (tree, ore, plant). Has a loot pool and a respawn cycle. Implemented.
- **Resource template**: reusable resource type definition with default loot count and default respawn delay (`respawnDelayMs`). Implemented.
- **Loot**: reward or item output generated by server-side resource or gameplay interactions. Implemented for resources.
- **Inventory**: character-owned item storage. Implemented.
- **Item**: database-backed object with type, category, and optional combat fields. Implemented.
- **Crafting recipe**: server-side recipe that consumes ingredients, may produce results, grants skill XP, and declares a `stationType`. Recipes with `stationType = "none"` do not require a station. Recipes with any other `stationType` require a compatible nearby crafting station. Implemented.
- **Crafting station template**: reusable station definition with `key`, `name`, `stationType`, `category`, optional `requiredSkillKey`, `interactionRadiusWU`, and `enabled`. Implemented as `CraftingStationTemplate`.
- **Crafting station**: placed world instance linked to a crafting station template, with `mapId`, `worldX`, `worldY`, and `enabled`. Implemented as `CraftingStation`.
- **`stationType`**: string contract between `CraftingRecipe` and `CraftingStationTemplate`. A recipe requiring `forge` can be crafted only near an enabled station whose template has `stationType = "forge"`. The value `"none"` is reserved for recipes without station requirement.
- **`interactionRadiusWU`**: station interaction radius in World Units. Used server-side to validate runtime craft proximity and client-side only for visual/debug indicators.
- **Creature template**: reusable creature definition for base stats and behavior parameters. Implemented.
- **Collision**: blocked or constrained movement area. Client-side collision helpers exist; server-side authoritative collision is Not verified.
- **Mobility**: whether a tile or destination can be traversed. Client-side mobility is not authoritative.

---

## Gameplay terms

- **Gameplay entity** (game entity): any object that exists in the game world, occupies a logical position, and participates in gameplay. Has an identity, a position (`mapId`, `worldX`, `worldY`), a state, and a lifecycle. Distinct from a TypeORM entity. See `docs/08_Gameplay/entity-model.md`.
- **Player** (gameplay): a gameplay entity controlled by a human player. Has stats, inventory, and interacts with the world. Corresponds to the `character` database entity in the current implementation.
- **Creature**: a gameplay entity controlled by server-side AI. Has states (`alive`, `fighting`, `escaping`, `dead`), patrol behavior, aggro radius, and a respawn cycle. Implemented.
- **NPC**: Non-Player Character. A gameplay entity with a defined role (vendor, quest giver, guard). Not controlled by a player. Planned concept.
- **Building**: a static or player-constructed gameplay entity. Has state (intact, damaged, destroyed). Planned concept.
- **Effect**: a temporary gameplay entity representing an area effect, buff zone, or environmental hazard. Has a limited lifetime. Planned concept.
- **Interaction**: a gameplay action between a player entity and another entity or tile (resource gathering, combat, dialogue). Range is validated server-side by `WorldService.checkInteraction`. Implemented for resources and creatures.
- **Aggro**: the state in which an creature entity has detected a nearby player and switched from patrol to pursuit behavior. Triggers the `fighting` state. Implemented.
- **Patrol**: the idle movement behavior of an creature entity within its patrol radius around its spawn point. Implemented.
- **Leash**: the maximum distance an creature can travel from its spawn point before returning. Implemented.
- **Combat**: the sequence of attack, damage, and state transitions between a player and an creature. Auto-attack is implemented. Full combat system is partial.
- **Auto-attack**: a client-side loop that periodically moves the player toward a targeted creature and emits `attack_creature`. The combat damage is calculated and validated server-side. Implemented.
- **Riposte**: a server-side creature counter-attack that deals damage to the player after the player attacks the creature. Implemented.
- **Cooldown**: a server-enforced minimum delay between repeated actions of the same type (e.g., attack). Prevents spam. Implemented for creature attacks.
- **Gather session**: a server-side tracking record that represents an active resource gathering cycle for one player on one resource. Stored in `ResourcesGateway.gatherSessions`. Cleared on disconnect, target switch, or completion. Implemented.
- **Runtime crafting**: player-facing craft flow from a placed station through `ActionPanel`, compatible recipes, `POST /crafting/craft`, server validation, inventory changes, and skill XP refresh. Implemented.
- **Station reach estimate**: client-side visual hint comparing the locally known player WU position with station WU position and `interactionRadiusWU`. Informational only; it does not block craft and is not authoritative.
- **`CRAFTING_STATION_REQUIRED`**: structured server error code returned when a station-requiring recipe cannot find a usable compatible station context. Implemented.
- **`CRAFTING_STATION_OUT_OF_RANGE`**: structured server error code returned when a compatible station exists but the nearest compatible station is outside its interaction radius. May include `nearestDistanceWU` and `requiredRadiusWU`. Implemented.
- **Health**: numeric value representing an entity's current vitality. Implemented for players and creatures.
- **Hitbox**: the collision shape used to detect whether an entity occupies space for movement or obstacle detection. In Phaser, the local player uses a small Arcade body (20 × 16 px). Client-side only; not authoritative for gameplay. Implemented.
- **Hurtbox**: the area in which incoming attacks or damage zones can connect with a target entity. Not formally distinguished from hitbox in the current implementation; combat range is checked server-side by distance between logical coordinates. Planned concept for explicit distinction.

---

## Graphics and assets terms

- **Texture**: an image file used as the visual source for a tile, sprite, or UI element. At runtime, Phaser loads textures from PNG files via `load.image()`.
- **Sprite**: a textured 2D image displayed in the Phaser world scene for a player, creature, resource, or item. Positioned at screen coordinates derived from server logical coordinates.
- **Sprite sheet**: a single image file containing multiple animation frames or entity states arranged in a grid. Planned concept for most entities.
- **Atlas**: a packed texture containing multiple sprites alongside a JSON frame descriptor. More efficient than individual images for large entity counts. Planned concept.
- **Animation**: a sequence of sprite frames played over time to represent movement, attack, or idle states. Not yet implemented for most entities. Planned concept.
- **Mask**: a PNG image used in the GIMP authoring pipeline to define the boundary shape of a tile (the isometric diamond silhouette). Authoring artifact only; not loaded at runtime.
- **Art direction**: the visual style rules, color palette constraints, and asset authoring guidelines for the project. Documented in `apps/client/src/assets/source/art-direction.md`.
- **GIMP tile template**: a reusable GIMP file containing the isometric diamond shape, guide lines, and mask layers used as a starting point for authoring new tiles. Stored in `apps/client/src/assets/source/templates/`. Distinct from a Creature Template or Resource Template.
- **Prompt** (graphics pipeline): a descriptive text given to an AI image generation tool to produce a source texture for a tile or sprite. Stored in versioned files under `apps/client/src/assets/source/prompts/`. The approved prompt is stored as `approved.md`.
- **Texture key**: the string identifier used to register and retrieve a texture in Phaser (e.g., `"turkey"`, `"tileset_grass"`). Passed to `load.image()` during preload and referenced when creating sprites or tilemaps.
- **Depth** (Phaser rendering): a numeric Z-order value assigned to Phaser game objects to control draw order. Higher values are drawn on top.

---

## Asset terms

- **Runtime asset**: an asset file loaded by Phaser at game startup from `apps/client/public/`. Must be in a format Phaser can load directly (PNG for textures, TMJ for tilemaps). Never sourced from `src/assets/source/`.
- **Source asset** (authoring asset): a file in the authoring workspace (`apps/client/src/assets/source/`) used to create runtime assets. Includes GIMP project files, SVG vectors, working documents, and authoring templates. Not loaded at runtime.
- **Authoring asset**: synonym for Source Asset. An asset used during creation or editing, not at game runtime.
- **Export**: the output of an authoring step converting a source format to a runtime format. Tiled exports produce TMJ files placed in `public/assets/maps/`. GIMP exports produce PNG files placed in `public/assets/maps/tilesets/` or `public/assets/`.
- **Pipeline** (graphics): the ordered sequence of tools used to produce a runtime game asset. The current pipeline is: IA → GIMP → Tiled → Phaser. Documented in `docs/05_World/assets.md`.

---

## Client terms

- **React**: UI framework used by the client application.
- **Vite**: client build and dev server tool.
- **Phaser**: browser game engine used for the world scene, sprites, input, and camera behavior.
- **Zustand**: client state library. Stores are singletons attached to `window.__GLOBAL_*_STORE__` to remain shared between Phaser scenes and React components despite different mount/unmount lifecycles.
- **World page**: React page that creates the Socket.IO connection and Phaser game instance.
- **World scene**: Phaser scene responsible for map display, player and world interaction, and realtime updates.
- **Action panel**: React UI shown for selected resources, creatures, remote players, or crafting stations; contains the admin console when the user is admin and hosts the runtime crafting panel for stations.
- **Character layout**: React UI displaying character, inventory, and admin tabs.
- **Admin panel**: React UI displaying admin overview, entity sections, player list, command console, and drag-to-map controls.
- **Client role display**: browser-decoded JWT role used to show admin UI; not server authorization.
- **Local storage token**: bearer token stored by the browser; token theft protection is Not verified.
- **Pathfinding**: a client-side algorithm that computes a walkable path on a 32 px tile grid between the player and a click target. Used by `PlayerController` when `scene.pathfinder` exists. Falls back to direct steering if absent. Not authoritative — the server does not validate the computed path.
- **Steering**: direct pointer-driven movement where the player moves toward the pointer without computing a path. Used during drag input and auto-attack pursuit. Client-side prediction only.

---

## Server terms

- **NestJS**: server framework used by `apps/api-gateway`.
- **TypeORM**: object-relational mapper used by the API gateway to access PostgreSQL.
- **PostgreSQL**: primary relational database for local development.
- **Repository**: TypeORM data access object injected into services.
- **Service**: NestJS provider containing domain logic.
- **Guard**: NestJS authorization/authentication mechanism, including `JwtAuthGuard` and `RolesGuard`.
- **JWT strategy**: Passport strategy that validates bearer JWTs and places `userId`, `username`, and `role` on the request.
- **WebSocket handler**: method decorated with `@SubscribeMessage` processing a Socket.IO event.
- **Broadcast**: server emission to connected Socket.IO clients. Currently global (`server.emit`). Room-scoped broadcasting is Planned concept.
- **Acknowledgement** (Socket.IO): a callback sent by the server back to the event emitter confirming receipt and result. Used for admin commands with a 5000 ms client-side timeout.
- **Healthcheck**: operational endpoint for service health; dedicated implementation is Not verified.

---

## Security terms

- **JWT**: JSON Web Token returned by login and used as bearer authentication for HTTP and Socket.IO.
- **Bearer token**: credential sent in `Authorization: Bearer <token>` or socket handshake auth.
- **Role**: user role value such as `player` or `admin`.
- **Admin**: elevated role used by guarded HTTP routes and admin socket checks.
- **Authentication**: proving a request or socket presents an accepted JWT.
- **Authorization**: proving an authenticated actor may perform a specific action.
- **Role guard**: server-side check comparing required route roles against authenticated user role.
- **Client-server trust boundary**: rule that the browser is untrusted and server validation is required for all gameplay-sensitive values.
- **Untrusted client**: the security posture applied to all browser clients. Any value emitted by a client (coordinates, damage, inventory, ownership claims) must be validated server-side before producing gameplay effects.
- **Client authority**: the (rejected) assumption that a value reported by the client can be trusted without server validation. This project explicitly rejects client authority for gameplay.
- **Ownership check**: server verification that a user owns or may access a resource; complete coverage is Not verified.
- **Payload validation**: server-side validation of request or event data before side effects.
- **Rate limiting**: protection against excessive requests or events; Not verified globally.
- **Replay protection**: protection against resending previously valid commands; Not verified.
- **Audit log**: durable record of sensitive actions; admin audit logging is Not verified.
- **Revocation**: invalidation of issued credentials or sessions; Not verified.
- **Handshake** (Socket.IO): the initial connection setup where the client sends its JWT in the `auth.token` field. Gateways authenticate the socket during `handleConnection` and disconnect if the JWT is invalid.

---

## Networking terms

- **Server authority**: the principle that the server is the sole source of truth for all gameplay-sensitive values including positions, health, loot, inventory, and permissions. Client values are intentions, not facts.
- **Interest management**: the mechanism that limits event broadcasts to clients within a relevant spatial scope (same chunk or zone). Reduces network load at scale. Currently, all events are broadcast globally. Planned concept. See `docs/05_World/chunks.md`.
- **Prediction**: client-side anticipation of gameplay outcomes before server confirmation. Used for local player movement. Not formally implemented as a reconciliation-backed system. Planned concept.
- **Reconciliation**: the process of correcting client state when the server rejects or overrides a client prediction. Not yet implemented. Planned concept.
- **Room** (Socket.IO): a named group of connected sockets that can receive targeted broadcasts. Not yet implemented for world events. Planned concept.
- **Payload**: the data object carried by a Socket.IO event or HTTP request body. Current WU-migrated movement/admin position payloads use `{ mapId, worldX, worldY }`. Some legacy payloads may still exist outside the migrated paths and must be audited before reuse.
- **Namespace** (Socket.IO): a communication channel that allows multiplexing connections. All observed gateways use the default namespace. No custom namespace is currently in use.
- **Gather tick**: a server-side timer that fires once per resource gathering cycle, re-validates gathering conditions, and grants loot if conditions are met. Implemented.

---

## Database terms

- **TypeORM entity**: a TypeScript class decorated with `@Entity()` and mapped to a database table. Distinct from a gameplay entity. The project auto-detects entity files matching `**/*.entity.{ts,js}`.
- **Schema**: database structure of tables, columns, relations, and constraints.
- **Migration**: a versioned database change script. Production migration workflow is Not verified; `synchronize: true` is used in development.
- **Synchronize**: TypeORM option that auto-applies schema changes at startup. Development only; must not be used in production.
- **Seed**: startup process that inserts default data (creature templates, resource templates, spawn points). Uses insert-or-ignore so that existing rows are never overwritten on restart, preserving admin-edited values. Implemented.
- **Primary key**: unique identifier for a database row.
- **Foreign key**: relational constraint between rows; complete coverage is Not verified.
- **Cascade**: automatic propagation of an operation (update or delete) from a parent entity to related child entities. Used for some character-owned relations.
- **Relation**: TypeORM association between entities (e.g., creature → creature_spawn → creature_template). Implemented.
- **Unique constraint**: a database constraint that prevents duplicate values in one or more columns (e.g., `username`, `template key`, `spawn key`). Implemented for several fields.
- **UUID**: universally unique identifier. Used as primary key type for most entities.
- **Docker Compose**: local infrastructure definition for PostgreSQL, Redis, and RabbitMQ.
- **Redis**: Docker service present in local infrastructure; active application usage is Not verified.
- **RabbitMQ**: Docker service present in local infrastructure; active application usage is Not verified.

---

## Admin terms

- **Admin tool**: client and server admin surface documented in `docs/07_Admin/admin-tool.md`.
- **Admin command**: slash command starting with `/` parsed by the client admin console and mapped to local or Socket.IO behavior.
- **Command registry**: the client-side module (`commandRegistry.ts`) that defines command syntax, maps commands to admin action helpers, and powers Tab autocomplete and syntax validation.
- **Admin event**: Socket.IO event prefixed with `admin:` handled by `AdminGateway`.
- **Admin overview**: HTTP data showing counts for templates, spawns, active creatures, connected players, and registered characters.
- **Grouped section**: admin panel section with a template level and an instance level (e.g., creature templates and their live creatures).
- **Flat section**: admin panel section with a single list (e.g., connected players).
- **Dirty field**: admin UI field whose draft value differs from the loaded value; marks that an unsaved change exists.
- **Drag-to-map**: admin panel interaction that resolves canvas coordinates from a Phaser pointer event and emits a spawn or teleport event.
- **Template key**: the unique string identifier for a `CreatureTemplate` or `ResourceTemplate` (e.g., `"turkey"`, `"dead_tree"`). Used in admin commands and spawn events.
- **Spawn key**: the unique string identifier for a `CreatureSpawn` record. Admin-generated in the format `admin_<timestamp>` for admin-spawned creatures.
- **Delete action**: admin socket action for creatures or resources that permanently removes the entity from the database and emits a dead/deleted update event.

---

## Development process terms

- **Runtime**: the state of the application when executing in a browser or server process. Runtime assets are loaded during this phase.
- **Authoring**: the process of creating or editing game content (maps, tiles, sprites, scripts) using dedicated tools (Tiled, GIMP, Claude Code) outside of runtime.
- **Build**: the process of compiling and bundling source files into deployable artifacts. Frontend: `npm run build` in `apps/client` (produces Vite output). Backend: `npm run build` in `apps/api-gateway` (compiles NestJS TypeScript). Run before committing when code changes affect either package.
- **Pipeline** (development): an ordered sequence of tools and steps producing a result. Distinct from the graphics pipeline. See Pipeline (graphics) in Asset terms.
- **Technical debt**: known limitations, shortcuts, or incomplete implementations that must be resolved before production use. Tracked in `STATUS.md` under "Dette technique connue".
- **Refactoring**: restructuring existing code or documentation without changing external behavior, to improve clarity or correctness.
- **Milestone**: a measurable objective defining what "done" looks like for the current focus area. The active milestone is documented in `docs/ROADMAP.md`.

---

## Workflow terms

- **Repository-aware coding agent**: tool or assistant that can inspect and modify repository files it can actually access. Examples: Claude Code, Codex with repository access.
- **Conversational assistant**: assistant used for clarification, planning, review, or prompt preparation; repository access must not be assumed. Examples: Claude (chat), ChatGPT.
- **Human validation**: project owner review and acceptance before important changes, commits, or pushes.
- **Out-of-scope file**: file not explicitly allowed by the current task.
- **Targeted commit**: commit containing only the files requested for that task.
- **Push**: publishing commits to a remote; requires explicit human approval.
- **Review checklist**: workflow document used before validation, commit, or delivery.
- **Conventional Commit**: commit message style using `type(scope): description`. This project uses French descriptions.

---

## Naming conventions

- **Package names**: npm workspace names include `api-gateway` and `client`.
- **Route names**: HTTP routes use lower-case path segments such as `/auth/login`, `/characters`, and `/admin/overview`.
- **Socket event names**: realtime events use snake_case or colon-separated prefixes such as `admin:spawn` and `resource_update`.
- **Environment variable names**: uppercase with underscores, such as `JWT_SECRET`, `DB_HOST`, and `VITE_API_URL`.
- **Documentation file names**: lower-case kebab-case.
- **Commit messages**: French Conventional Commits with a scope.

---

## Ambiguous terms — attention required

These terms have multiple meanings in this project and require care when writing or reading documentation:

- **Entity**: means a TypeORM database table class in the server context; means a game object with position and lifecycle in the gameplay context. Always qualify: "TypeORM entity" or "gameplay entity".
- **Template**: means a database-backed type definition (`creature_template`, `resource_template`) in the server context; means a reusable GIMP file in the graphics pipeline context. Always qualify: "creature template", "resource template", or "GIMP tile template".
- **Map**: means a named zone in the world hierarchy (gameplay); can informally mean a JavaScript `Map` data structure in code. Context usually makes the distinction clear.
- **Tile**: means the logical terrain unit (world model); can mean the pixel image for one cell in a tileset (graphics). Qualify as "logical tile" or "tile image" when ambiguous.
- **Spawn**: means the act of creating an entity instance (verb); means the stored `creature_spawn` configuration record (noun). Qualify as "spawn point" for the location concept.
- **Pipeline**: means the graphics production sequence (IA → GIMP → Tiled → Phaser) in the graphics context; means the build or CI process in a development context. Qualify as "graphics pipeline" or "build pipeline".

---

## Glossary maintenance

This glossary is the official vocabulary reference for the project.

Rules:

- Any new business concept introduced in code or documentation must be added to this glossary.
- Any new ADR that introduces a term must update this glossary.
- Any new `docs/08_Gameplay/` document that introduces a term must update this glossary.
- Avoid synonyms when an official term already exists; use the official term.
- All project documentation must use the vocabulary defined in this glossary.

When a term changes meaning or is superseded, update its definition. Do not silently delete terms that were previously documented.

---

## Known gaps

- Coordinate terms (`worldX`, `worldY`, `mapId`, chunk coordinates) are fully defined (ADR-0001 Accepted) and implemented for player entities, creatures, and resources. `character_respawn` and `character_teleport` payloads still use pixel fallback on the client side — see `docs/01_Architecture/wu-migration-audit.md`.
- Production readiness is Not verified.
- Complete test coverage is Not verified.
- Complete migration workflow is Not verified.
- Complete ownership checks are Not verified.
- Complete admin audit and traceability are Not verified.
- Complete client-server anti-cheat enforcement is Not verified.
- Hitbox and Hurtbox are not formally distinguished in the current combat implementation.

---

## Review checklist

- [ ] Terms are based on observed code or documentation.
- [ ] `Not verified` and `Planned concept` are used for unproven or future behavior.
- [ ] No term introduces a new mechanism.
- [ ] No real secret, token, password, or hash is documented.
- [ ] Security boundary terms do not imply client trust.
- [ ] Ambiguous terms section is updated when a new dual-use term is introduced.
- [ ] Glossary maintenance rules are followed after each major session.

---

## Non-goals

- This document does not replace architecture documents.
- This document does not define new gameplay mechanics.
- This document does not define a database schema.
- This document does not document deployment infrastructure.
- This document does not document real credentials or token values.

---

## Security notes

Glossary entries may name secret-bearing variables but must never include real values, copied environment files, bearer tokens, password examples, or password hashes.

Security-sensitive terms must preserve the distinction between client display logic and server authorization.

---

## Related files

- [Documentation Index](../README.md)
- [ROADMAP](../ROADMAP.md)
- [STATUS.md](../../STATUS.md)
- [Gameplay README](../08_Gameplay/README.md)
- [World Model](../08_Gameplay/world-model.md)
- [Entity Model](../08_Gameplay/entity-model.md)
- [ADR-0001 — World Coordinate System](../01_Architecture/adr/ADR-0001-world-coordinate-system.md)
- [ADR-0002 — Entity Positioning](../01_Architecture/adr/ADR-0002-entity-positioning.md)
- [Architecture Overview](../01_Architecture/overview.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Realtime Socket.IO](../01_Architecture/realtime-socketio.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Phaser World](../03_Client/phaser-world.md)
- [Server WebSockets](../04_Server/websockets.md)
- [World Assets](../05_World/assets.md)
- [World Chunks](../05_World/chunks.md)
- [Maps and Collisions](../05_World/maps-and-collisions.md)
- [Tiled](../05_World/tiled.md)
- [Database Schema](../06_Database/schema.md)
- [Admin Tool](../07_Admin/admin-tool.md)
- [AI Assistant Workflow](../09_Workflow/ai-assistant-workflow.md)
- [Golden Rules](../10_AI/golden-rules.md)

---

## Open questions

- ~~Should `worldTileX` and `worldTileY` appear as top-level entries?~~ — Résolu : le terme officiel est `worldX / worldY` (WU). `worldTileX/Y` était le nom proposé avant ADR-0001; ne pas réintroduire.
- Should admin command names be documented here or only in the admin tool document?
- When Biome is implemented, should it move from "Planned concept" to a dedicated gameplay document?
- Should Hitbox and Hurtbox be formally implemented as distinct concepts or remain informally merged?

---

## TODO

- [x] Mark coordinate terms as Implemented — ADR-0001 Accepted (2026-06-22), Phase 1 WU migration complète. *(fait dans session de clôture Phase 1)*
- [ ] Mark Planned concept terms as Implemented as features are built.
- [ ] Keep security-sensitive entries free of real credential material.
- [ ] Update Ambiguous terms section when a new dual-use term is introduced.
- [ ] Review after each major implementation batch.
