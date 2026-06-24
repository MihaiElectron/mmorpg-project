import type { OverlayProvider, StudioOverlayDefinition } from "./CapabilityProvider";

const WALKABILITY_OVERLAY: StudioOverlayDefinition = {
  id: "walkability.overlay",
  label: "Walkability",
  category: "world",
  capability: "walkability",
  description: "Affiche la grille de walkabilité sur la map (debug pathfinding).",
};

const TILE_COORDINATES_OVERLAY: StudioOverlayDefinition = {
  id: "tile_coordinates.overlay",
  label: "Tile Coordinates",
  category: "world",
  capability: "walkability",
  description: "Affiche les coordonnées de la tuile sous le curseur.",
};

export const walkabilityOverlayProvider: OverlayProvider = {
  kind: "overlay",
  capabilities: ["walkability"],
  getOverlays: () => [WALKABILITY_OVERLAY, TILE_COORDINATES_OVERLAY],
};
