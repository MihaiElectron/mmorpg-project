import { describe, it, expect, vi, beforeEach } from "vitest";
import { positionActionProvider } from "./PositionActionProvider";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";

vi.mock("../../../components/DevTools/devtoolsBridge", () => ({
  getMainCamera: vi.fn(),
}));

import { getMainCamera } from "../../../components/DevTools/devtoolsBridge";

function makeObj(overrides: Partial<WorldObject> = {}): WorldObject {
  return {
    kind: "entity",
    category: "resource",
    id: "r-1",
    type: "dead_tree",
    mapId: 1,
    position: { worldX: 32768, worldY: 32768 },
    state: "alive",
    capabilities: ["transform", "harvestable"],
    metadata: {},
    ...overrides,
  };
}

describe("positionActionProvider", () => {
  it("est déclenché par la capability transform", () => {
    const obj = makeObj({ capabilities: ["transform"] });
    expect(positionActionProvider.capabilities).toContain("transform");
    const actions = positionActionProvider.getActions(obj);
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe("worldObject.focusCamera");
  });

  it("retourne toujours l'action indépendamment des autres capabilities", () => {
    const obj = makeObj({ capabilities: ["transform", "combat", "harvestable"] });
    expect(positionActionProvider.getActions(obj)).toHaveLength(1);
  });

  describe("focusCameraAction.enabled", () => {
    it("retourne true si position présente", () => {
      const obj = makeObj({ position: { worldX: 1024, worldY: 2048 } });
      const [action] = positionActionProvider.getActions(obj);
      expect(action.enabled(obj)).toBe(true);
    });

    it("retourne false si position null", () => {
      const obj = makeObj({ position: null });
      const [action] = positionActionProvider.getActions(obj);
      expect(action.enabled(obj)).toBe(false);
    });
  });

  describe("focusCameraAction.run", () => {
    const mockCtx = {} as any;

    beforeEach(() => {
      vi.mocked(getMainCamera).mockReset();
    });

    it("appelle camera.pan avec les coordonnées projetées ADR-0001", () => {
      const pan = vi.fn();
      vi.mocked(getMainCamera).mockReturnValue({ pan });

      const worldX = 32768;
      const worldY = 32768;
      const expectedX = Math.round(1000 + (worldX - worldY) / 16);
      const expectedY = Math.round((worldX + worldY) / 32);

      const obj = makeObj({ position: { worldX, worldY } });
      const [action] = positionActionProvider.getActions(obj);
      action.run(obj, mockCtx);

      expect(pan).toHaveBeenCalledWith(expectedX, expectedY, 400, "Power2");
    });

    it("ne fait rien si position null", () => {
      const pan = vi.fn();
      vi.mocked(getMainCamera).mockReturnValue({ pan });

      const obj = makeObj({ position: null });
      const [action] = positionActionProvider.getActions(obj);
      action.run(obj, mockCtx);

      expect(pan).not.toHaveBeenCalled();
    });

    it("ne fait rien si la caméra est indisponible (Phaser non prêt)", () => {
      vi.mocked(getMainCamera).mockReturnValue(null);

      const obj = makeObj({ position: { worldX: 1024, worldY: 2048 } });
      const [action] = positionActionProvider.getActions(obj);
      expect(() => action.run(obj, mockCtx)).not.toThrow();
    });

    it("projette différentes positions correctement", () => {
      const pan = vi.fn();
      vi.mocked(getMainCamera).mockReturnValue({ pan });

      const obj = makeObj({ position: { worldX: 0, worldY: 0 } });
      const [action] = positionActionProvider.getActions(obj);
      action.run(obj, mockCtx);

      expect(pan).toHaveBeenCalledWith(1000, 0, 400, "Power2");
    });
  });
});
