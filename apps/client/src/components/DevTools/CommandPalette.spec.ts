import { describe, it, expect, vi } from "vitest";
import { filterActions } from "./CommandPalette";
import type { StudioAction } from "../../studio/sdk/actions";
import type { WorldObject } from "./types/worldObject.types";

function makeAction(id: string, label: string): StudioAction {
  return {
    id,
    label,
    group: "test",
    enabled: () => true,
    run: vi.fn(),
  };
}

function makeObj(): WorldObject {
  return {
    kind: "entity",
    category: "resource",
    id: "r-1",
    type: "dead_tree",
    mapId: 1,
    position: null,
    state: "dead",
    capabilities: ["harvestable"],
    metadata: {},
  };
}

void makeObj; // used by integration tests if needed

const ACTIONS: StudioAction[] = [
  makeAction("resource.forceRespawn", "Force Respawn"),
  makeAction("resource.refresh", "Rafraîchir"),
  makeAction("resource.clearSelection", "Désélectionner"),
];

describe("filterActions", () => {
  it("retourne toutes les actions si query vide", () => {
    expect(filterActions(ACTIONS, "")).toHaveLength(3);
  });

  it("retourne toutes les actions si query est uniquement des espaces", () => {
    expect(filterActions(ACTIONS, "   ")).toHaveLength(3);
  });

  it("filtre par label, case-insensitive", () => {
    const result = filterActions(ACTIONS, "respawn");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("resource.forceRespawn");
  });

  it("filtre par label avec casse mixte", () => {
    const result = filterActions(ACTIONS, "FORCE");
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Force Respawn");
  });

  it("filtre par id, case-insensitive", () => {
    const result = filterActions(ACTIONS, "forcerespawn");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("resource.forceRespawn");
  });

  it("filtre par portion d'id", () => {
    const result = filterActions(ACTIONS, "refresh");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("resource.refresh");
  });

  it("retourne plusieurs résultats si plusieurs correspondent", () => {
    const result = filterActions(ACTIONS, "resource");
    expect(result).toHaveLength(3);
  });

  it("retourne [] si aucune action ne correspond", () => {
    expect(filterActions(ACTIONS, "xyz-inconnu")).toHaveLength(0);
  });

  it("retourne [] sur liste vide quelle que soit la query", () => {
    expect(filterActions([], "respawn")).toHaveLength(0);
  });

  it("préserve l'ordre d'origine des actions", () => {
    const result = filterActions(ACTIONS, "r");
    expect(result.map((a) => a.id)).toStrictEqual([
      "resource.forceRespawn",
      "resource.refresh",
      "resource.clearSelection",
    ]);
  });
});
