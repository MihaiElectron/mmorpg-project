# Documentation Index

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Depends on: README.md, CLAUDE.md, STATUS.md
- Used by: Developers, ChatGPT, Codex, documentation tooling

## Scope

This index is the entry point for the durable documentation of the MMORPG
project. The project uses React, Vite, Phaser, Zustand, NestJS, TypeORM,
PostgreSQL, Socket.IO, and Tiled.

Use this document to understand where to start, how the documentation is
organized, which documents exist, what their current status is, and which
sources should be checked when documentation and implementation disagree.

## Recommended reading order

```text
00_Project
01_Architecture
02_Security
03_Client
04_Server
05_World
06_Database
07_Admin
08_Gameplay
09_Workflow
10_AI
```

- `00_Project`: project-level language, glossary, and shared vocabulary.
- `01_Architecture`: global architecture, boundaries, real-time flows, and ADR process.
- `02_Security`: trust model, authentication, authorization, and sensitive data rules.
- `03_Client`: React, Vite, Phaser, and client-side state documentation.
- `04_Server`: NestJS, modules, WebSockets, and TypeORM documentation.
- `05_World`: assets, Tiled maps, collisions, chunks, and world structure.
- `06_Database`: PostgreSQL, schema, and migration documentation.
- `07_Admin`: MMORPG Studio — development platform, DevTools, LiveOps, and admin-specific documentation.
- `08_Gameplay`: game concepts, entity model, world model, and gameplay rules — technology-independent.
- `09_Workflow`: development, documentation, review, and Codex workflow.
- `10_AI`: general rules for ChatGPT, Codex, and other AI assistants.

## Sources of truth

When documents disagree, use this order:

1. The code represents the technical state that is actually implemented.
2. ADRs represent validated architecture decisions.
3. Thematic documentation describes architecture and expected behavior.
4. `STATUS.md` describes the current project state and recent work.
5. `CLAUDE.md` contains existing conventions for assistant-assisted work.
6. `docs/10_AI/golden-rules.md` will contain general rules for AI assistants.

If a contradiction is found:

- Do not invent missing information.
- Check the code.
- Check the ADRs.
- Report the inconsistency.
- Do not silently replace an existing decision.

## Document index

### Root

- [Documentation Index](README.md) - Status: Draft - Canonical index for the documentation tree.

### 00_Project

- [Glossary](00_Project/glossary.md) - Status: Draft - Documentation planned for project, technical, gameplay, world, security, and AI workflow terms.
- [Domain Map](00_Project/domains.md) - Status: Draft - Découpage fonctionnel en 9 domaines (World, Entities, Gameplay, Identity, Networking, Persistence, Assets, DevTools, Infrastructure), dépendances, frontières et règles d'évolution.

### 01_Architecture

- [Architecture Overview](01_Architecture/overview.md) - Status: Draft - Documentation planned for the global project architecture.
- [Client Server Boundaries](01_Architecture/client-server-boundaries.md) - Status: Draft - Documentation planned for client/server responsibilities.
- [Realtime Socket.IO](01_Architecture/realtime-socketio.md) - Status: Draft - Documentation planned for real-time Socket.IO architecture.
- [Architecture Decisions](01_Architecture/decisions.md) - Status: Draft - Documentation planned for architecture decision tracking.
- [Architecture Decision Records](01_Architecture/adr/README.md) - Status: Draft - Documentation planned for the ADR process and templates.
- [ADR-0001 — World coordinate system](01_Architecture/adr/ADR-0001-world-coordinate-system.md) - Decision status: Accepted - Système de coordonnées WU, projection isométrique, CHUNK_SIZE.
- [ADR-0002 — Entity positioning](01_Architecture/adr/ADR-0002-entity-positioning.md) - Decision status: Proposed - Stockage et transmission des positions d'entités.
- [ADR-0003 — Movement authority](01_Architecture/adr/ADR-0003-movement-authority.md) - Decision status: Proposed - Autorité de mouvement client/serveur.
- [ADR-0004 — Runtime-Driven Architecture](01_Architecture/adr/ADR-0004-runtime-driven-architecture.md) - Decision status: Proposed - Pipeline RuntimeSource→Modifier→DerivedStats+Trace comme patron obligatoire pour toute nouvelle mécanique.
- [ADR-0005 — Settlement system boundaries](01_Architecture/adr/ADR-0005-settlement-system-boundaries.md) - Decision status: Proposed - Frontières conceptuelles Settlement / Economy / Crafting / Market / Studio.
- [ADR-0006 — Economy transaction model](01_Architecture/adr/ADR-0006-economy-transaction-model.md) - Decision status: Proposed - Modèle transactionnel candidat pour comptes économiques, ledger, escrow et idempotence.
- [ADR-0007 — Auction house authority](01_Architecture/adr/ADR-0007-auction-house-authority.md) - Decision status: Proposed - Autorité serveur candidate pour ventes fixes, enchères, buyout et expiration.
- [ADR-0008 — City treasury and tax flow](01_Architecture/adr/ADR-0008-city-treasury-tax-flow.md) - Decision status: Proposed - Flux candidat de taxes, trésor de ville, ledger et audit.
- [ADR-0009 — Craft order lifecycle](01_Architecture/adr/ADR-0009-craft-order-lifecycle.md) - Decision status: Proposed - Cycle de vie candidat des commandes de craft différées.

