# prompts/

Versioned AI prompts for the graphic production pipeline.

Each asset has its own subfolder containing the history of prompts used to generate textures.
Prompts are never used at runtime.

## Structure

```
prompts/
└── <category>/
    └── <asset-name>/
        ├── README.md     — asset description and production notes
        ├── v1.md         — first prompt attempt
        ├── v2.md         — revised prompt (if needed)
        └── approved.md   — validated and approved prompt
```

## What a prompt must describe

Each prompt file must describe:

- **Material** — surface type, texture, grain, roughness, variation (e.g. dry grass, cracked stone)
- **Scale** — level of detail relative to the tile size and the reference character height (64 px)
- **Artistic style** — lighting direction, color palette, mood, rendering style

A prompt must never describe:

- Tile geometry or isometric shape
- Diamond edges or borders
- Perspective or viewpoint

The AI generates seamless or near-seamless surface textures only.
The official diamond mask imposes the final tile shape.

## Versioning rule

- `v1.md`, `v2.md`, … — draft versions, kept for reference
- `approved.md` — the validated prompt used for the current production version

Do not delete draft versions. They document the iteration history.

## Subfolders

| Folder | Asset category |
|--------|---------------|
| `terrain/` | Ground tiles — grass, dirt, stone, sand, water, snow, lava |
| `resources/` | Harvestable resources — dead tree, ore, fallen branch |
| `decorations/` | Decorative elements — rocks, bushes, stumps |
| `buildings/` | Buildings and structures |
| `characters/` | Character and creature sprites |
