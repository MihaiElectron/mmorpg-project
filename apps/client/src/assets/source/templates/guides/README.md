# templates/guides/

This folder contains the official graphic references for the project.

These files are production aids. They help ensure visual consistency during asset creation.
They are never used in the game runtime.

## Files

| File | Purpose |
|------|---------|
| `iso_measurements.md` | Official geometry specification — canonical reference for all tile production |
| `iso_grid_128x64.png` | Visual isometric grid overlay — base tile size (to be generated) |
| `iso_grid_256x128.png` | Visual isometric grid overlay — 2× tile size (to be generated) |
| `tile_outline_128x64.png` | Diamond outline only — base tile (to be generated) |
| `tile_outline_256x128.png` | Diamond outline only — 2× tile (to be generated) |
| `safe_zone_128x64.png` | Inner safe zone overlay — base tile (to be generated) |
| `light_direction.png` | Official light direction reference for the project (to be generated) |
| `tile_origin.png` | Anchor point and origin reference (to be generated) |

## Usage

Refer to `iso_measurements.md` before writing any AI texture prompt or creating any mask.

Use the grid and outline PNG guides as overlay layers in GIMP to verify tile alignment
before exporting.

All production decisions derive from the geometry defined in `iso_measurements.md`.
