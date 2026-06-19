# templates/gimp/

Editable GIMP source templates (`.xcf` format).

## Expected files

- `iso_tile_128x64.xcf` — base isometric tile template.
  Contains the diamond mask layer, a placeholder texture layer, and grid guides.

## Usage

Open the `.xcf` file in GIMP, paste the AI-generated texture onto the texture layer,
apply the diamond mask, then export as PNG to `masks/` or `exports/`.

Do not commit exported PNGs here. Place final exports in `client/public/assets/`.
