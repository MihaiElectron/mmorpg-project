import type { ItemCatalogEntry } from "../Items/itemEditor.types";
import type {
  RecipeCollectionsValidation,
  RecipeIngredient,
  RecipePatch,
  RecipeResult,
} from "./recipeEditor.types";

function knownItemIds(items: ItemCatalogEntry[]): Set<string> {
  return new Set(items.map((item) => item.id));
}

function duplicateItemIds(entries: Array<{ itemId: string }>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  entries.forEach((entry) => {
    const itemId = entry.itemId.trim();
    if (!itemId) return;
    if (seen.has(itemId)) duplicates.add(itemId);
    seen.add(itemId);
  });
  return [...duplicates];
}

export function validateRecipeIngredients(
  ingredients: RecipeIngredient[],
  items: ItemCatalogEntry[],
): RecipeCollectionsValidation {
  const ids = knownItemIds(items);
  const errors: string[] = [];

  if (ingredients.length === 0) errors.push("ingredients obligatoire");

  ingredients.forEach((ingredient, index) => {
    const itemId = ingredient.itemId.trim();
    if (!itemId) errors.push(`ingredients[${index}].itemId requis`);
    else if (!ids.has(itemId)) errors.push(`ingredients[${index}].itemId inconnu`);
    if (
      !Number.isInteger(ingredient.requiredQuantity) ||
      ingredient.requiredQuantity < 1
    ) {
      errors.push(`ingredients[${index}].requiredQuantity >= 1`);
    }
  });

  duplicateItemIds(ingredients).forEach((itemId) => {
    errors.push(`ingredients doublon ${itemId}`);
  });

  return { valid: errors.length === 0, errors };
}

export function validateRecipeResults(
  results: RecipeResult[],
  items: ItemCatalogEntry[],
): RecipeCollectionsValidation {
  const ids = knownItemIds(items);
  const errors: string[] = [];

  if (results.length === 0) errors.push("results obligatoire");

  results.forEach((result, index) => {
    const itemId = result.itemId.trim();
    if (!itemId) errors.push(`results[${index}].itemId requis`);
    else if (!ids.has(itemId)) errors.push(`results[${index}].itemId inconnu`);
    if (
      !Number.isInteger(result.producedQuantity) ||
      result.producedQuantity < 1
    ) {
      errors.push(`results[${index}].producedQuantity >= 1`);
    }
    if (
      !Number.isFinite(result.chance) ||
      result.chance < 0 ||
      result.chance > 1
    ) {
      errors.push(`results[${index}].chance entre 0 et 1`);
    }
  });

  duplicateItemIds(results).forEach((itemId) => {
    errors.push(`results doublon ${itemId}`);
  });

  return { valid: errors.length === 0, errors };
}

export function buildRecipePatch(
  current: RecipePatch,
  draft: RecipePatch,
): RecipePatch {
  const patch: RecipePatch = {};
  const keys = Object.keys(draft) as Array<keyof RecipePatch>;

  keys.forEach((key) => {
    const next = draft[key];
    const previous = current[key];
    if (typeof next === "string") {
      const trimmed = next.trim();
      if (trimmed !== (previous ?? "")) {
        patch[key] = trimmed as never;
      }
      return;
    }
    if (next !== previous) {
      patch[key] = next as never;
    }
  });

  return patch;
}

export function normalizeIngredients(
  ingredients: RecipeIngredient[],
): RecipeIngredient[] {
  return ingredients.map((ingredient) => ({
    itemId: ingredient.itemId.trim(),
    requiredQuantity: ingredient.requiredQuantity,
  }));
}

export function normalizeResults(results: RecipeResult[]): RecipeResult[] {
  return results.map((result) => ({
    itemId: result.itemId.trim(),
    producedQuantity: result.producedQuantity,
    chance: result.chance,
  }));
}
