# Art Direction

Visual style and scale reference for the MMORPG project.

This document defines the rules that govern asset production.
All assets must be consistent with these references.

---

## Asset scale reference

The reference unit for all scale decisions is the adult character sprite.

| Element | Reference size |
|---------|---------------|
| Adult character | ~64 px tall |
| Base terrain tile | 128×64 px canvas |

All textures must be produced to remain readable once cropped inside a 128×64 tile.

Individual elements must never appear oversized relative to the character.
An object that would be knee-height on a character must read as knee-height in the world.

When writing AI prompts, describe the subject at a scale consistent with these references.
Do not describe scale in pixel terms — describe it relative to a human figure or to the environment.

---

## Lighting

A consistent light direction must be used across all assets to ensure visual coherence.

The official light direction reference will be documented in:
`templates/guides/light_direction.png` (to be created).

Until that file exists, apply a top-left light source as the default convention.

---

## Rendering style

Assets must share a consistent rendering style to read correctly together in the world.

- Textures should have moderate contrast — not flat, not overly detailed.
- Colors should remain readable at tile scale (128×64 px).
- Avoid photorealistic rendering that would conflict with the tile-based world scale.
- Avoid pure cartoon or cel-shaded styles unless validated separately.

---

## AI generation rules

- AI generates surface material only: color, grain, roughness, and organic variation.
- AI must never produce tile edges, diamond borders, isometric geometry, or perspective lines.
- The official diamond mask always imposes the final tile shape.
- Generated textures are production intermediates, not final assets.

See `templates/guides/iso_measurements.md` for the official tile geometry.
See `prompts/README.md` for prompt writing rules.

---

## Pipeline reminder

```
AI Texture
↓
High-resolution texture
↓
Official GIMP template (copy)
↓
Official diamond mask
↓
Artistic retouching
↓
PNG export
↓
Tiled
↓
Phaser
```
