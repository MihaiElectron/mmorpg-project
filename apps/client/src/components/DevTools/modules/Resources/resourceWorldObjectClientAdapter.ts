import type { WorldObject } from "../../types/worldObject.types";

const CAPABILITIES: readonly string[] = Object.freeze([
  "transform", "harvestable", "loot", "persistence", "validation",
]);

/**
 * Construit un WorldObject depuis une resource brute (payload socket ou GET).
 * Miroir TypeScript de resourceToWorldObject dans WorldScene.js.
 */
export function toClientWorldObject(r: Record<string, any>): WorldObject {
  const hasWU = r.worldX != null && r.worldY != null && r.mapId != null;
  return {
    kind: "entity",
    category: "resource",
    id: r.id,
    type: r.type ?? "unknown",
    mapId: r.mapId ?? null,
    position: hasWU ? { worldX: r.worldX as number, worldY: r.worldY as number } : null,
    state: r.state ?? "alive",
    remainingLoots: r.remainingLoots ?? 0,
    capabilities: CAPABILITIES,
    metadata: {
      legacy:
        r.x != null && r.y != null ? { x: r.x as number, y: r.y as number } : null,
    },
  };
}

/**
 * Applique un patch partiel resource_update sur un WorldObject existant.
 * Seuls les champs présents dans `data` écrasent l'existant.
 */
export function patchClientWorldObject(
  existing: WorldObject,
  data: Record<string, any>,
): WorldObject {
  const state: string = data.state ?? existing.state;
  const remainingLoots: number =
    data.remainingLoots != null ? (data.remainingLoots as number) : (existing.remainingLoots ?? 0);

  const hasWU = data.worldX != null && data.worldY != null;
  const position = hasWU
    ? { worldX: data.worldX as number, worldY: data.worldY as number }
    : existing.position;

  return { ...existing, state, remainingLoots, position };
}
