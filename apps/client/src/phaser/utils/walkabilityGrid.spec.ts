import { describe, expect, it } from "vitest";

import {
  createWalkabilityGridFromMap,
  getWalkabilityAtTile,
  getWalkabilityGridSize,
  getWalkabilityGridStats,
  isTileInWalkabilityGrid,
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

  it("marque comme bloquée une tile avec propriété collision:true (convention Tiled TMJ)", () => {
    const layer = {
      getTileAt: (x: number) =>
        x === 0
          ? { properties: { collision: true } }
          : { properties: {} },
    };
    expect(createWalkabilityGridFromMap({ width: 3, height: 1 }, layer)).toStrictEqual([[1, 0, 0]]);
  });

  it("lit la walkability d'une tile sans erreur hors limites", () => {
    const grid = [
      [0, 1],
      [0, 0],
    ];

    expect(isTileInWalkabilityGrid(grid, 1, 0)).toBe(true);
    expect(isTileInWalkabilityGrid(grid, 2, 0)).toBe(false);
    expect(getWalkabilityAtTile(grid, 0, 0)).toBe(true);
    expect(getWalkabilityAtTile(grid, 1, 0)).toBe(false);
    expect(getWalkabilityAtTile(grid, -1, 0)).toBe(null);
  });
});

describe("getWalkabilityGridStats", () => {
  it("retourne 0/0 pour une grille nulle", () => {
    expect(getWalkabilityGridStats(null)).toEqual({ walkable: 0, blocked: 0 });
    expect(getWalkabilityGridStats(undefined)).toEqual({ walkable: 0, blocked: 0 });
    expect(getWalkabilityGridStats([])).toEqual({ walkable: 0, blocked: 0 });
  });

  it("compte correctement walkable et blocked", () => {
    const grid = [
      [0, 0, 1],
      [0, 1, 1],
    ];
    expect(getWalkabilityGridStats(grid)).toEqual({ walkable: 3, blocked: 3 });
  });

  it("grille entièrement walkable", () => {
    const grid = [[0, 0], [0, 0]];
    expect(getWalkabilityGridStats(grid)).toEqual({ walkable: 4, blocked: 0 });
  });

  it("grille entièrement bloquée", () => {
    const grid = [[1, 1], [1, 1]];
    expect(getWalkabilityGridStats(grid)).toEqual({ walkable: 0, blocked: 4 });
  });

  it("reflète les 25 tiles bloquées d'un bloc 5×5 dans une grille 64×64", () => {
    const grid = Array.from({ length: 64 }, (_, y) =>
      Array.from({ length: 64 }, (_, x): 0 | 1 =>
        x >= 8 && x <= 12 && y >= 8 && y <= 12 ? 1 : 0,
      ),
    );
    expect(getWalkabilityGridStats(grid)).toEqual({ walkable: 4071, blocked: 25 });
  });
});
