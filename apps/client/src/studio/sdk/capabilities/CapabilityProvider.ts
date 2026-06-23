import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";
import type { Diagnostic } from "../../../components/DevTools/validation/validateWorldObject";

/**
 * Interface de base de tous les Capability Providers.
 * Un provider déclare les capabilities qu'il gère — le registre s'occupe du routage.
 */
export interface CapabilityProvider {
  readonly capabilities: readonly string[];
}

/**
 * Provider capable de produire des diagnostics sur un WorldObject.
 * Correspond à la capability "validation".
 */
export interface ValidationProvider extends CapabilityProvider {
  readonly kind: "validation";
  validate(obj: WorldObject): Diagnostic[];
}

export function isValidationProvider(p: CapabilityProvider): p is ValidationProvider {
  return (p as ValidationProvider).kind === "validation";
}
