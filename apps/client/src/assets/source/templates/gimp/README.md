# templates/gimp/

This folder contains the official GIMP source templates for the project.

These files are the production sources. They are never used directly by the game.

## Expected files

| File | Purpose |
|------|---------|
| `terrain_tile_128x64.xcf` | Base terrain tile template — mask layer, texture layer, grid guides |
| `object_tile.xcf` | Template for interactive objects and resources |
| `resource_tile.xcf` | Template for harvestable resource sprites |
| `building_tile.xcf` | Template for building and structure tiles |

## Workflow

1. Open the `.xcf` file in GIMP.
2. Paste the AI-generated texture onto the texture layer.
3. Apply the official diamond mask from `templates/masks/`.
4. Export the result as PNG.
5. Place the final PNG in `exports/` and then in `apps/client/public/assets/`.

Do not commit exported PNG files here.
Do not commit AI-generated textures here.

See `templates/guides/iso_measurements.md` for the official tile geometry.
