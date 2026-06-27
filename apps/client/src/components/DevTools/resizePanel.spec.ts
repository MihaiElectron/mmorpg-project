import { describe, expect, it } from "vitest";
import { calculatePanelResize, type ResizeStart } from "./resizePanel";

const START: ResizeStart = {
  corner: "bottom-right",
  startX: 100,
  startY: 100,
  originX: 10,
  originY: 20,
  originWidth: 400,
  originHeight: 300,
};

const BOUNDS = {
  minWidth: 280,
  minHeight: 160,
  maxWidth: 900,
  maxHeight: 700,
};

describe("calculatePanelResize", () => {
  it("agrandit depuis le coin bas droite sans déplacer le panneau", () => {
    expect(calculatePanelResize(START, 150, 180, BOUNDS)).toEqual({
      position: { x: 10, y: 20 },
      size: { width: 450, height: 380 },
    });
  });

  it("redimensionne depuis le coin haut gauche en conservant le coin opposé", () => {
    expect(
      calculatePanelResize({ ...START, corner: "top-left" }, 150, 180, BOUNDS),
    ).toEqual({
      position: { x: 60, y: 100 },
      size: { width: 350, height: 220 },
    });
  });

  it("respecte les tailles minimum", () => {
    expect(
      calculatePanelResize({ ...START, corner: "top-left" }, 900, 900, BOUNDS),
    ).toEqual({
      position: { x: 130, y: 160 },
      size: { width: 280, height: 160 },
    });
  });

  it("respecte les tailles maximum", () => {
    expect(calculatePanelResize(START, 900, 900, BOUNDS)).toEqual({
      position: { x: 10, y: 20 },
      size: { width: 900, height: 700 },
    });
  });

  it("agrandit depuis le bord gauche sans déplacer un panneau ancré à droite", () => {
    expect(
      calculatePanelResize(
        { ...START, corner: "bottom-left" },
        50,
        100,
        BOUNDS,
        { horizontal: "right", vertical: "top" },
      ),
    ).toEqual({
      position: { x: 10, y: 20 },
      size: { width: 450, height: 300 },
    });
  });

  it("agrandit depuis le bord droit en déplaçant x pour garder le bord gauche", () => {
    expect(
      calculatePanelResize(
        { ...START, corner: "bottom-right" },
        150,
        100,
        BOUNDS,
        { horizontal: "right", vertical: "top" },
      ),
    ).toEqual({
      position: { x: 60, y: 20 },
      size: { width: 450, height: 300 },
    });
  });
});
