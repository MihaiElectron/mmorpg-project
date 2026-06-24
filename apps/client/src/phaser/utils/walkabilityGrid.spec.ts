import { describe, expect, it } from "vitest";

import {
  createNavGridFromWalkabilityGrid,
  createWalkabilityGridFromMap,
  getWalkabilityAtTile,
  getWalkabilityGridSize,
  getWalkabilityGridStats,
  isTileInWalkabilityGrid,
  isNavCellInNavGrid,
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

describe("createNavGridFromWalkabilityGrid", () => {
  it("retourne une grille vide si walkabilityGrid nulle ou vide", () => {
    expect(createNavGridFromWalkabilityGrid(null)).toEqual([]);
    expect(createNavGridFromWalkabilityGrid(undefined)).toEqual([]);
    expect(createNavGridFromWalkabilityGrid([])).toEqual([]);
  });

  it("génère 8×8 nav cells par tile walkable", () => {
    const nav = createNavGridFromWalkabilityGrid([[0]], 8);
    expect(nav).toHaveLength(8);
    expect(nav[0]).toHaveLength(8);
    expect(nav.flat()).toEqual(Array(64).fill(0));
  });

  it("une tile bloquée génère 64 nav cells bloquées", () => {
    const nav = createNavGridFromWalkabilityGrid([[1]], 8);
    expect(nav.flat()).toEqual(Array(64).fill(1));
  });

  it("tile bloquée au centre d'une grille 3×3 → 64 cells bloquées sur 576 totales", () => {
    const wg: (0 | 1)[][] = [[0, 0, 0], [0, 1, 0], [0, 0, 0]];
    const nav = createNavGridFromWalkabilityGrid(wg, 8);
    expect(nav).toHaveLength(24);
    expect(nav[0]).toHaveLength(24);
    const blocked = nav.flat().filter((v) => v === 1).length;
    expect(blocked).toBe(64);
  });

  it("reflète le bloc 5×5 bloqué dans une map 64×64 → 25×64=1600 nav cells bloquées", () => {
    const wg = Array.from({ length: 64 }, (_, y) =>
      Array.from({ length: 64 }, (_, x): 0 | 1 =>
        x >= 8 && x <= 12 && y >= 8 && y <= 12 ? 1 : 0,
      ),
    );
    const nav = createNavGridFromWalkabilityGrid(wg, 8);
    expect(nav).toHaveLength(512);
    expect(nav[0]).toHaveLength(512);
    const stats = getWalkabilityGridStats(nav);
    expect(stats.blocked).toBe(25 * 64);
    expect(stats.walkable).toBe(512 * 512 - 25 * 64);
  });

  it("isNavCellInNavGrid — même logique que isTileInWalkabilityGrid", () => {
    const nav = createNavGridFromWalkabilityGrid([[0, 0], [0, 0]], 8); // 16×16
    expect(isNavCellInNavGrid(nav, 0, 0)).toBe(true);
    expect(isNavCellInNavGrid(nav, 15, 15)).toBe(true);
    expect(isNavCellInNavGrid(nav, 16, 0)).toBe(false);
    expect(isNavCellInNavGrid(nav, 0, 16)).toBe(false);
    expect(isNavCellInNavGrid(null, 0, 0)).toBe(false);
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
