import type { OverlayProvider, StudioOverlayDefinition } from "./CapabilityProvider";

const ANIMAL_OVERLAY: StudioOverlayDefinition = {
  id: "animal.overlay",
  label: "Animaux",
  category: "animal",
  capability: "combat",
  description: "Affiche les animaux actifs et leur position sur la map.",
};

/**
 * Provider d'overlay pour les WorldObjects portant la capability "combat".
 * Le rendu effectif est délégué à DevToolsOverlayManager.redrawAnimals().
 */
export const animalOverlayProvider: OverlayProvider = {
  kind: "overlay",
  capabilities: ["combat"],
  getOverlays: () => [ANIMAL_OVERLAY],
};
