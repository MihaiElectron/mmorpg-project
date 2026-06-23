import type { ActionProvider, StudioAction } from "./ActionProvider";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";

/** Résumé compact d'un WorldObject, destiné au presse-papiers. */
export function formatWorldObjectInfo(obj: WorldObject): string {
  const lines: string[] = [
    `${obj.category}:${obj.type}#${obj.id}`,
    `mapId=${obj.mapId ?? "null"}`,
    `worldX=${obj.position?.worldX ?? "null"}`,
    `worldY=${obj.position?.worldY ?? "null"}`,
    `state=${obj.state}`,
    `capabilities=${obj.capabilities.join(",")}`,
  ];
  return lines.join("\n");
}

const copyInfoAction: StudioAction = {
  id: "worldObject.copyInfo",
  label: "Copy Info",
  group: "utility",
  enabled: (_obj: WorldObject) => true,
  run: async (obj: WorldObject) => {
    const text = formatWorldObjectInfo(obj);
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  },
};

export const worldObjectActionProvider: ActionProvider = {
  capabilities: ["transform"],
  getActions: (_obj: WorldObject): StudioAction[] => [copyInfoAction],
};