### 02_Security

- [Client Server Trust](02_Security/client-server-trust.md) - Status: Draft - Documentation planned for the client/server trust model.
- [Authentication JWT](02_Security/authentication-jwt.md) - Status: Draft - Documentation planned for JWT authentication.
- [Admin Permissions](02_Security/admin-permissions.md) - Status: Draft - Documentation planned for admin permissions.

### 03_Client

- [React Vite Client](03_Client/react-vite.md) - Status: Draft - Documentation planned for the React and Vite client.
- [Phaser World Client](03_Client/phaser-world.md) - Status: Draft - Documentation planned for the Phaser world client.
- [Zustand State](03_Client/zustand-state.md) - Status: Draft - Documentation planned for Zustand state.

### 04_Server

- [NestJS API Gateway](04_Server/nestjs-api-gateway.md) - Status: Draft - Documentation planned for the NestJS API gateway.
- [Server Modules](04_Server/modules.md) - Status: Draft - Documentation planned for server modules.
- [Server WebSockets](04_Server/websockets.md) - Status: Draft - Documentation planned for server-side WebSockets.
- [TypeORM](04_Server/typeorm.md) - Status: Draft - Documentation planned for TypeORM usage.

### 05_World

- [World Assets](05_World/assets.md) - Status: Draft - Documentation planned for world assets.
- [Tiled](05_World/tiled.md) - Status: Draft - Documentation planned for Tiled usage.
- [Maps And Collisions](05_World/maps-and-collisions.md) - Status: Draft - Documentation planned for maps and collisions.
- [World Chunks](05_World/chunks.md) - Status: Draft - Documentation planned for world chunks.

### 06_Database

- [PostgreSQL](06_Database/postgresql.md) - Status: Draft - Documentation planned for PostgreSQL.
- [Database Schema](06_Database/schema.md) - Status: Draft - Documentation planned for the database schema.
- [Database Migrations](06_Database/migrations.md) - Status: Draft - Documentation planned for database migrations.

### 07_Admin

- [MMORPG Studio — Vision](07_Admin/mmorpg-studio.md) - Status: Draft - Vision et architecture du Studio : deux produits (Runtime / Studio), composants (DevTools, LiveOps, Monitoring, Automation, Validation, Analytics, SDK), profils, contextes de travail.
- [Studio SDK](07_Admin/studio-sdk.md) - Status: Draft - Document fondateur du Studio SDK : couche de médiation entre Runtime et Studio, rôles de l'Adapter, Capability Providers, Inspector, Overlay, Validation, Command et Automation Providers.
- [DevTools — Architecture](07_Admin/devtools-architecture.md) - Status: Draft - Spécification fonctionnelle du DevTools en tant que composant de développement du MMORPG Studio.
- [Admin Tool](07_Admin/admin-tool.md) - Status: Draft - Documentation de l'outil admin legacy (AdminPanel.tsx) — précurseur du Studio.

### 08_Gameplay

