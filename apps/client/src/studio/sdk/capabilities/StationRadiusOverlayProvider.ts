import type { OverlayProvider, StudioOverlayDefinition } from "./CapabilityProvider";

const STATION_RADIUS_OVERLAY: StudioOverlayDefinition = {
  id: "station_radius.overlay",
  label: "Station Radius",
  category: "crafting_station",
  capability: "crafting_station",
  description: "Affiche le rayon d'interaction des stations de craft en WU.",
};

export const stationRadiusOverlayProvider: OverlayProvider = {
  kind: "overlay",
  capabilities: ["crafting_station"],
  getOverlays: () => [STATION_RADIUS_OVERLAY],
};
