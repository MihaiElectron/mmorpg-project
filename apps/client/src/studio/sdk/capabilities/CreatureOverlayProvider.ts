import type { OverlayProvider, StudioOverlayDefinition } from "./CapabilityProvider";

const CREATURE_OVERLAY: StudioOverlayDefinition = {
  id: "creature.overlay",
  label: "Créatures",
  category: "creature",
  capability: "combat",
  description: "Affiche les créatures actives et leur position sur la map.",
};

/**
 * Provider d'overlay pour les WorldObjects portant la capability "combat".
 * Le rendu effectif est délégué à DevToolsOverlayManager.redrawCreatures().
 */
export const creatureOverlayProvider: OverlayProvider = {
  kind: "overlay",
  capabilities: ["combat"],
  getOverlays: () => [CREATURE_OVERLAY],
};
