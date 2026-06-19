# Isometric Tile Geometry — Official Specification

This document is the single source of truth for tile geometry in this project.
All masks, GIMP templates, and AI texture prompts must conform to these measurements.

---

## Base tile size

| Property | Value |
|----------|-------|
| Canvas width | 128 px |
| Canvas height | 64 px |
| Isometric ratio | 2:1 (width:height) |
| Canvas background | Transparent |
| Visible shape | Diamond (rhombus) inside the canvas |

---

## Diamond anchor points — 128×64

| Point | X | Y |
|-------|---|---|
| Top | 64 | 0 |
| Right | 127 | 32 |
| Bottom | 64 | 63 |
| Left | 0 | 32 |

---

## Larger mask sizes

All larger sizes preserve the 2:1 ratio. Scale the anchor points proportionally.

| Canvas | Scale | Top | Right | Bottom | Left |
|--------|-------|-----|-------|--------|------|
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
- Never use AI output directly as a final tile without masking.
