# templates/masks/

Reusable diamond masks for isometric tiles. All masks use a 2:1 ratio (width:height).

The canvas is rectangular and transparent. The visible tile shape is the diamond inside the canvas.

## Available masks (to be generated)

| File | Canvas size | Diamond points |
|------|-------------|----------------|
| `iso_mask_128x64.png` | 128×64 | top(64,0) right(127,32) bottom(64,63) left(0,32) |
| `iso_mask_256x128.png` | 256×128 | scaled ×2 |
| `iso_mask_512x256.png` | 512×256 | scaled ×4 |
| `iso_mask_1024x512.png` | 1024×512 | scaled ×8 |

## Rule

All terrain tiles must use one of these masks as the final clipping shape.
Never rely on AI to produce pixel-perfect diamond geometry.

See `guides/iso_measurements.md` for the full geometry specification.
