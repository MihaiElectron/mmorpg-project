import type { OverlayProvider, StudioOverlayDefinition } from "./CapabilityProvider";

const WORLD_ITEM_OVERLAY: StudioOverlayDefinition = {
  id: "world_item.overlay",
  label: "Objets au sol",
  category: "world_item",
  capability: "world_item",
  description: "Affiche les objets persistants présents au sol sur la map.",
};

export const worldItemOverlayProvider: OverlayProvider = {
  kind: "overlay",
  capabilities: ["world_item"],
  getOverlays: () => [WORLD_ITEM_OVERLAY],
};
