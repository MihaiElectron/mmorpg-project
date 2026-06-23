import { getMainCamera } from "../../../components/DevTools/devtoolsBridge";
import { wuToScreen } from "../../../phaser/utils/wuProjection";
import type { ActionProvider, StudioAction } from "./ActionProvider";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";

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
