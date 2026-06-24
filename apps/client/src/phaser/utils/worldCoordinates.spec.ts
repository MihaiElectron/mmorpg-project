import { describe, expect, it } from "vitest";

import {
  screenToWorldWU,
  tileToWorldWU,
  worldWUToScreen,
  worldWUToTile,
  worldWUToNavCell,
  navCellToWorldWU,
  NAV_CELL_SIZE_WU,
  NAV_CELLS_PER_TILE,
  TILE_SIZE_WU,
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

describe("worldCoordinates — nav cells (8×8 par tile, 128 WU)", () => {
  it("NAV_CELL_SIZE_WU = 128 et NAV_CELLS_PER_TILE = 8", () => {
    expect(NAV_CELL_SIZE_WU).toBe(128);
    expect(NAV_CELLS_PER_TILE).toBe(8);
    expect(NAV_CELL_SIZE_WU * NAV_CELLS_PER_TILE).toBe(TILE_SIZE_WU);
  });

  it("convertit WU vers nav cell avec 128 WU par cellule", () => {
    expect(worldWUToNavCell(0, 0)).toStrictEqual({ navX: 0, navY: 0 });
    expect(worldWUToNavCell(128, 256)).toStrictEqual({ navX: 1, navY: 2 });
    expect(worldWUToNavCell(127, 127)).toStrictEqual({ navX: 0, navY: 0 });
    expect(worldWUToNavCell(1024, 2048)).toStrictEqual({ navX: 8, navY: 16 });
  });

  it("convertit nav cell vers origine WU de la cellule", () => {
    expect(navCellToWorldWU(0, 0)).toStrictEqual({ worldX: 0, worldY: 0 });
    expect(navCellToWorldWU(1, 2)).toStrictEqual({ worldX: 128, worldY: 256 });
    expect(navCellToWorldWU(8, 0)).toStrictEqual({ worldX: 1024, worldY: 0 });
  });

  it("round-trip : navCell → WU → navCell", () => {
    const start = { navX: 13, navY: 7 };
    const wu = navCellToWorldWU(start.navX, start.navY);
    const back = worldWUToNavCell(wu.worldX, wu.worldY);
    expect(back).toStrictEqual(start);
  });

  it("1 tile = 8 nav cells consécutives par axe", () => {
    const tileOrigin = tileToWorldWU(1, 0);
    const navStart = worldWUToNavCell(tileOrigin.worldX, tileOrigin.worldY);
    const navEnd = worldWUToNavCell(tileOrigin.worldX + TILE_SIZE_WU - 1, tileOrigin.worldY);
    expect(navStart).toStrictEqual({ navX: 8, navY: 0 });
    expect(navEnd).toStrictEqual({ navX: 15, navY: 0 }); // 8..15 = 8 cellules
  });
});
