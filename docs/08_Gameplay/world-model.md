# World Model

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-21
- Depends on: docs/08_Gameplay/README.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the logical structure of the game world.

It defines what a World, a Map, a Chunk, and a Tile are — as game concepts, independently of any technical implementation.

## World

The World is the totality of the game universe. It is unique. All players, entities, and events exist within the same World.

The World contains one or more Maps.

## Map

A Map is a distinct, bounded area of the World. It has its own name, identity, and spatial extent.

A Map contains a variable number of Chunks arranged in a grid. A Map with 8 columns and 4 rows of Chunks contains 32 Chunks. A Map does not need to be rectangular, but its Chunks always form a regular grid.

Examples of Maps: a starting village, a forest zone, a dungeon level, an open-world region.

A Map is the level of granularity at which a player "enters" or "leaves" an area.

## Chunk

A Chunk is a fixed-size subdivision of a Map. Every Chunk contains exactly **64 × 64 Tiles**.

Chunks allow the World to be managed progressively: a player loads the Chunks near them and unloads those that are far away. The server uses Chunks to limit the scope of updates and events.

All Chunks have the same size. This is a fixed rule of the project.

## Tile

A Tile is the smallest logical unit of the terrain. Every position in the game world corresponds to exactly one Tile.

A Tile can represent different types of terrain: grass, water, stone, path, and so on. It may be walkable or blocked. It may carry properties relevant to gameplay: speed modifier, damage zone, spawn trigger.

A Tile does not represent a pixel or a screen position. It represents a logical unit of game space.

## Hierarchy summary

```
World
└── Map  (variable number of Chunks)
    └── Chunk  (always 64 × 64 Tiles)
        └── Tile  (smallest logical terrain unit)
```

## Relationships

- One World contains one or more Maps.
- One Map contains a variable number of Chunks.
- One Chunk contains exactly 64 × 64 Tiles (4096 Tiles).
- One Tile belongs to exactly one Chunk, which belongs to exactly one Map, which belongs to the World.

## Rules

- The World is unique. There is no concept of parallel worlds or instances at this level.
- Chunk size is invariant. It never changes per Map or per game mode.
- A Tile's position is always expressed relative to the World, not relative to its Chunk alone.
- A Tile has no intrinsic size in pixels. Its visual representation is a rendering concern, not a gameplay concept.

## Open questions

- Can a Map have irregular boundaries (non-rectangular Chunk grids)?
- Can multiple Maps exist simultaneously with players moving between them?
- What is the maximum number of Chunks a single Map can contain?
- Do Tiles carry gameplay properties (walkable, damage) in this model, or is that a layer above?

## Related files

- [Gameplay README](README.md)
- [Entity Model](entity-model.md)
- [World Chunks](../05_World/chunks.md)
- [ADR-0001 — World Coordinate System](../01_Architecture/adr/ADR-0001-world-coordinate-system.md)
