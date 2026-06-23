import type { ActionProvider, StudioAction } from "./ActionProvider";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";

export class ActionRegistry {
  private readonly _providers: ActionProvider[] = [];

  register(provider: ActionProvider): void {
    this._providers.push(provider);
  }

  /**
   * Retourne les actions disponibles pour un WorldObject,
   * en interrogeant les providers dont les capabilities intersectent celles de l'objet.
   * L'ordre d'insertion des providers est préservé.
   */
  getActionsFor(obj: WorldObject): StudioAction[] {
    if (obj.capabilities.length === 0) return [];
    const capSet = new Set(obj.capabilities);
    return this._providers
      .filter((p) => p.capabilities.some((c) => capSet.has(c)))
      .flatMap((p) => p.getActions(obj));
  }

  getAllProviders(): ActionProvider[] {
    return [...this._providers];
  }
}