- [Gameplay README](08_Gameplay/README.md) - Status: Draft - Role of the gameplay documentation domain.
- [World Object Model](08_Gameplay/world-object-model.md) - Status: Draft - Modèle conceptuel racine du monde : World Object, catégories, capacités, relation Runtime/Studio, Inspector universel, validation.
- [Crafting Runtime](08_Gameplay/crafting-runtime.md) - Status: Draft - Cycle runtime joueur du craft via stations placées, validation serveur WU, erreurs structurées et overlays debug.
- [Entity Architecture](08_Gameplay/entity-architecture.md) - Status: Draft - Architecture conceptuelle des Entities : cycle de vie, identité, localisation, état, capacités, comportements, événements, autorité, visibilité Studio.
- [Resource Architecture](08_Gameplay/resource-architecture.md) - Status: Draft - Architecture conceptuelle des Resources : cycle de vie, loot, transformation, respawn, intégration Studio, lien Resource → Crafting.
- [Resource Runtime Gap Analysis](08_Gameplay/resource-runtime-gap-analysis.md) - Status: Draft - Audit de conformité Resources : écarts entre l'implémentation actuelle et l'architecture conceptuelle, plan de migration incrémental.
- [World Model](08_Gameplay/world-model.md) - Status: Draft - World, Map, Chunk, and Tile concepts — technology-independent.
- [Entity Model](08_Gameplay/entity-model.md) - Status: Draft - Entity concept and specialized entity types.
- [Runtime — Index](08_Gameplay/runtime/README.md) - Status: Draft - Index du sous-répertoire Runtime : EntityRuntime, sources, modifiers, trace, snapshot, Inspector.
- [Runtime Entity](08_Gameplay/runtime/runtime-entity.md) - Status: Draft - Architecture générique EntityRuntime : kinds, identité, contrats EntityRuntimeService, PlayerRuntime première implémentation.
- [Runtime Sources](08_Gameplay/runtime/runtime-sources.md) - Status: Draft - Pipelines de modifiers : RuntimeSource, SourceKind vs SourceType, EquipmentSource, EffectSource, DebugRuntimeSource, buildSources.
- [Runtime Modifiers](08_Gameplay/runtime/runtime-modifiers.md) - Status: Draft - RuntimeModifier, StatKey, ModifierOperation, pipeline flat→%add→%mult, PlayerRuntimeEffect.
- [Runtime Trace](08_Gameplay/runtime/runtime-trace.md) - Status: Draft - RuntimeTrace, StatTrace, ModifierApplication — audit complet du calcul.
- [Runtime Snapshot](08_Gameplay/runtime/runtime-snapshot.md) - Status: Draft - EntityRuntimeSnapshot générique, PlayerRuntimeSnapshot, cohérence interne, règles Studio SDK.
- [Runtime Inspector](08_Gameplay/runtime/runtime-inspector.md) - Status: Draft - RuntimeInspectorPanel, runtimeApi, modifierForm, règles Studio, flux debug.
- [Settlement / Economy Architecture Draft](08_Gameplay/settlement-economy-architecture.md) - Status: Draft - Architecture fonctionnelle candidate du système de ville et d'économie ; non implémenté.
- [Settlement / Economy RFC Review](08_Gameplay/settlement-economy-review.md) - Status: Draft - Revue critique de la RFC Settlement v1, risques, corrections prioritaires et roadmap révisée.
- [Settlement Gameplay Loops](08_Gameplay/settlement-gameplay-loops.md) - Status: Draft - Boucles économiques, métiers, bâtiments, ressources, chaînes de production et audit gameplay.
- [Settlement Functional Specifications](08_Gameplay/settlement-specifications.md) - Status: Draft - Cycles de vie, state machines, permissions, événements métier, invariants et cas limites.
- [Settlement MVP Slicing](08_Gameplay/settlement-mvp-slicing.md) - Status: Draft - Découpage MVP 0 à MVP 7, dépendances, critères de fin et checklists.

### 09_Workflow

