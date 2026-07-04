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

// ── Durée de craft : édition en secondes, stockage/payload en millisecondes ──
// Évite que « 10 » soit interprété comme 10 ms dans le Recipe Editor.
//
// Règle métier (ADR-0009, cohérente Runtime ⇄ DevTools) : aucune recette
// instantanée — toute fabrication crée un CraftJob. Durée minimale 3 s.

export const MIN_CRAFT_TIME_SECONDS = 3;
export const MIN_CRAFT_TIME_MS = MIN_CRAFT_TIME_SECONDS * 1000;
export const MIN_CRAFT_TIME_MESSAGE = "La durée minimale d'une recette est de 3 secondes.";

/**
 * Miroir lecture seule de la règle serveur `FAILURE_SKILL_XP_MULTIPLIER`
 * (crafting.constants.ts). Une tentative ratée n'accorde pas d'XP perso mais
 * 25 % de l'XP compétence d'un succès. Aperçu DevTools uniquement — le serveur
 * reste l'autorité de calcul.
 */
export const FAILURE_SKILL_XP_MULTIPLIER = 0.25;

/**
 * Chance de succès EFFECTIVE au niveau requis (aperçu DevTools, lecture seule).
 * Au niveau requis, le bonus est nul : le serveur applique clamp(base, min, max).
 * Retourne un pourcentage entier arrondi.
 */
export function effectiveSuccessAtRequiredLevelPercent(
  baseSuccessRate: number,
  minSuccessRate: number,
  maxSuccessRate: number,
): number {
  const clamped = Math.min(maxSuccessRate, Math.max(minSuccessRate, baseSuccessRate));
  return Math.round(clamped * 100);
}

/** true si la durée (ms) respecte le minimum autorisé. */
export function isValidCraftTimeMs(ms: number | string | null | undefined): boolean {
  const n = Number(ms);
  return Number.isFinite(n) && n >= MIN_CRAFT_TIME_MS;
}

/** ms → secondes (affichage). Chaîne vide conservée pour un champ vide. */
export function craftTimeMsToSeconds(ms: number | string | null | undefined): string {
  if (ms === "" || ms == null) return "";
  const n = Number(ms);
  if (!Number.isFinite(n)) return "";
  return String(n / 1000);
}

/** secondes → ms (payload). Arrondi à l'entier, jamais négatif. */
export function craftTimeSecondsToMs(seconds: number | string | null | undefined): number {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1000);
}
