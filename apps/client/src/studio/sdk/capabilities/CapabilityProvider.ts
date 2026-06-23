import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";
import type { Diagnostic } from "../../../components/DevTools/validation/validateWorldObject";
import type { StudioCommand, StudioCommandContext } from "../../../components/DevTools/commands/studioCommands";

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

/**
 * Provider capable de retourner des commandes Studio pour un WorldObject.
 *
 * Limitation actuelle : getCommands() retourne des commandes module-level
 * (identiques pour tout WorldObject de la même capability). Le contexte d'exécution
 * est reçu en paramètre pour anticiper les futures commandes object-level qui en
 * auront besoin. Pour des commandes object-level, le WorldObject devra être passé
 * à getCommands() dans une version future.
 */
export interface CommandProvider extends CapabilityProvider {
  readonly kind: "command";
  getCommands(context: StudioCommandContext): StudioCommand[];
}

export function isCommandProvider(p: CapabilityProvider): p is CommandProvider {
  return (p as CommandProvider).kind === "command";
}

// ── Overlay ───────────────────────────────────────────────────────────────────

/**
 * Définition déclarative d'un overlay Studio.
 * Décrit l'overlay sans contenir de logique de rendu — le rendu reste dans Phaser/WorldScene.
 */
export interface StudioOverlayDefinition {
  /** Identifiant unique : "resource.overlay", "animal.overlay", etc. */
  readonly id: string;
  /** Libellé affiché dans l'UI (bouton, légende). */
  readonly label: string;
  /** Catégorie WorldObject concernée. */
  readonly category: string;
  /** Capability qui déclenche ce provider. */
  readonly capability: string;
  readonly description?: string;
}

/**
 * Provider exposant des définitions d'overlays pour les WorldObjects portant ses capabilities.
 * worldObject est optionnel pour permettre getAllOverlayDefinitions() sans objet spécifique.
 */
export interface OverlayProvider extends CapabilityProvider {
  readonly kind: "overlay";
  getOverlays(worldObject?: WorldObject): StudioOverlayDefinition[];
}

export function isOverlayProvider(p: CapabilityProvider): p is OverlayProvider {
  return (p as OverlayProvider).kind === "overlay";
}
