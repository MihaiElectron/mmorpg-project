import { describe, expect, it } from "vitest";
import {
  buildCraftRequestPayload,
  computeMaxCraftable,
  countOwned,
  distanceWU,
  estimateCraftSkillXp,
  estimateStationReach,
  filterRecipesForStation,
  formatCraftingServerErrorDetail,
  formatCraftSeconds,
  ingredientAvailability,
  matchesRecipeQuery,
  parseCraftingServerError,
  recipeProductLabel,
  stationActionLabel,
  type AvailableCraftingRecipe,
  type CraftingStationTarget,
  type InventoryLike,
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
    craftCharacterXpReward: 0,
    craftingDifficulty: 0,
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

  it("n'inclut pas les recettes sans station ('none') dans une station", () => {
    const list = [recipe("forge1", "forge"), recipe("free1", "none"), recipe("bench1", "workbench")];
    expect(filterRecipesForStation(list, "forge").map((r) => r.id)).toEqual(["forge1"]);
  });

  it("ne déduplique pas les recettes produisant le même item", () => {
    const a = { ...recipe("swordA", "forge"), results: [{ id: "ra", itemId: "sword", itemName: "Épée", itemCategory: "weapon", itemImage: null, producedQuantity: 1, chance: 1 }] };
    const b = { ...recipe("swordB", "forge"), results: [{ id: "rb", itemId: "sword", itemName: "Épée", itemCategory: "weapon", itemImage: null, producedQuantity: 1, chance: 1 }] };
    expect(filterRecipesForStation([a, b], "forge").map((r) => r.id)).toEqual(["swordA", "swordB"]);
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

  it("extrait une erreur serveur craft structurée", () => {
    expect(parseCraftingServerError({
      code: "CRAFTING_STATION_OUT_OF_RANGE",
      message: "Forge trop éloignée.",
      stationType: "forge",
      nearestDistanceWU: 2048,
      requiredRadiusWU: 1536,
    }, "Erreur 400")).toEqual({
      code: "CRAFTING_STATION_OUT_OF_RANGE",
      message: "Forge trop éloignée.",
      stationType: "forge",
      nearestDistanceWU: 2048,
      requiredRadiusWU: 1536,
    });
  });

  it("formate le détail distance/rayon si présent", () => {
    expect(formatCraftingServerErrorDetail({
      message: "Forge trop éloignée.",
      nearestDistanceWU: 2048.4,
      requiredRadiusWU: 1536,
    })).toBe("Distance : 2048 WU / portée : 1536 WU");
  });

  it("conserve un fallback pour les erreurs non structurées", () => {
    expect(parseCraftingServerError({ message: ["recipeId must be a UUID"] }, "Erreur 400"))
      .toEqual({ message: "recipeId must be a UUID" });
    expect(formatCraftingServerErrorDetail({ message: "Inventaire insuffisant" })).toBeNull();
  });
});

// ── Craft UX Phase 1 (produit-first) ──────────────────────────────────────────

function ingredient(itemId: string, requiredQuantity: number, itemName = itemId) {
  return { id: `ing-${itemId}`, itemId, itemName, itemImage: null, requiredQuantity };
}

function result(itemId: string, itemName = itemId, itemCategory = "") {
  return { id: `res-${itemId}`, itemId, itemName, itemCategory, itemImage: null, producedQuantity: 1, chance: 1 };
}

function craftRecipe(overrides: Partial<AvailableCraftingRecipe> = {}): AvailableCraftingRecipe {
  return { ...recipe("r", "forge"), ...overrides };
}

function inv(itemId: string, quantity: number): InventoryLike {
  return { item: { id: itemId }, quantity };
}

describe("craft UX produit-first", () => {
  it("buildCraftRequestPayload borne quantity dans [1, 99]", () => {
    expect(buildCraftRequestPayload("r", 5)).toEqual({ recipeId: "r", quantity: 5 });
    expect(buildCraftRequestPayload("r", 0)).toEqual({ recipeId: "r", quantity: 1 });
    expect(buildCraftRequestPayload("r", 999)).toEqual({ recipeId: "r", quantity: 99 });
    expect(buildCraftRequestPayload("r", 3.9)).toEqual({ recipeId: "r", quantity: 3 });
  });

  it("countOwned somme toutes les lignes d'un même itemId", () => {
    const inventory = [inv("bois", 8), inv("charbon", 1), inv("bois", 2)];
    expect(countOwned(inventory, "bois")).toBe(10);
    expect(countOwned(inventory, "inconnu")).toBe(0);
    expect(countOwned(null, "bois")).toBe(0);
  });

  it("ingredientAvailability marque possédé/requis pour la quantité demandée", () => {
    const r = craftRecipe({ ingredients: [ingredient("bois", 5, "Bois"), ingredient("charbon", 2, "Charbon")] });
    const inventory = [inv("bois", 8), inv("charbon", 1)];
    const at1 = ingredientAvailability(r, inventory, 1);
    expect(at1).toEqual([
      { itemId: "bois", itemName: "Bois", itemImage: null, owned: 8, required: 5, enough: true },
      { itemId: "charbon", itemName: "Charbon", itemImage: null, owned: 1, required: 2, enough: false },
    ]);
    const at2 = ingredientAvailability(r, inventory, 2);
    expect(at2[0]).toMatchObject({ required: 10, enough: false });
  });

  it("computeMaxCraftable prend le minimum sur les ingrédients", () => {
    const r = craftRecipe({ ingredients: [ingredient("bois", 5), ingredient("charbon", 2)] });
    expect(computeMaxCraftable(r, [inv("bois", 15), inv("charbon", 4)])).toBe(2);
    expect(computeMaxCraftable(r, [inv("bois", 15), inv("charbon", 1)])).toBe(0);
  });

  it("computeMaxCraftable retourne la borne serveur sans ingrédient", () => {
    expect(computeMaxCraftable(craftRecipe({ ingredients: [] }), [])).toBe(99);
  });

  it("matchesRecipeQuery cherche produit, catégorie et type", () => {
    const sword = craftRecipe({
      name: "Assembler une épée",
      category: "smithing",
      results: [result("basic_sword", "Épée basique", "weapon")],
    });
    expect(matchesRecipeQuery(sword, "")).toBe(true);
    expect(matchesRecipeQuery(sword, "épée")).toBe(true);
    expect(matchesRecipeQuery(sword, "smith")).toBe(true);
    expect(matchesRecipeQuery(sword, "weapon")).toBe(true);
    expect(matchesRecipeQuery(sword, "potion")).toBe(false);
  });

  it("recipeProductLabel privilégie le nom de l'item output", () => {
    expect(recipeProductLabel(craftRecipe({ name: "Recette X", results: [result("i", "Épée")] }))).toBe("Épée");
    expect(recipeProductLabel(craftRecipe({ name: "Recette X", results: [] }))).toBe("Recette X");
  });

  it("formatCraftSeconds convertit ms → secondes et gère l'instantané", () => {
    expect(formatCraftSeconds(0)).toBe("instantané");
    expect(formatCraftSeconds(2000)).toBe("2 s");
    expect(formatCraftSeconds(2000, 3)).toBe("6 s");
    expect(formatCraftSeconds(1500)).toBe("1.5 s");
  });

  it("estimateCraftSkillXp reflète le Runtime (base 15 + floor(difficulté/10))", () => {
    expect(estimateCraftSkillXp(0)).toBe(15);
    expect(estimateCraftSkillXp(20)).toBe(17);
    expect(estimateCraftSkillXp(100)).toBe(25);
    expect(estimateCraftSkillXp(150)).toBe(25); // borné à 100
    expect(estimateCraftSkillXp(-5)).toBe(15); // borné à 0
  });
});
