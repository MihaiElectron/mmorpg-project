# Entity Model

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-21
- Depends on: docs/08_Gameplay/README.md, docs/08_Gameplay/world-model.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the concept of an Entity in the game world.

It defines what all game entities share, and names the specialized entity types that will be described in future documents.

## Entity

An Entity is any object that exists in the game world, occupies a position, and participates in gameplay.

Every Entity has:

- **An identity**: a unique identifier that distinguishes it from all other entities in the World.
- **A logical position**: the location of the entity within a Map, expressed as a position in the world tile grid. An entity always belongs to exactly one Map at a time.
- **A Map**: the Map the entity currently exists in. An entity cannot exist outside a Map.
- **A state**: the current condition of the entity. State determines what the entity can do, what can be done to it, and how it behaves. Common states include alive, dead, inactive, or in transition.
- **A lifecycle**: entities appear, change state over time, and eventually disappear or become inactive. The lifecycle defines these transitions and their conditions.

## Specialized entities

All entities in the game are specializations of the Entity concept. They inherit its identity, position, Map, state, and lifecycle, and add domain-specific rules on top.

The specialized entity types in this project are:

| Type | Description |
|---|---|
| **Player** | A character controlled by a human player. Has stats, inventory, and interacts with the world. |
| **Animal** | A creature controlled by the game. Has behavior (patrol, aggro, flee), stats, and a lifecycle linked to combat and respawn. |
| **NPC** | A non-player character with a defined role (vendor, quest giver, guard). Not controlled by a player. |
| **Resource** | A harvestable object in the world (tree, ore, plant). Has a loot pool and a respawn cycle. |
| **Building** | A static or player-constructed structure in the world. Has state (intact, damaged, destroyed). |
| **Effect** | A temporary entity representing a visual or gameplay effect (area damage, buff zone, environmental hazard). Has a limited lifetime. |

Each specialized entity type will be documented in a dedicated file when its development begins.

## Rules

- Every Entity must belong to a Map. An entity without a Map does not exist in the game world.
- Every Entity has exactly one position at any given time.
- An entity's position and Map are always authoritative on the server. The client displays a representation of these values.
- State transitions are governed by gameplay rules. They are not decided by the client.

## Open questions

- Does a Building have a position (single tile) or an extent (multiple tiles)?
- Can an Entity belong to more than one Map at the same time (e.g., a doorway straddling two Maps)?
- Is an Effect always linked to a source Entity, or can it exist independently?
- What triggers the end of an Entity's lifecycle: explicit deletion, state transition, or time expiry?

## Related files

- [Gameplay README](README.md)
- [World Model](world-model.md)
- [ADR-0002 — Entity Positioning](../01_Architecture/adr/ADR-0002-entity-positioning.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
