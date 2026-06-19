# templates/masks/

This folder contains the official isometric diamond masks for the project.

All masks use the official 2:1 isometric ratio (width:height).
They impose the tile geometry. The AI must never be responsible for this geometry.

The PNG canvas is rectangular and transparent.
The visible shape is the diamond inside the canvas.
The diamond has no border and no margin.

## Expected masks

| File | Canvas size | Notes |
|------|-------------|-------|
| `iso_mask_128x64.png` | 128×64 | Base tile size — use for standard terrain tiles |
| `iso_mask_256x128.png` | 256×128 | 2× — higher resolution production |
| `iso_mask_512x256.png` | 512×256 | 4× — high-detail production |
| `iso_mask_1024x512.png` | 1024×512 | 8× — maximum resolution |

All four masks share the same 2:1 ratio and the same relative diamond anchor points.

## Diamond anchor points — 128×64

| Point | Position |
|-------|----------|
| Top | Center of the top edge (64, 0) |
| Right | Center of the right edge (127, 32) |
| Bottom | Center of the bottom edge (64, 63) |
| Left | Center of the left edge (0, 32) |

Larger masks scale these points proportionally.

## Rule

Every terrain tile must use one of these masks as the final clipping shape.
Never rely on AI to produce pixel-perfect isometric geometry.

See `guides/iso_measurements.md` for the full geometry specification.
