# World Assets

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/03_Client/phaser-world.md, docs/05_World/maps-and-collisions.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes world-facing client assets observed in `apps/client/public/assets` and related Phaser loading code under `apps/client/src/phaser`.

It covers player sprites, animal sprites, resource sprites, item images used by world events, map-related static files, Phaser preload behavior, runtime usage, trust boundaries, and known production gaps.

It does not define a new asset pipeline and does not treat client assets as gameplay authority.

## Verification labels

- `Implemented`: observed in code or existing files.
- `Configured`: present in project configuration or static file layout.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

World assets provide the browser-visible images and data files used by the Phaser world client. They support rendering, local interaction, visual feedback, and inventory display.

These files are client-side resources. They can help the official client look correct, but they cannot grant rights, loot, position, collision, or any other authoritative gameplay result.

## Asset overview

Observed asset groups:

- Player sprites are stored under `apps/client/public/assets/player`.
- Animal sprites are stored under `apps/client/public/assets/bestiary`.
- Resource and static world sprites are stored under `apps/client/public/assets/sprites`.
- Item images are stored under `apps/client/public/assets/images/items`.
- Map-related files are stored under `apps/client/public/assets/maps`.
- Phaser map helper files also exist under `apps/client/src/phaser/map`.

The active world scene mainly renders direct Phaser objects. Full tilemap rendering from the observed map files is Not verified.

## Asset inventory

| Asset category | Location | Used by | Purpose | Status |
|---|---|---|---|---|
| Player sprites | `apps/client/public/assets/player/player_male_32x64.png`, `apps/client/public/assets/player/player_female_32x64.png` | `PreloadScene`, `WorldScene`, `Player` | Render local and remote player sprites by sex | Implemented |
| Animal sprites | `apps/client/public/assets/bestiary/turkey_32.png`, `apps/client/public/assets/bestiary/turkey_64.png` | `PreloadScene` loads `turkey_32.png`; `WorldScene` uses texture key `turkey` or fallback | Render observed animal data; `turkey_64.png` active use is Not verified | Implemented / Not verified |
| Resource sprites | `apps/client/public/assets/sprites/dead_tree.png` | `PreloadScene`, `WorldScene.renderResources` | Render resource targets and fallback resource texture | Implemented |
| Static world sprite | `apps/client/public/assets/sprites/fire_camp.png` | `PreloadScene`, `WorldScene.create` | Render the campfire at observed coordinates | Implemented |
| Item images | `apps/client/public/assets/images/items/*.png` | `PreloadScene` loads `wooden_stick`; world loot update paths may reference item image fields | Display item or loot images in client UI/cache paths | Implemented / Not verified |
| Map image | `apps/client/public/assets/maps/Grass_03_64w.webp` | No active loader observed in `PreloadScene` | Possible map or tileset image asset | Not verified |
| Map JSON | `apps/client/public/assets/maps/world.json` | No active loader observed; file exists and is empty | Possible exported world map placeholder | Not verified |
| Public collision JSON | `apps/client/public/assets/maps/collisions.json` | No active loader observed in `WorldScene` | Possible public collision data | Not verified |
| Phaser collision JSON | `apps/client/src/phaser/map/collisions.json` | `MapLoader` imports it | Collision index list for helper-based tilemap setup | Implemented / Not verified |
| Tileset descriptors | `apps/client/src/phaser/map/tiles.tsx`, `apps/client/src/phaser/map/tileset_spawn.tsx` | No active import observed | Tiled tileset descriptor files | Not verified |

## Asset locations

