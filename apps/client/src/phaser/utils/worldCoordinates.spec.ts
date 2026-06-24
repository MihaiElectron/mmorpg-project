import { describe, expect, it } from "vitest";

import {
  screenToWorldWU,
  tileToWorldWU,
  worldWUToScreen,
  worldWUToTile,
} from "./worldCoordinates";

describe("worldCoordinates", () => {
  it("convertit screen vers WU puis revient au même pixel", () => {
    const screen = { x: 1064, y: 32 };

    const world = screenToWorldWU(screen.x, screen.y);
    const projected = worldWUToScreen(world.worldX, world.worldY);

    expect(projected).toStrictEqual(screen);
  });

  it("convertit WU vers tile avec 1024 WU par tile", () => {
    expect(worldWUToTile(0, 0)).toStrictEqual({ tileX: 0, tileY: 0 });
    expect(worldWUToTile(1024, 2048)).toStrictEqual({ tileX: 1, tileY: 2 });
    expect(worldWUToTile(65535, 65536)).toStrictEqual({ tileX: 63, tileY: 64 });
  });

  it("convertit tile vers origine WU de la tile", () => {
    expect(tileToWorldWU(0, 0)).toStrictEqual({ worldX: 0, worldY: 0 });
    expect(tileToWorldWU(12, 7)).toStrictEqual({ worldX: 12288, worldY: 7168 });
  });
});
