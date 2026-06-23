import type { OverlayProvider, StudioOverlayDefinition } from "./CapabilityProvider";

const CREATURE_SPAWN_OVERLAY: StudioOverlayDefinition = {
  id: "creature_spawn.overlay",
  label: "Creature Spawns",
  category: "creature_spawn",
  capability: "spawn",
  description: "Affiche les points de spawn et leur rayon de patrouille sur la map.",
};

/**
 * Provider d'overlay pour les WorldObjects portant la capability "spawn".
 * Le rendu effectif est délégué à DevToolsOverlayManager.redrawCreatureSpawns().
 */
export const creatureSpawnOverlayProvider: OverlayProvider = {
  kind: "overlay",
  capabilities: ["spawn"],
  getOverlays: () => [CREATURE_SPAWN_OVERLAY],
};
