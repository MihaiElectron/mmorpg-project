# templates/guides/

Visual guides and geometry reference files for isometric tile production.

## Files

| File | Purpose |
|------|---------|
| `iso_measurements.md` | Official geometry specification — tile sizes, diamond points, ratio rules |
| `iso_grid_128x64.png` | Visual grid overlay for the base tile size (to be generated) |
| `iso_grid_256x128.png` | Visual grid overlay for the 2× tile size (to be generated) |

## Usage

Refer to `iso_measurements.md` before generating any AI texture prompt or
before creating a new mask. All production decisions derive from the base
128×64 tile specification documented there.
