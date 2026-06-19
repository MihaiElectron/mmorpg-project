# templates/

Official production templates for the isometric tile pipeline.

All terrain tiles must be composited using the official diamond mask.
AI-generated textures provide seamless surface material only — never final tile geometry.

## Geometry source of truth

`vectors/iso_diamond.svg` is the canonical source for the isometric diamond shape.
All PNG masks in `masks/` are exports derived from this SVG file.

## Subfolders

| Folder | Purpose |
|--------|---------|
| `gimp/` | Official GIMP source templates (`.xcf`) |
| `masks/` | Reusable diamond masks — 2:1 isometric ratio, PNG with transparency |
| `vectors/` | SVG vector source for the diamond geometry |
| `guides/` | Visual guides and geometry reference files |

## Current files

**gimp/**
- `terrain_tile_128x64.xcf` — official terrain tile template

**masks/**
- `iso_mask_128x64.png` — base terrain tile mask

**vectors/**
- `iso_diamond.svg` — canonical isometric diamond shape (128×64)

## Official GIMP template

`gimp/terrain_tile_128x64.xcf` is the official template.
It must never be used directly to produce a tile.
Every tile is created from a copy of this file.

The template contains two layer groups:

| Group | Layers |
|-------|--------|
| **Artwork** | Texture, Shadows, Highlights, Details |
| **Technical** | Diamond Mask |

The Technical group contains reusable technical elements only.
The Artwork group is replaced for each new tile.

## Rule

No terrain tile should rely on AI-generated geometry.
The AI generates the texture; the official mask defines the shape.
