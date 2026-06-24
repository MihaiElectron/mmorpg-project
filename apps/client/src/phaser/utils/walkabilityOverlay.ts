import {
  tileToWorldWU,
  worldWUToScreen,
  type ScreenPoint,
} from "./worldCoordinates";
import {
  getWalkabilityAtTile,
  getWalkabilityGridSize,
  type WalkabilityGrid,
} from "./walkabilityGrid";

export type WalkabilityTilePolygon = {
  tileX: number;
  tileY: number;
  walkable: boolean;
  points: ScreenPoint[];
};

export function getTileDiamondPoints(tileX: number, tileY: number): ScreenPoint[] {
  const north = tileToWorldWU(tileX, tileY);
  const east = tileToWorldWU(tileX + 1, tileY);
  const south = tileToWorldWU(tileX + 1, tileY + 1);
  const west = tileToWorldWU(tileX, tileY + 1);

  return [
    worldWUToScreen(north.worldX, north.worldY),
    worldWUToScreen(east.worldX, east.worldY),
    worldWUToScreen(south.worldX, south.worldY),
    worldWUToScreen(west.worldX, west.worldY),
  ];
}

export function createWalkabilityOverlayTiles(
  grid: WalkabilityGrid | null | undefined,
): WalkabilityTilePolygon[] {
  const { width, height } = getWalkabilityGridSize(grid);
  const tiles: WalkabilityTilePolygon[] = [];

  for (let tileY = 0; tileY < height; tileY += 1) {
    for (let tileX = 0; tileX < width; tileX += 1) {
      tiles.push({
        tileX,
        tileY,
        walkable: getWalkabilityAtTile(grid, tileX, tileY) === true,
        points: getTileDiamondPoints(tileX, tileY),
      });
    }
  }

  return tiles;
}
