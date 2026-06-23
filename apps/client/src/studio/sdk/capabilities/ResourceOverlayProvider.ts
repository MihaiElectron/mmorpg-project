import type { OverlayProvider, StudioOverlayDefinition } from "./CapabilityProvider";

const RESOURCE_OVERLAY: StudioOverlayDefinition = {
  id: "resource.overlay",
  label: "Resources",
  category: "resource",
  capability: "harvestable",
  description: "Affiche les ressources de récolte et leur état sur la map.",
};

/**
 * Provider d'overlay pour les WorldObjects portant la capability "harvestable".
 * Le rendu effectif est délégué à DevToolsOverlayManager.redrawResources() — ce provider
 * déclare uniquement la définition de l'overlay pour le registre SDK.
 */
export const resourceOverlayProvider: OverlayProvider = {
  kind: "overlay",
  capabilities: ["harvestable"],
  getOverlays: () => [RESOURCE_OVERLAY],
};
