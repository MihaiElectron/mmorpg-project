# Isometric Tile Geometry — Official Specification

This document is the single source of truth for tile geometry in this project.
All masks, GIMP templates, and AI texture prompts must conform to these measurements.

---

## Base terrain tile

| Property | Value |
|----------|-------|
| Canvas width | 128 px |
| Canvas height | 64 px |
| Isometric ratio | 2:1 (width:height) |
| Canvas background | Transparent |
| Visible shape | Diamond (rhombus) centered in the canvas |
| Border | None |
| Margin | None |

The diamond points touch exactly the center of each side of the canvas:

- Top point: center of the top edge.
- Right point: center of the right edge.
- Bottom point: center of the bottom edge.
- Left point: center of the left edge.

All terrain assets use this geometry.

---

## Diamond anchor points — 128×64

| Point | X | Y | Position on canvas |
|-------|---|---|--------------------|
| Top | 64 | 0 | Center of top edge |
| Right | 127 | 32 | Center of right edge |
| Bottom | 64 | 63 | Center of bottom edge |
| Left | 0 | 32 | Center of left edge |

---

## Supported tile sizes

All sizes preserve the 2:1 ratio and scale the anchor points proportionally.

| Canvas | Scale factor | Top | Right | Bottom | Left |
|--------|-------------|-----|-------|--------|------|
| 128×64 | ×1 | (64, 0) | (127, 32) | (64, 63) | (0, 32) |
| 256×128 | ×2 | (128, 0) | (255, 64) | (128, 127) | (0, 64) |
| 512×256 | ×4 | (256, 0) | (511, 128) | (256, 255) | (0, 128) |
| 1024×512 | ×8 | (512, 0) | (1023, 256) | (512, 511) | (0, 256) |

---

## Rules

- The PNG canvas is always rectangular and fully transparent outside the diamond.
- The diamond is the only opaque region of the mask.
- No AI texture prompt should ask the AI to produce isometric geometry or tile edges.
  AI generates seamless or near-seamless surface textures only.
- The diamond mask is applied in GIMP after AI texture generation.
- Never use AI output directly as a final tile without applying the official mask.
- All terrain tiles use this geometry regardless of surface type.

---

## Future guide files

The following visual reference files are planned and will be created manually:

| File | Purpose |
|------|---------|
| `iso_grid_128x64.png` | Isometric grid overlay — base tile |
| `iso_grid_256x128.png` | Isometric grid overlay — 2× tile |
| `tile_outline_128x64.png` | Diamond outline only — base tile |
| `tile_outline_256x128.png` | Diamond outline only — 2× tile |
| `safe_zone_128x64.png` | Inner safe zone overlay showing the usable area inside the diamond |
| `light_direction.png` | Official light direction reference for texture consistency |
| `tile_origin.png` | Anchor point and tile origin reference |

These files are production aids only. They are never used in the game runtime.
