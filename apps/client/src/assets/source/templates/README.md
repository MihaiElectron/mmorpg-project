# templates/

Source templates for the isometric tile production pipeline.

All terrain tiles must be composited using the official diamond mask.
AI-generated textures provide seamless surface material only — never final tile geometry.

## Subfolders

| Folder | Purpose |
|--------|---------|
| `gimp/` | Editable GIMP source templates (`.xcf`) |
| `masks/` | Reusable diamond masks — 2:1 isometric ratio, PNG with transparency |
| `guides/` | Visual guides and geometry reference files |

## Expected files (not yet generated)

**gimp/**
- `iso_tile_128x64.xcf` — base tile template with mask and layer guides

**masks/**
- `iso_mask_128x64.png`
- `iso_mask_256x128.png`
- `iso_mask_512x256.png`
- `iso_mask_1024x512.png`

**guides/**
- `iso_grid_128x64.png`
- `iso_grid_256x128.png`
- `iso_measurements.md`

## Rule

No terrain tile should rely on AI-generated geometry.
The AI generates the texture; the diamond mask defines the shape.
