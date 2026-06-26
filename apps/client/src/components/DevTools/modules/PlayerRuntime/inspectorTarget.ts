import type { WorldObject } from "../../types/worldObject.types";
import type { InspectorTarget } from "./RuntimeInspectorPanel";

/**
 * Dérive un InspectorTarget depuis le WorldObject sélectionné dans le Studio SDK.
 * Retourne undefined (mode Joueur) si obj est null ou d'une catégorie non-creature.
 */
export function worldObjectToInspectorTarget(obj: WorldObject | null): InspectorTarget | undefined {
  if (obj?.category === "creature") {
    return { entityId: obj.id, entityKind: "creature" };
  }
  return undefined;
}
