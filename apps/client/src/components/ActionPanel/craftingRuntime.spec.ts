import { describe, expect, it } from "vitest";
import {
  buildCraftRequestPayload,
  filterRecipesForStation,
  stationActionLabel,
  type AvailableCraftingRecipe,
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
});
