import { CapabilityRegistry } from "./CapabilityRegistry";
import { validationCapabilityProvider } from "./ValidationCapabilityProvider";
import { resourceCommandProvider } from "./ResourceCommandProvider";
import { resourceOverlayProvider } from "./ResourceOverlayProvider";
import { animalOverlayProvider } from "./AnimalOverlayProvider";
import { creatureSpawnOverlayProvider } from "./CreatureSpawnOverlayProvider";
import { walkabilityOverlayProvider } from "./WalkabilityOverlayProvider";
import { isCommandProvider, isOverlayProvider } from "./CapabilityProvider";
import type { StudioCommand, StudioCommandContext } from "../../../components/DevTools/commands/studioCommands";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";
import type { StudioOverlayDefinition } from "./CapabilityProvider";

export const capabilityRegistry = new CapabilityRegistry();
capabilityRegistry.register(validationCapabilityProvider);
capabilityRegistry.register(resourceCommandProvider);
capabilityRegistry.register(resourceOverlayProvider);
capabilityRegistry.register(animalOverlayProvider);
capabilityRegistry.register(creatureSpawnOverlayProvider);
capabilityRegistry.register(walkabilityOverlayProvider);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Retourne les commandes applicables au WorldObject depuis le registre. */
export function getCommandsForWorldObject(
  obj: WorldObject,
  context: StudioCommandContext,
): StudioCommand[] {
  return capabilityRegistry
    .getProvidersFor(obj)
    .filter(isCommandProvider)
    .flatMap((p) => p.getCommands(context));
}

/** Retourne les définitions d'overlay applicables au WorldObject. */
export function getOverlaysForWorldObject(obj: WorldObject): StudioOverlayDefinition[] {
  return capabilityRegistry
    .getProvidersFor(obj)
    .filter(isOverlayProvider)
    .flatMap((p) => p.getOverlays(obj));
}

/** Retourne toutes les définitions d'overlay enregistrées, sans filtrage par WorldObject. */
export function getAllOverlayDefinitions(): StudioOverlayDefinition[] {
  return capabilityRegistry
    .getAllProviders()
    .filter(isOverlayProvider)
    .flatMap((p) => p.getOverlays());
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export { CapabilityRegistry } from "./CapabilityRegistry";
export { isValidationProvider, isCommandProvider, isOverlayProvider } from "./CapabilityProvider";
export type {
  CapabilityProvider,
  ValidationProvider,
  CommandProvider,
  OverlayProvider,
  StudioOverlayDefinition,
} from "./CapabilityProvider";
