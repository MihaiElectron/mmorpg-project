import { describe, expect, it } from "vitest";

import {
  createWalkabilityGridFromMap,
  getWalkabilityGridSize,
} from "./walkabilityGrid";

describe("walkabilityGrid", () => {
  it("génère une grille entièrement walkable si aucune collision n'existe", () => {
    const grid = createWalkabilityGridFromMap({ width: 3, height: 2 });

    expect(grid).toStrictEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(getWalkabilityGridSize(grid)).toStrictEqual({ width: 3, height: 2 });
  });

  it("marque comme bloquées les tiles collides", () => {
    const layer = {
      getTileAt: (x: number, y: number) =>
        x === 1 && y === 0 ? { collides: true } : { collides: false },
    };

    expect(createWalkabilityGridFromMap({ width: 3, height: 1 }, layer)).toStrictEqual([
      [0, 1, 0],
    ]);
  });

  it("supporte les propriétés Tiled futures walkable/collision", () => {
    const layer = {
      getTileAt: (x: number) => {
        if (x === 0) return { properties: { walkable: false } };
        if (x === 1) return { properties: { collision: true } };
        if (x === 2) return { properties: { blocked: true } };
        return { properties: { walkable: true } };
      },
    };

    expect(createWalkabilityGridFromMap({ width: 4, height: 1 }, layer)).toStrictEqual([
      [1, 1, 1, 0],
    ]);
  });
});
