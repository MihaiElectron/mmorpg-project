import {
  normalizeIngredients,
  normalizeResults,
} from "./recipeEditorHelpers";
import type {
  CraftingRecipe,
  RecipeIngredient,
  RecipePatch,
  RecipeResult,
  RecipeValidationResult,
} from "./recipeEditor.types";

const API = import.meta.env.VITE_API_URL as string;

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` };
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return typeof body.message === "string"
    ? body.message
    : `Erreur ${res.status}`;
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export function fetchRecipes(): Promise<CraftingRecipe[]> {
  return requestJson<CraftingRecipe[]>("/admin/crafting-recipes");
}

export function fetchRecipe(id: string): Promise<CraftingRecipe> {
  return requestJson<CraftingRecipe>(
    `/admin/crafting-recipes/${encodeURIComponent(id)}`,
  );
}

export function updateRecipe(
  id: string,
  patch: RecipePatch,
): Promise<CraftingRecipe> {
  return requestJson<CraftingRecipe>(
    `/admin/crafting-recipes/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
}

export function replaceRecipeIngredients(
  id: string,
  ingredients: RecipeIngredient[],
): Promise<CraftingRecipe> {
  return requestJson<CraftingRecipe>(
    `/admin/crafting-recipes/${encodeURIComponent(id)}/ingredients`,
    {
      method: "PUT",
      body: JSON.stringify({ ingredients: normalizeIngredients(ingredients) }),
    },
  );
}

export function replaceRecipeResults(
  id: string,
  results: RecipeResult[],
): Promise<CraftingRecipe> {
  return requestJson<CraftingRecipe>(
    `/admin/crafting-recipes/${encodeURIComponent(id)}/results`,
    {
      method: "PUT",
      body: JSON.stringify({ results: normalizeResults(results) }),
    },
  );
}

export function validateRecipe(id: string): Promise<RecipeValidationResult> {
  return requestJson<RecipeValidationResult>(
    `/admin/crafting-recipes/${encodeURIComponent(id)}/validate`,
  );
}
