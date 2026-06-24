import { describe, it, expect } from "vitest";
import Pathfinder from "./pathfinding";

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
