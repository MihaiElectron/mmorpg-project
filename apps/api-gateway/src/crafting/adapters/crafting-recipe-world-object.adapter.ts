import { CraftingRecipe } from '../entities/crafting-recipe.entity';

export type CraftingRecipeCapability = 'crafting_recipe' | 'validation' | 'crafting';

export interface CraftingIngredientSnapshot {
  readonly id: string;
  readonly itemId: string;
  readonly requiredQuantity: number;
}

export interface CraftingResultSnapshot {
  readonly id: string;
  readonly itemId: string;
  readonly producedQuantity: number;
  readonly chance: number;
}

export interface CraftingRecipeMetadata {
  readonly name: string;
  readonly description: string | null;
  readonly category: string;
  readonly requiredSkillKey: string;
  readonly requiredSkillLevel: number;
  readonly baseSuccessRate: number;
  readonly successBonusPerLevel: number;
  readonly minSuccessRate: number;
  readonly maxSuccessRate: number;
  readonly xpReward: number;
  readonly consumeIngredientsOnFailure: boolean;
  readonly craftTimeMs: number;
  readonly stationType: string;
  readonly ingredients: readonly CraftingIngredientSnapshot[];
  readonly results: readonly CraftingResultSnapshot[];
}

export interface CraftingRecipeWorldObject {
  readonly kind: 'definition';
  readonly category: 'crafting';
  readonly id: string;
  readonly type: string;
  readonly mapId: null;
  readonly position: null;
  readonly state: 'enabled' | 'disabled';
  readonly capabilities: readonly CraftingRecipeCapability[];
  readonly metadata: CraftingRecipeMetadata;
}

const CAPABILITIES: readonly CraftingRecipeCapability[] = Object.freeze([
  'crafting_recipe',
  'validation',
  'crafting',
]);

export function toCraftingRecipeWorldObject(recipe: CraftingRecipe): CraftingRecipeWorldObject {
  return Object.freeze({
    kind: 'definition',
    category: 'crafting',
    id: recipe.id,
    type: recipe.key,
    mapId: null,
    position: null,
    state: recipe.enabled ? 'enabled' : 'disabled',
    capabilities: CAPABILITIES,
    metadata: Object.freeze({
      name: recipe.name,
      description: recipe.description ?? null,
      category: recipe.category,
      requiredSkillKey: recipe.requiredSkillKey,
      requiredSkillLevel: recipe.requiredSkillLevel,
      baseSuccessRate: recipe.baseSuccessRate,
      successBonusPerLevel: recipe.successBonusPerLevel,
      minSuccessRate: recipe.minSuccessRate,
      maxSuccessRate: recipe.maxSuccessRate,
      xpReward: recipe.xpReward,
      consumeIngredientsOnFailure: recipe.consumeIngredientsOnFailure,
      craftTimeMs: recipe.craftTimeMs,
      stationType: recipe.stationType,
      ingredients: Object.freeze(
        (recipe.ingredients ?? []).map((ing) =>
          Object.freeze({ id: ing.id, itemId: ing.itemId, requiredQuantity: ing.requiredQuantity }),
        ),
      ),
      results: Object.freeze(
        (recipe.results ?? []).map((res) =>
          Object.freeze({ id: res.id, itemId: res.itemId, producedQuantity: res.producedQuantity, chance: res.chance }),
        ),
      ),
    }),
  });
}
