import { describe, expect, it } from "vitest";
import {
  buildCraftRequestPayload,
  distanceWU,
  estimateStationReach,
  filterRecipesForStation,
  stationActionLabel,
  type AvailableCraftingRecipe,
  type CraftingStationTarget,
} from "./craftingRuntime";

function recipe(id: string, stationType: string): AvailableCraftingRecipe {
  return {
    id,
    key: id,
    name: id,
    description: null,
    category: "smithing",
    requiredSkillKey: "smithing",
    requiredSkillLevel: 1,
    baseSuccessRate: 1,
    successBonusPerLevel: 0,
    minSuccessRate: 1,
    maxSuccessRate: 1,
    xpReward: 1,
    craftTimeMs: 0,
    stationType,
    ingredients: [],
    results: [],
  };
}

function station(overrides: Partial<CraftingStationTarget> = {}): CraftingStationTarget {
  return {
    id: "station-1",
    kind: "crafting_station",
    type: "forge",
    stationType: "forge",
    worldX: 0,
    worldY: 0,
    interactionRadiusWU: 1536,
    ...overrides,
  };
}

describe("crafting runtime helpers", () => {
  it("filtre les recettes par stationType", () => {
    expect(filterRecipesForStation([recipe("r1", "forge"), recipe("r2", "workbench")], "forge"))
      .toEqual([expect.objectContaining({ id: "r1" })]);
  });

  it("buildCraftRequestPayload n'envoie que recipeId et quantity", () => {
    const payload = buildCraftRequestPayload("recipe-1");
    expect(payload).toEqual({ recipeId: "recipe-1", quantity: 1 });
    expect(payload).not.toHaveProperty("characterId");
    expect(payload).not.toHaveProperty("stationId");
    expect(payload).not.toHaveProperty("success");
  });

  it("stationActionLabel utilise name puis stationType", () => {
    expect(stationActionLabel({ type: "forge", stationType: "forge", name: "Forge" })).toBe("Ouvrir Forge");
    expect(stationActionLabel({ type: "alchemy_table", stationType: "alchemy_table" })).toBe("Ouvrir alchemy table");
  });

  it("calcule la distance euclidienne WU", () => {
    expect(distanceWU({ worldX: 0, worldY: 0 }, { worldX: 300, worldY: 400 })).toBe(500);
  });

  it("estime une station à portée", () => {
    expect(estimateStationReach({ worldX: 1000, worldY: 0 }, station())).toEqual({
      status: "in_range",
      distanceWU: 1000,
      radiusWU: 1536,
      inRange: true,
    });
  });

  it("estime une station hors de portée sans changer le payload craft", () => {
    const reach = estimateStationReach({ worldX: 2000, worldY: 0 }, station());
    expect(reach).toEqual({
      status: "out_of_range",
      distanceWU: 2000,
      radiusWU: 1536,
      inRange: false,
    });
    expect(buildCraftRequestPayload("recipe-1")).toEqual({ recipeId: "recipe-1", quantity: 1 });
  });

  it("retourne unknown si les coordonnées ou le rayon manquent", () => {
    expect(estimateStationReach({ worldX: 0, worldY: 0 }, station({ interactionRadiusWU: undefined })))
      .toEqual({ status: "unknown", distanceWU: null, radiusWU: null, inRange: null });
  });
});
