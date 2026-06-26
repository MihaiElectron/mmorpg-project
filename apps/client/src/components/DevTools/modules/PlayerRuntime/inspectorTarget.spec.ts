import { describe, it, expect } from "vitest";
import { worldObjectToInspectorTarget } from "./inspectorTarget";
import type { WorldObject } from "../../types/worldObject.types";

function makeWorldObject(overrides: Partial<WorldObject> = {}): WorldObject {
  return {
    kind: "entity",
    category: "resource",
    id: "obj-1",
    type: "dead_tree",
    mapId: 1,
    position: { worldX: 1024, worldY: 2048 },
    state: "alive",
    capabilities: ["harvestable"],
    metadata: {},
    ...overrides,
  };
}

describe("worldObjectToInspectorTarget", () => {
  it("retourne undefined si obj est null (mode Joueur)", () => {
    expect(worldObjectToInspectorTarget(null)).toBeUndefined();
  });

  it("retourne undefined pour une resource (non-créature)", () => {
    const resource = makeWorldObject({ category: "resource" });
    expect(worldObjectToInspectorTarget(resource)).toBeUndefined();
  });

  it("retourne undefined pour une crafting_station (non-régression)", () => {
    const station = makeWorldObject({ category: "crafting_station", id: "station-1" });
    expect(worldObjectToInspectorTarget(station)).toBeUndefined();
  });

  it("retourne InspectorTarget creature pour un WorldObject créature", () => {
    const creature = makeWorldObject({ category: "creature", id: "creature-42" });
    expect(worldObjectToInspectorTarget(creature)).toEqual({
      entityId: "creature-42",
      entityKind: "creature",
    });
  });

  it("met à jour entityId si la créature sélectionnée change", () => {
    const first = makeWorldObject({ category: "creature", id: "creature-1" });
    const second = makeWorldObject({ category: "creature", id: "creature-2" });
    expect(worldObjectToInspectorTarget(first)?.entityId).toBe("creature-1");
    expect(worldObjectToInspectorTarget(second)?.entityId).toBe("creature-2");
  });

  it("repasse en mode Joueur si la sélection est effacée (null)", () => {
    const creature = makeWorldObject({ category: "creature", id: "creature-1" });
    expect(worldObjectToInspectorTarget(creature)?.entityKind).toBe("creature");
    expect(worldObjectToInspectorTarget(null)).toBeUndefined();
  });
});
