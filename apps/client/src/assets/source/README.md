# assets/source/

Graphic production workspace for the MMORPG project.

This folder is not used by the runtime client and is not served by Vite.
It contains all source files, templates, prompts, and intermediate assets used to produce
the final PNG files that go into `apps/client/public/assets/`.

## Official pipeline

```
AI Texture
↓
High-resolution texture
↓
Official GIMP template
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

## Subfolders

| Folder | Purpose |
|--------|---------|
| `templates/` | Official GIMP templates, diamond masks, SVG vector source, and geometry guides |
| `textures/` | AI-generated high-resolution textures, organized by category |
| `prompts/` | Versioned AI prompts per asset |
| `exports/` | Final PNG files ready for Tiled and Phaser |
| `concepts/` | Exploratory graphic research and unvalidated visual trials |

## Geometry source of truth

`templates/vectors/iso_diamond.svg` is the canonical isometric diamond shape for this project.
All PNG masks are exports derived from this file.

## Art direction

See `art-direction.md` for scale references and visual style rules.
