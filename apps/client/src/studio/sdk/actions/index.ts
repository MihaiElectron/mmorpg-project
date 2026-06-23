import { ActionRegistry } from "./ActionRegistry";
import { resourceActionProvider } from "./ResourceActionProvider";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";
import type { StudioAction } from "./ActionProvider";

export const actionRegistry = new ActionRegistry();
actionRegistry.register(resourceActionProvider);

/** Retourne les actions disponibles pour le WorldObject depuis le registre singleton. */
export function getActionsForWorldObject(obj: WorldObject): StudioAction[] {
  return actionRegistry.getActionsFor(obj);
}

export { ActionRegistry } from "./ActionRegistry";
export type { ActionProvider, StudioAction } from "./ActionProvider";
