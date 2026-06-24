import { describe, it, expect } from "vitest";
import Pathfinder, { smoothPath } from "./pathfinding";

describe("Pathfinder.findPath", () => {
  it("trouve un chemin sur une grille entièrement walkable", () => {
    const grid = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const pf = new Pathfinder(grid);
    const path = pf.findPath(0, 0, 3, 0);
    expect(path).not.toBeNull();
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 3, y: 0 });
  });

  it("inclut le nœud de départ et le nœud d'arrivée dans le chemin", () => {
    const grid = [[0, 0, 0]];
    const pf = new Pathfinder(grid);
    const path = pf.findPath(0, 0, 2, 0);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 2, y: 0 });
  });

  it("retourne null si la tuile cible est bloquée (valeur 1)", () => {
    const grid = [
      [0, 0, 1, 0],
      [0, 0, 1, 0],
    ];
    const pf = new Pathfinder(grid);
    // (2,0) est bloqué — jamais ajouté à la liste ouverte
    const path = pf.findPath(0, 0, 2, 0);
    expect(path).toBeNull();
  });

  it("retourne null si la cible est hors de la grille", () => {
    const grid = [[0, 0]];
    const pf = new Pathfinder(grid);
    const path = pf.findPath(0, 0, 10, 0);
    expect(path).toBeNull();
  });

  it("retourne un chemin de longueur 1 si départ = arrivée", () => {
    const grid = [[0, 0, 0]];
    const pf = new Pathfinder(grid);
    const path = pf.findPath(1, 0, 1, 0);
    expect(path).toHaveLength(1);
    expect(path[0]).toEqual({ x: 1, y: 0 });
  });

  it("utilise les diagonales pour contourner un obstacle", () => {
    const grid = [
      [0, 1, 0],
      [0, 0, 0],
    ];
    const pf = new Pathfinder(grid);
    // (0,0) → (2,0) : doit passer par la rangée du bas
    const path = pf.findPath(0, 0, 2, 0);
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual({ x: 2, y: 0 });
  });
});

describe("smoothPath", () => {
  it("retourne [] pour path null ou vide", () => {
    expect(smoothPath(null, [[0]])).toEqual([]);
    expect(smoothPath([], [[0]])).toEqual([]);
  });

  it("retourne le path inchangé (même référence) si longueur ≤ 2", () => {
    const grid = [[0, 0, 0, 0, 0]];
    const p1 = [{ x: 0, y: 0 }];
    const p2 = [{ x: 0, y: 0 }, { x: 4, y: 0 }];
    expect(smoothPath(p1, grid)).toBe(p1);
    expect(smoothPath(p2, grid)).toBe(p2);
  });

  it("retourne le path inchangé si grid est null", () => {
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    expect(smoothPath(path, null)).toBe(path);
  });

  it("ligne droite sur grille walkable → réduit à start et end", () => {
    const grid = [[0, 0, 0, 0, 0]];
    const path = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
      { x: 3, y: 0 }, { x: 4, y: 0 },
    ];
    expect(smoothPath(path, grid)).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }]);
  });

  it("obstacle sur la LOS directe → waypoint intermédiaire conservé", () => {
    // col 1 row 0 bloqué — LOS (0,0)→(2,0) traverse (1,0) → bloquée
    const grid = [
      [0, 1, 0],
      [0, 0, 0],
    ];
    // Chemin A* contourne : (0,0) → (0,1) → (1,1) → (2,0)
    const path = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 0 }];
    const result = smoothPath(path, grid);
    // LOS (0,0)→(1,1) libre, LOS (1,1)→(2,0) libre, LOS (0,0)→(2,0) bloquée
    expect(result).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }]);
  });

  it("préserve toujours le premier et le dernier point", () => {
    const grid = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    const path = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 },
      { x: 3, y: 0 }, { x: 4, y: 0 },
    ];
    const result = smoothPath(path, grid);
    expect(result[0]).toEqual(path[0]);
    expect(result[result.length - 1]).toEqual(path[path.length - 1]);
  });

  it("path lissé n'inclut jamais de segment qui traverse une cellule bloquée", () => {
    // Bloc vertical au milieu — seul passage par le bas
    const grid = [
      [0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    // A* : (0,0) → contour bas → (4,0)
    const pf = new Pathfinder(grid);
    const raw = pf.findPath(0, 0, 4, 0);
    expect(raw).not.toBeNull();
    const smoothed = smoothPath(raw, grid);
    // Vérifier que chaque paire consecutive ne traverse pas de cellule bloquée
    // en re-simulant Bresenham entre deux waypoints consécutifs
    for (let i = 0; i < smoothed.length - 1; i++) {
      const { x: x0, y: y0 } = smoothed[i];
      const { x: x1, y: y1 } = smoothed[i + 1];
      // Bresenham simplifié pour vérification
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : x0 > x1 ? -1 : 0;
      const sy = y0 < y1 ? 1 : y0 > y1 ? -1 : 0;
      let err = dx - dy;
      let x = x0;
      let y = y0;
      while (!(x === x1 && y === y1)) {
        expect(grid[y]?.[x]).not.toBe(1);
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
      }
      expect(grid[y1]?.[x1]).not.toBe(1);
    }
  });
});
