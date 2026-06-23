import { getMainCamera } from "../../../components/DevTools/devtoolsBridge";
import type { ActionProvider, StudioAction } from "./ActionProvider";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";

/** ADR-0001 : projection WU → pixels Phaser. screenX = 1000 + (wX - wY) / 16 ; screenY = (wX + wY) / 32 */
function wuToScreen(worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: Math.round(1000 + (worldX - worldY) / 16),
    y: Math.round((worldX + worldY) / 32),
  };
}

const focusCameraAction: StudioAction = {
  id: "worldObject.focusCamera",
  label: "Focus Camera",
  group: "navigation",
  enabled: (obj: WorldObject) => obj.position !== null,
  run: (obj: WorldObject) => {
    if (!obj.position) return;
    const { x, y } = wuToScreen(obj.position.worldX, obj.position.worldY);
    const camera = getMainCamera();
    if (!camera) return;
    camera.pan(x, y, 400, "Power2");
  },
};

export const positionActionProvider: ActionProvider = {
  capabilities: ["transform"],
  getActions: (_obj: WorldObject): StudioAction[] => [focusCameraAction],
};