| Path | Content type | Loader or consumer observed | Notes | Status |
|---|---|---|---|---|
| `apps/client/public/assets/player/` | PNG sprites | `PreloadScene.load.image` | Contains male and female 32x64 player images | Implemented |
| `apps/client/public/assets/bestiary/` | PNG sprites | `PreloadScene.load.image` for `turkey_32.png` | Contains 32px and 64px turkey images; only 32px active load was observed | Implemented / Not verified |
| `apps/client/public/assets/sprites/` | PNG sprites | `PreloadScene.load.image`; `WorldScene` creates images | Contains `fire_camp.png` and `dead_tree.png` | Implemented |
| `apps/client/public/assets/images/items/` | PNG item images | `PreloadScene.load.image` for `wooden_stick`; loot display may use item image paths | Contains `casque`, `earring`, and `wooden_stick` images | Implemented / Not verified |
| `apps/client/public/assets/maps/` | WebP and JSON map files | Active runtime loading was not observed | `world.json` is present but empty; collision JSON exists | Not verified |
| `apps/client/src/phaser/map/` | JS helper, JSON, TSX descriptors | `MapLoader` consumes local collision JSON | Helper exists, but active `WorldScene` use is Not verified | Implemented / Not verified |

## Phaser loading

`apps/client/src/phaser/core/PreloadScene.js` shows a loading text and progress bar, then loads:

- `player_male_32x64` from `/assets/player/player_male_32x64.png`;
- `player_female_32x64` from `/assets/player/player_female_32x64.png`;
- `fire_camp` from `/assets/sprites/fire_camp.png`;
- `dead_tree` from `/assets/sprites/dead_tree.png`;
- `turkey` from `/assets/bestiary/turkey_32.png`;
- `wooden_stick` from `/assets/images/items/wooden_stick.png`.

Preloading of all images under `public/assets` is Not verified. Fallback behavior for missing assets is Not verified except for texture-key fallbacks observed in `WorldScene` for resources and animals.

## Tilesets and sprites

Player, animal, resource, item, and campfire images are used as direct Phaser image or sprite textures in the active world path.

Tileset-related files are present:

- `apps/client/public/assets/maps/Grass_03_64w.webp`;
- `apps/client/src/phaser/map/tiles.tsx`;
- `apps/client/src/phaser/map/tileset_spawn.tsx`.

The active `WorldPage.jsx` scene list uses `PreloadScene` and `WorldScene`. Active loading of tilesets, active Tiled layer rendering, and active use of these tileset descriptors were Not verified.

## Generated and hand-made assets

The repository contains static asset files committed under `apps/client/public/assets` and static map helper files under `apps/client/src/phaser/map`.

Final asset authorship, generated-versus-hand-made classification, source image ownership, export automation, compression policy, atlas generation, and production cache versioning are Not verified.

## Runtime usage

| Runtime usage | Asset source | Client behavior observed | Server authority implication | Status |
|---|---|---|---|---|
| Local player rendering | Player sprite selected by character sex | `WorldScene` creates `Player` with male or female texture | Visual only; server owns accepted character state | Implemented |
| Remote player rendering | Player sprites | `WorldScene` creates tinted remote sprites and name labels | Visual only; remote player data comes from server events | Implemented |
| Campfire rendering | `fire_camp` texture | `WorldScene` creates a static image at observed coordinates | No gameplay authority observed | Implemented |
| Resource rendering | Resource type texture or `dead_tree` fallback | `WorldScene.renderResources` creates interactive resource images | Resource availability and loot must remain server-side | Implemented |
| Animal rendering | Animal type texture or `turkey` fallback | `WorldScene.upsertAnimal` creates and updates animal images | Combat, health, cooldowns, and position-sensitive effects must remain server-side | Implemented |
| Loot and inventory display | Item image path from server event or local path fallback | `resource_loot` and `inventory_update` update local display cache | Display only; inventory authority is server-side | Implemented / Not verified |
| Map display | `world.json`, map WebP, tileset descriptors | Active map rendering was not observed | Client map files are not authoritative | Not verified |
| Collision display or pathing | Collision JSON and pathfinding helper | Helper code exists; active scene wiring is Not verified | Client collision files must not grant movement rights | Not verified |

## Security boundaries

Client assets are modifiable by the user. A modified browser can replace PNG files, JSON files, tilesets, sprites, or locally cached asset responses.

