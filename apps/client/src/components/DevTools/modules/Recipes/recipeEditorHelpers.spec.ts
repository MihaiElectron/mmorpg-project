import { describe, expect, it } from "vitest";
import {
  buildRecipePatch,
  craftTimeMsToSeconds,
  craftTimeSecondsToMs,
  isValidCraftTimeMs,
  MIN_CRAFT_TIME_MS,
  normalizeIngredients,
  normalizeResults,
  validateRecipeIngredients,
  validateRecipeResults,
} from "./recipeEditorHelpers";
import type { ItemCatalogEntry } from "../Items/itemEditor.types";

const ITEMS: ItemCatalogEntry[] = [
  {
    id: "item-ore",
    name: "Minerai",
    type: "material",
    category: "iron_ore",
    image: null,
  },
  {
    id: "item-bar",
    name: "Lingot",
    type: "material",
    category: "iron_bar",
    image: null,
  },
];

describe("recipe editor helpers", () => {
  it("valide les ingredients avec item existant et quantité positive", () => {
    const result = validateRecipeIngredients(
      [{ itemId: "item-ore", requiredQuantity: 2 }],
      ITEMS,
    );

    expect(result.valid).toBe(true);
  });

  it("impose au moins un ingrédient", () => {
    expect(validateRecipeIngredients([], ITEMS).errors).toContain(
      "ingredients obligatoire",
    );
  });

  it("rejette les ingredients invalides et les doublons", () => {
    const result = validateRecipeIngredients(
      [
        { itemId: "missing", requiredQuantity: 0 },
        { itemId: "item-ore", requiredQuantity: 1 },
        { itemId: "item-ore", requiredQuantity: 2 },
      ],
      ITEMS,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("ingredients[0].itemId inconnu");
    expect(result.errors).toContain("ingredients[0].requiredQuantity >= 1");
    expect(result.errors).toContain("ingredients doublon item-ore");
  });

  it("impose au moins un résultat valide", () => {
    expect(validateRecipeResults([], ITEMS).errors).toContain(
      "results obligatoire",
    );

    const result = validateRecipeResults(
      [{ itemId: "item-bar", producedQuantity: 1, chance: 1 }],
      ITEMS,
    );

    expect(result.valid).toBe(true);
  });

  it("rejette result item inconnu, quantité invalide, chance hors bornes et doublon", () => {
    const result = validateRecipeResults(
      [
        { itemId: "missing", producedQuantity: 0, chance: 1.2 },
        { itemId: "item-bar", producedQuantity: 1, chance: 1 },
        { itemId: "item-bar", producedQuantity: 2, chance: 0.5 },
      ],
      ITEMS,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("results[0].itemId inconnu");
    expect(result.errors).toContain("results[0].producedQuantity >= 1");
    expect(result.errors).toContain("results[0].chance entre 0 et 1");
    expect(result.errors).toContain("results doublon item-bar");
  });

  it("construit un patch de recette minimal", () => {
    expect(
      buildRecipePatch(
        { name: "Lingot", enabled: true, requiredSkillLevel: 1 },
        { name: " Lingot raffiné ", enabled: true, requiredSkillLevel: 2 },
      ),
    ).toEqual({ name: "Lingot raffiné", requiredSkillLevel: 2 });
  });

  it("normalise ingredients et résultats avant envoi API", () => {
    expect(
      normalizeIngredients([{ itemId: " item-ore ", requiredQuantity: 3 }]),
    ).toEqual([{ itemId: "item-ore", requiredQuantity: 3 }]);

    expect(
      normalizeResults([{ itemId: " item-bar ", producedQuantity: 1, chance: 0.8 }]),
    ).toEqual([{ itemId: "item-bar", producedQuantity: 1, chance: 0.8 }]);
  });

  it("craftTimeSecondsToMs convertit les secondes UI en millisecondes (payload)", () => {
    expect(craftTimeSecondsToMs("10")).toBe(10000); // 10 s, jamais 10 ms
    expect(craftTimeSecondsToMs("0.5")).toBe(500);
    expect(craftTimeSecondsToMs("0")).toBe(0);
    expect(craftTimeSecondsToMs("")).toBe(0);
    expect(craftTimeSecondsToMs("-5")).toBe(0);
  });

  it("craftTimeMsToSeconds convertit les millisecondes en secondes (affichage)", () => {
    expect(craftTimeMsToSeconds(10000)).toBe("10");
    expect(craftTimeMsToSeconds(500)).toBe("0.5");
    expect(craftTimeMsToSeconds(0)).toBe("0");
    expect(craftTimeMsToSeconds("")).toBe("");
    expect(craftTimeMsToSeconds(null)).toBe("");
  });

  it("aller-retour secondes → ms → secondes est stable", () => {
    expect(craftTimeMsToSeconds(craftTimeSecondsToMs("10"))).toBe("10");
    expect(craftTimeMsToSeconds(craftTimeSecondsToMs("2.5"))).toBe("2.5");
  });

  it("isValidCraftTimeMs refuse < 3000 ms (aucune recette instantanée)", () => {
    expect(MIN_CRAFT_TIME_MS).toBe(3000);
    for (const ms of [0, 500, 1000, 2000, 2999]) {
      expect(isValidCraftTimeMs(ms)).toBe(false);
    }
    for (const ms of [3000, 5000, 10000]) {
      expect(isValidCraftTimeMs(ms)).toBe(true);
    }
    // équivalences secondes UI → ms
    expect(isValidCraftTimeMs(craftTimeSecondsToMs("2"))).toBe(false);
    expect(isValidCraftTimeMs(craftTimeSecondsToMs("3"))).toBe(true);
  });
});
