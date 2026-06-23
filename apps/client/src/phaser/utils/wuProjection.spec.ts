import { describe, it, expect } from "vitest";
import { wuToScreen } from "./wuProjection";

describe("wuToScreen", () => {
  it("origine (0,0) → (1000, 0)", () => {
    expect(wuToScreen(0, 0)).toStrictEqual({ x: 1000, y: 0 });
  });

  it("point symétrique sur axe X (wX=wY) → screenX=1000", () => {
    expect(wuToScreen(32768, 32768).x).toBe(1000);
  });

  it("wY=0 : screenX augmente avec worldX", () => {
    const { x } = wuToScreen(16, 0);
    expect(x).toBe(1001); // 1000 + 16/16
  });

  it("wX=0 : screenX diminue avec worldY", () => {
    const { x } = wuToScreen(0, 16);
    expect(x).toBe(999); // 1000 - 16/16
  });

  it("worldX négatif décale screenX vers la gauche", () => {
    expect(wuToScreen(-16, 0).x).toBe(999);
  });

  it("worldY négatif décale screenX vers la droite", () => {
    expect(wuToScreen(0, -16).x).toBe(1001);
  });

  it("produit les mêmes valeurs que la formule inline d'origine", () => {
    const cases = [
      [0, 0],
      [1024, 1024],
      [32768, 16384],
      [65536, 0],
      [0, 65536],
    ] as const;

    for (const [wx, wy] of cases) {
      const expected = {
        x: Math.round(1000 + (wx - wy) / 16),
        y: Math.round((wx + wy) / 32),
      };
      expect(wuToScreen(wx, wy)).toStrictEqual(expected);
    }
  });

  it("arrondi au pixel entier", () => {
    const { x, y } = wuToScreen(1, 0);
    expect(Number.isInteger(x)).toBe(true);
    expect(Number.isInteger(y)).toBe(true);
  });
});
