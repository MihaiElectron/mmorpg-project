import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";
import type { CapabilityProvider } from "./CapabilityProvider";

/**
 * Registre des Capability Providers.
 *
 * Règles :
 * - `register` ajoute un provider dans l'ordre d'inscription.
 * - `getProviders` retourne tous les providers qui gèrent au moins une des capabilities demandées.
 * - `getProvidersFor` est un raccourci vers `getProviders(obj.capabilities)`.
 * - L'ordre de retour est l'ordre d'inscription (stable).
 * - Pas de dédoublonnage : un provider peut être enregistré plusieurs fois si appelé plusieurs fois.
 */
export class CapabilityRegistry {
  private readonly _providers: CapabilityProvider[] = [];

  register(provider: CapabilityProvider): void {
    this._providers.push(provider);
  }

  /**
   * Retourne les providers qui gèrent au moins une des capabilities données.
   */
  getProviders(capabilities: readonly string[]): CapabilityProvider[] {
    if (capabilities.length === 0) return [];
    const capSet = new Set(capabilities);
    return this._providers.filter((p) => p.capabilities.some((c) => capSet.has(c)));
  }

  /**
   * Retourne les providers applicables au WorldObject passé.
   */
  getProvidersFor(obj: WorldObject): CapabilityProvider[] {
    return this.getProviders(obj.capabilities);
  }

  /**
   * Retourne tous les providers enregistrés, dans l'ordre d'inscription.
   */
  getAllProviders(): CapabilityProvider[] {
    return [...this._providers];
  }
}