- [Development Workflow](09_Workflow/development.md) - Status: Draft - Documentation planned for development workflow.
- [AI Assistant Workflow](09_Workflow/ai-assistant-workflow.md) - Status: Draft - Documentation planned for AI assistant workflow.
- [AI Agent Rules](09_Workflow/ai-agent-rules.md) - Status: Implemented - Checklists operationnelles pour agents IA (regles, checklists par domaine, anti-patterns).
- [Documentation Guidelines](09_Workflow/documentation-guidelines.md) - Status: Draft - Documentation planned for documentation guidelines.
- [Review Checklist](09_Workflow/review-checklist.md) - Status: Draft - Documentation planned for review checklists.

### 10_AI

- [Golden Rules](10_AI/golden-rules.md) - Status: Draft - Règles générales de comportement pour tout agent IA travaillant sur ce projet.
- [Session Workflow](10_AI/session-workflow.md) - Status: Draft - Protocole obligatoire de chaque session IA (14 étapes, lecture, planification, vérification, résumé).
- [Implementation Rules](10_AI/implementation-rules.md) - Status: Draft - Règles d'implémentation concrètes : scope, serveur autoritatif, DTOs, patterns interdits.
- [Architecture Review](10_AI/architecture-review.md) - Status: Draft - Comment analyser et protéger les décisions d'architecture ; décisions WU acquises documentées.
- [Commit Policy](10_AI/commit-policy.md) - Status: Draft - Format Conventional Commits en français, scopes du projet, obligations pré-commit.
- [Project Philosophy](10_AI/project-philosophy.md) - Status: Draft - Principes immuables du projet : vision, philosophie d'architecture, MMORPG Studio, IA, critères de décision.

## Documentation lifecycle

- `Draft`: document in progress, not canonical.
- `Review`: complete proposal waiting for validation.
- `Stable`: validated document usable as a reference.
- `Deprecated`: document that should not be used for new development.
- `Archived`: document kept only for history.

A `Draft` document must not be treated as a final decision.

## Documentation types

- Descriptive documentation explains what exists.
- Architecture documentation explains structure, boundaries, and design intent.
- Security rules document trust, authorization, and sensitive data constraints.
- Development workflow documentation explains how work should be prepared, reviewed, and verified.
- AI assistant rules document how ChatGPT, Codex, or similar assistants should work in this repository.
- ADRs record validated architecture decisions.
- Generated documentation does not exist yet and must not be treated as available.

## Maintenance rules

- Update documentation in the same change as the related code when relevant.
- Do not document behavior as implemented unless it exists.
- Use `TBD` when information is unknown.
- Reference real files in `Related files`.
- Create an ADR for important architecture decisions.
- Avoid duplicating the same information across multiple documents.
- Report contradictions instead of choosing a version arbitrarily.
- Keep sensitive information out of documentation.

## AI assistant entry points

Assistants should start with:

```text
docs/README.md
docs/10_AI/golden-rules.md
docs/09_Workflow/ai-assistant-workflow.md
docs/09_Workflow/review-checklist.md
```

These documents are still `Draft` until their status says otherwise.

## Non-goals

- This index does not document implementation details for React, Phaser, NestJS, TypeORM, PostgreSQL, Socket.IO, or Tiled.
- This index does not replace the code, ADRs, `STATUS.md`, or `CLAUDE.md`.
- This index does not create generated documentation, prompts, scripts, or ADRs.
- This index does not mark any linked document as stable.

## Security notes

- The Phaser client must be treated as untrusted.
- The NestJS server must remain authoritative for gameplay rules.
- Sensitive information and secrets must never be copied into `docs/`.
- `.env` files must never be documented with their real values.

## Performance notes

This document has no runtime impact.

## Related files

- [Root README](../README.md)
- [CLAUDE.md](../CLAUDE.md)
- [STATUS.md](../STATUS.md)
- [AI Golden Rules](10_AI/golden-rules.md)
- [AI Assistant Workflow](09_Workflow/ai-assistant-workflow.md)
- [Review Checklist](09_Workflow/review-checklist.md)

## Open questions

- Should generated documentation be introduced later, and where should it live?
- Should document ownership stay project-level or become domain-specific?
- Which documents should become `Review` or `Stable` first?

## TODO

- [ ] Fill each linked document without changing its status prematurely.
- [ ] Add ADRs only when real architecture decisions need to be recorded.
- [ ] Add links from root project documentation only when the documentation structure is stable enough.
