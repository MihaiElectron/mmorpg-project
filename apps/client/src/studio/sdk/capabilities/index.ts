import { CapabilityRegistry } from "./CapabilityRegistry";
import { validationCapabilityProvider } from "./ValidationCapabilityProvider";
import { resourceCommandProvider } from "./ResourceCommandProvider";
import { isCommandProvider } from "./CapabilityProvider";
import type { StudioCommand, StudioCommandContext } from "../../../components/DevTools/commands/studioCommands";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";

export const capabilityRegistry = new CapabilityRegistry();
capabilityRegistry.register(validationCapabilityProvider);
capabilityRegistry.register(resourceCommandProvider);

/**
 * Retourne toutes les commandes applicables au WorldObject depuis le registre.
 * Les doublons éventuels (plusieurs providers pour la même capability) sont conservés
 * dans l'ordre d'inscription.
 */
export function getCommandsForWorldObject(
  obj: WorldObject,
  context: StudioCommandContext,
): StudioCommand[] {
  return capabilityRegistry
    .getProvidersFor(obj)
    .filter(isCommandProvider)
    .flatMap((p) => p.getCommands(context));
}

export { CapabilityRegistry } from "./CapabilityRegistry";
export { isValidationProvider, isCommandProvider } from "./CapabilityProvider";
export type { CapabilityProvider, ValidationProvider, CommandProvider } from "./CapabilityProvider";
