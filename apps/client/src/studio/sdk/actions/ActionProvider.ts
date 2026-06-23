import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";
import type { StudioCommandContext } from "../../../components/DevTools/commands/studioCommands";

/**
 * Représentation d'une action Studio : élément d'UI qui peut orchestrer des commandes.
 *
 * Une Action est délibérément séparée d'une Command :
 *   - Command : exécutable pur, opère sur un contexte injecté
 *   - Action  : élément d'UI, peut appeler des commandes, demander confirmation, orchestrer
 *
 * run(obj, ctx) : l'objet permet les vérifications métier locales ;
 *                 le ctx injecté par le panneau fournit les callbacks store et le selectedId.
 */
export interface StudioAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  /** Groupe logique : "instance" | "module" | "debug" */
  readonly group: string;
  readonly danger?: boolean;
  enabled(obj: WorldObject): boolean;
  run(obj: WorldObject, ctx: StudioCommandContext): void | Promise<void>;
}

/**
 * Provider d'actions Studio déclenché par la présence de capabilities sur un WorldObject.
 * Le panneau ne connaît pas les catégories — il interroge les providers via ActionRegistry.
 */
export interface ActionProvider {
  readonly capabilities: readonly string[];
  getActions(obj: WorldObject): StudioAction[];
}
