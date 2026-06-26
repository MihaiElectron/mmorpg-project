export interface RecipeIngredient {
  id?: string;
  recipeId?: string;
  itemId: string;
  requiredQuantity: number;
}

export interface RecipeResult {
  id?: string;
  recipeId?: string;
  itemId: string;
  producedQuantity: number;
  chance: number;
}

export interface CraftingRecipe {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  requiredSkillKey: string;
  requiredSkillLevel: number;
  baseSuccessRate: number;
  successBonusPerLevel: number;
  minSuccessRate: number;
  maxSuccessRate: number;
  xpReward: number;
  consumeIngredientsOnFailure: boolean;
  craftTimeMs: number;
  stationType: string;
  enabled: boolean;
  isDefault?: boolean;
  ingredients: RecipeIngredient[];
  results: RecipeResult[];
}

export type RecipePatch = Partial<
  Pick<
    CraftingRecipe,
    | "name"
    | "description"
    | "category"
    | "requiredSkillKey"
    | "requiredSkillLevel"
    | "baseSuccessRate"
    | "successBonusPerLevel"
    | "minSuccessRate"
    | "maxSuccessRate"
    | "xpReward"
    | "consumeIngredientsOnFailure"
    | "craftTimeMs"
    | "stationType"
    | "enabled"
  >
>;

export interface RecipeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface RecipeCollectionsValidation {
  valid: boolean;
  errors: string[];
}
