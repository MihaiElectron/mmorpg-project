import { getCommand } from "../../../components/DevTools/commands/studioCommands";
import type { ActionProvider, StudioAction } from "./ActionProvider";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";
import type { StudioCommandContext } from "../../../components/DevTools/commands/studioCommands";

/**
 * Transforme la commande resource.forceRespawn en Action Studio.
 * Le ctx fourni par SelectedActionsPanel contient déjà selectedWorldObjectId = obj.id.
 */
const forceRespawnAction: StudioAction = {
  id: "resource.forceRespawn",
  label: "Force Respawn",
  group: "instance",
  danger: false,
  enabled: (_obj: WorldObject) => true,
  run: async (_obj: WorldObject, ctx: StudioCommandContext) => {
    const cmd = getCommand("resource.forceRespawn");
    if (!cmd) return;
    await cmd.run(ctx);
  },
};

/**
 * Expose les actions admin pour les WorldObjects portant la capability "harvestable".
 * ResourceCommandProvider (Commands) reste inchangé et parallèle à ce provider.
 */
export const resourceActionProvider: ActionProvider = {
  capabilities: ["harvestable"],
  getActions: (_obj: WorldObject): StudioAction[] => [forceRespawnAction],
};
