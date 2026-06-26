import { create } from "zustand";
import {
  fetchRecipe,
  fetchRecipes,
  replaceRecipeIngredients,
  replaceRecipeResults,
  updateRecipe,
  validateRecipe,
} from "../components/DevTools/modules/Recipes/recipeEditorApi";
import type {
  CraftingRecipe,
  RecipeIngredient,
  RecipePatch,
  RecipeResult,
  RecipeValidationResult,
} from "../components/DevTools/modules/Recipes/recipeEditor.types";

type RecipeStoreStatus = "idle" | "loading" | "loaded" | "error";

interface RecipesState {
  recipes: CraftingRecipe[];
  selectedRecipeId: string | null;
  selectedRecipe: CraftingRecipe | null;
  validation: RecipeValidationResult | null;
  status: RecipeStoreStatus;
  error: string | null;
  setSelectedRecipeId: (id: string | null) => void;
  loadRecipes: () => Promise<void>;
  loadRecipe: (id: string) => Promise<void>;
  saveRecipePatch: (id: string, patch: RecipePatch) => Promise<CraftingRecipe>;
  saveIngredients: (
    id: string,
    ingredients: RecipeIngredient[],
  ) => Promise<CraftingRecipe>;
  saveResults: (id: string, results: RecipeResult[]) => Promise<CraftingRecipe>;
  runValidation: (id: string) => Promise<RecipeValidationResult>;
}

function replaceRecipeInList(
  recipes: CraftingRecipe[],
  next: CraftingRecipe,
): CraftingRecipe[] {
  const exists = recipes.some((recipe) => recipe.id === next.id);
  if (!exists) return [...recipes, next];
  return recipes.map((recipe) => (recipe.id === next.id ? next : recipe));
}

export const useRecipesStore = create<RecipesState>((set, get) => ({
  recipes: [],
  selectedRecipeId: null,
  selectedRecipe: null,
  validation: null,
  status: "idle",
  error: null,

  setSelectedRecipeId: (id) => set({ selectedRecipeId: id }),

  loadRecipes: async () => {
    set({ status: "loading", error: null });
    try {
      const recipes = await fetchRecipes();
      set({
        recipes,
        selectedRecipeId: get().selectedRecipeId ?? recipes[0]?.id ?? null,
        status: "loaded",
      });
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : "Erreur chargement recettes.",
      });
    }
  },

  loadRecipe: async (id) => {
    set({ status: "loading", error: null, selectedRecipeId: id });
    try {
      const recipe = await fetchRecipe(id);
      set({
        selectedRecipe: recipe,
        recipes: replaceRecipeInList(get().recipes, recipe),
        status: "loaded",
      });
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : "Erreur chargement recette.",
      });
    }
  },

  saveRecipePatch: async (id, patch) => {
    const recipe = await updateRecipe(id, patch);
    set({
      selectedRecipe: recipe,
      recipes: replaceRecipeInList(get().recipes, recipe),
    });
    return recipe;
  },

  saveIngredients: async (id, ingredients) => {
    const recipe = await replaceRecipeIngredients(id, ingredients);
    set({
      selectedRecipe: recipe,
      recipes: replaceRecipeInList(get().recipes, recipe),
    });
    return recipe;
  },

  saveResults: async (id, results) => {
    const recipe = await replaceRecipeResults(id, results);
    set({
      selectedRecipe: recipe,
      recipes: replaceRecipeInList(get().recipes, recipe),
    });
    return recipe;
  },

  runValidation: async (id) => {
    const validation = await validateRecipe(id);
    set({ validation });
    return validation;
  },
}));
