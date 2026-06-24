import { describe, expect, it } from "vitest";

import {
  createWalkabilityOverlayTiles,
  getTileDiamondPoints,
} from "./walkabilityOverlay";

describe("walkabilityOverlay", () => {
  it("calcule les quatre points écran d'une tile isométrique", () => {
    expect(getTileDiamondPoints(0, 0)).toStrictEqual([
      { x: 1000, y: 0 },
      { x: 1064, y: 32 },
      { x: 1000, y: 64 },
      { x: 936, y: 32 },
    ]);
  });

  it("génère les données d'overlay depuis une grille walkable", () => {
    const tiles = createWalkabilityOverlayTiles([
      [0, 1],
      [0, 0],
    ]);

    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toMatchObject({ tileX: 0, tileY: 0, walkable: true });
    expect(tiles[1]).toMatchObject({ tileX: 1, tileY: 0, walkable: false });
    expect(tiles[0].points).toHaveLength(4);
  });
});