An asset or sprite must never determine a gameplay rule. A client file must not grant rights, loot, position, collision authority, admin permission, or any other sensitive effect.

The server remains responsible for sensitive effects, including resource availability, loot grants, inventory changes, combat, health changes, accepted movement, position persistence, and admin actions.

Client-side visual fallbacks are acceptable for display, but they must not become proof that an entity, item, resource, tile, or collision rule is valid.

## Performance considerations

The active preload list is small. The inspected code does not show an atlas pipeline, lazy loading by area, asset bundles, production CDN cache strategy, texture memory budget, or complete size optimization.

Rendering uses individual Phaser images and sprites for resources, animals, remote players, labels, and bars. Performance with large entity counts or large maps is Not verified.

## Verified behavior

- Static world assets exist under `apps/client/public/assets`.
- `PreloadScene` loads six named image textures from public asset paths.
- `WorldScene` renders the local player, remote players, resources, animals, and campfire with Phaser objects.
- `WorldScene` falls back to `dead_tree` when a resource texture is missing.
- `WorldScene` falls back to `turkey` when an animal texture is missing.
- Loot-related client updates can reference item image paths.
- Map and collision files exist in the repository.
- Active tilemap loading in `WorldScene` was not verified.

## Known gaps

- Final asset pipeline: Not verified.
- Compression and atlas pipeline: Not verified.
- Asset versioning: Not verified.
- Format validation: Not verified.
- Size optimization: Not verified.
- Complete preload coverage: Not verified.
- Fallback behavior for every missing asset: Not verified.
- Asset integrity checks: Not verified.
- CDN or production cache strategy: Not verified.
- Large-world texture memory budget: Not verified.
- Active use of all files in `public/assets`: Not verified.

## Review checklist

- [ ] New assets are stored under an intentional public path.
- [ ] New assets are loaded by a verified Phaser or UI path.
- [ ] New sprites do not imply gameplay authority.
- [ ] Missing-asset behavior is reviewed.
- [ ] Asset size and texture memory impact are reviewed.
- [ ] Item image paths remain display-only.
- [ ] Map and collision files remain non-authoritative on the client.
- [ ] No real secret, token, password, or private data is added to assets or docs.
- [ ] This document is validated before moving to `Review`.

## Non-goals

- This document does not define a final art pipeline.
- This document does not define Tiled map editing rules.
- This document does not define authoritative movement or collision rules.
- This document does not document backend persistence internals.
- This document does not replace asset tests or runtime visual QA.
- This document does not document real secrets or copied environment values.

## Security notes

Keep all asset documentation limited to file names, public paths, and verified behavior. Do not add real credentials, private user data, tokens, passwords, hashes, or copied environment values.

Treat all client-loaded files as untrusted. Server validation must remain the authority for gameplay effects even when the official client renders the expected asset.

## Performance notes

Before scaling the world, review image dimensions, texture count, texture atlases, preload duration, cache headers, and entity count. Current production behavior for asset loading and caching is Not verified.

## Related files

- [Documentation Index](../README.md)
- [Phaser World](../03_Client/phaser-world.md)
- [Maps and Collisions](maps-and-collisions.md)
- [Tiled](tiled.md)
- [Chunks](chunks.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should the active world use direct sprites only, or should tilemap rendering be wired into `WorldScene`?
- Should assets be grouped into atlases before larger maps or entity counts are introduced?
- Should item images be preloaded fully or loaded on demand by UI components?
- Should `world.json` remain as a placeholder if active map loading is not implemented?
- Should production asset versioning be based on Vite output hashing, a CDN strategy, or another mechanism?

## TODO

- [ ] Verify the final asset pipeline.
- [ ] Verify compression and atlas strategy.
- [ ] Verify asset versioning and cache behavior.
- [ ] Verify fallback behavior for missing assets.
- [ ] Verify active use or removal plan for unused map and tileset files.
- [ ] Review texture memory and loading time with realistic entity counts.
