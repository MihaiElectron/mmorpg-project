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

| Folder | Git tracked | Purpose |
|--------|-------------|---------|
| `templates/` | Yes | Official GIMP templates, diamond masks, SVG vector source, and geometry guides |
| `textures/` | Yes | AI-generated high-resolution textures, organized by category |
| `prompts/` | Yes | Versioned AI prompts per asset |
| `concepts/` | Yes | Exploratory graphic research and unvalidated visual trials |
| `exports/` | **No** | Temporary PNG exports — gitignored, not committed |
| `work/` | **No** | Work-in-progress files — gitignored, not committed |
| `tests/` | **No** | Tiled pipeline tests and graphic experiments — gitignored, not committed |

## Git-ignored folders

Three subfolders are listed in `.gitignore` and are never committed:

- `work/` — in-progress files, scratch files, and intermediate exports that are not yet validated.
- `tests/` — Tiled map tests, pipeline experiments, and non-validated graphic trials.
- `exports/` — temporary PNG exports. Only final, validated assets should be moved to `apps/client/public/assets/`.

Validated and approved assets must always be placed in `apps/client/public/assets/` to be available at runtime.

## Geometry source of truth

`templates/vectors/iso_diamond.svg` is the canonical isometric diamond shape for this project.
All PNG masks are exports derived from this file.

## Art direction

See `art-direction.md` for scale references and visual style rules.
