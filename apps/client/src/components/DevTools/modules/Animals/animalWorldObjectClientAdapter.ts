import type { WorldObject } from "../../types/worldObject.types";

const ANIMAL_CAPABILITIES = Object.freeze([
  "transform", "combat", "health", "persistence", "validation",
]);

export function toAnimalClientWorldObject(a: Record<string, any>): WorldObject {
  const hasWU =
    a.worldX != null && a.worldY != null && a.mapId != null;

  return {
    kind: "entity",
    category: "animal",
    id: String(a.id),
    type: String(a.type ?? "unknown"),
    mapId: a.mapId ?? null,
    position: hasWU
      ? { worldX: Number(a.worldX), worldY: Number(a.worldY) }
      : null,
    state: String(a.state ?? "alive"),
    health:    a.health    != null ? Number(a.health)    : undefined,
    maxHealth: a.maxHealth != null ? Number(a.maxHealth) : undefined,
    capabilities: Array.isArray(a.capabilities) ? a.capabilities : [...ANIMAL_CAPABILITIES],
    metadata: {
      legacy:
        a.x != null && a.y != null ? { x: Number(a.x), y: Number(a.y) } : null,
    },
  };
}

export function patchAnimalWorldObject(
  existing: WorldObject,
  data: Record<string, any>,
): WorldObject {
  const hasWU =
    data.worldX != null && data.worldY != null && data.mapId != null;

  const position = hasWU
    ? { worldX: Number(data.worldX), worldY: Number(data.worldY) }
    : existing.position;

  return {
    ...existing,
    state:     String(data.state ?? existing.state),
    health:    data.health    != null ? Number(data.health)    : existing.health,
    maxHealth: data.maxHealth != null ? Number(data.maxHealth) : existing.maxHealth,
    position,
  };
}
