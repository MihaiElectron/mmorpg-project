import { describe, expect, it } from "vitest";
import {
  buildRecipePatch,
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
});
