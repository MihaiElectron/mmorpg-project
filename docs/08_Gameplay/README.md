# Gameplay Documentation

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-24
- Depends on: docs/README.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Role

This folder is the business reference of the MMORPG.

It describes the concepts of the game, the relationships between those concepts, and the rules that govern them.

It is intentionally independent of any technology by default. Documents whose
scope is the current runtime state may cite route names, UI entry points, or
server/client boundaries when that is required to prevent ambiguity. Detailed
implementation mechanics still belong to the architecture, client, server, or
admin documentation domains.

When a concept is described here, it is described as a game designer would describe it — not as a developer implementing it.

## What belongs here

- Game concepts and their definitions.
- Relationships between concepts (what contains what, what affects what).
- Rules: what can happen, what cannot happen, under what conditions.
- The lifecycle of game entities (how they appear, change state, and disappear).

## What does not belong here

- Database schema or column types.
- API routes or socket events, except when a current-state runtime document
  needs to name the actual boundary used by gameplay.
- Client rendering or Phaser scene logic.
- Server validation code or service methods.
- Any implementation detail.

## Recommended reading order

```text
README.md        ← you are here
↓
world-model.md   ← the structure of the game world
↓
entity-model.md  ← the concept of a game entity
↓
crafting-runtime.md ← runtime crafting through placed stations
↓
(future documents, one per domain when development begins)
```

## Related files

- [Documentation Index](../README.md)
- [World Model](world-model.md)
- [Entity Model](entity-model.md)
- [Crafting Runtime](crafting-runtime.md)
- [Architecture Overview](../01_Architecture/overview.md)
- [ROADMAP](../ROADMAP.md)
