import { toCraftingRecipeWorldObject, CraftingRecipeWorldObject } from './crafting-recipe-world-object.adapter';
import { CraftingRecipe } from '../entities/crafting-recipe.entity';

function makeRecipe(overrides: Partial<CraftingRecipe> = {}): CraftingRecipe {
  return {
    id: 'rec-uuid-1',
    key: 'iron_bar_from_ore',
    name: 'Fondre du minerai',
    description: 'Fait fondre 3 minerais.',
    category: 'smithing',
    requiredMasteryKey: 'smithing',
    requiredMasteryLevel: 1,
    baseSuccessRate: 1.0,
    successBonusPerLevel: 0.0,
    minSuccessRate: 1.0,
    maxSuccessRate: 1.0,
    xpReward: 10,
    consumeIngredientsOnFailure: true,
    craftTimeMs: 2000,
    stationType: 'none',
    enabled: true,
    isDefault: true,
    ingredients: [],
    results: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as CraftingRecipe;
}

describe('toCraftingRecipeWorldObject — forme de base', () => {
  it('retourne kind="definition" et category="crafting"', () => {
    const wo = toCraftingRecipeWorldObject(makeRecipe());
    expect(wo.kind).toBe('definition');
    expect(wo.category).toBe('crafting');
  });

  it('id reflète recipe.id, type reflète recipe.key', () => {
    const wo = toCraftingRecipeWorldObject(makeRecipe({ id: 'abc', key: 'my_recipe' }));
    expect(wo.id).toBe('abc');
    expect(wo.type).toBe('my_recipe');
  });

  it('mapId et position sont null', () => {
    const wo = toCraftingRecipeWorldObject(makeRecipe());
    expect(wo.mapId).toBeNull();
    expect(wo.position).toBeNull();
  });
});

describe('toCraftingRecipeWorldObject — state', () => {
  it('state "enabled" si enabled=true', () => {
    expect(toCraftingRecipeWorldObject(makeRecipe({ enabled: true })).state).toBe('enabled');
  });

  it('state "disabled" si enabled=false', () => {
    expect(toCraftingRecipeWorldObject(makeRecipe({ enabled: false })).state).toBe('disabled');
  });
});

describe('toCraftingRecipeWorldObject — capabilities', () => {
  it('expose les 3 capabilities attendues', () => {
    const wo = toCraftingRecipeWorldObject(makeRecipe());
    expect(wo.capabilities).toEqual(['crafting_recipe', 'validation', 'crafting']);
  });

  it('capabilities est frozen', () => {
    expect(Object.isFrozen(toCraftingRecipeWorldObject(makeRecipe()).capabilities)).toBe(true);
  });
});

describe('toCraftingRecipeWorldObject — metadata', () => {
  it('expose tous les champs scalaires', () => {
    const wo = toCraftingRecipeWorldObject(makeRecipe());
    const m = wo.metadata;
    expect(m.name).toBe('Fondre du minerai');
    expect(m.description).toBe('Fait fondre 3 minerais.');
    expect(m.category).toBe('smithing');
    expect(m.requiredMasteryKey).toBe('smithing');
    expect(m.requiredMasteryLevel).toBe(1);
    expect(m.baseSuccessRate).toBe(1.0);
    expect(m.xpReward).toBe(10);
    expect(m.consumeIngredientsOnFailure).toBe(true);
    expect(m.craftTimeMs).toBe(2000);
    expect(m.stationType).toBe('none');
  });

  it('description null si non fournie', () => {
    const wo = toCraftingRecipeWorldObject(makeRecipe({ description: null }));
    expect(wo.metadata.description).toBeNull();
  });

  it('expose les ingredients', () => {
    const ing = { id: 'ing-1', itemId: 'item-1', requiredQuantity: 3, recipeId: 'rec-1' } as any;
    const wo = toCraftingRecipeWorldObject(makeRecipe({ ingredients: [ing] }));
    expect(wo.metadata.ingredients).toHaveLength(1);
    expect(wo.metadata.ingredients[0].itemId).toBe('item-1');
    expect(wo.metadata.ingredients[0].requiredQuantity).toBe(3);
  });

  it('expose les results', () => {
    const res = { id: 'res-1', itemId: 'item-2', producedQuantity: 1, chance: 0.5, recipeId: 'rec-1' } as any;
    const wo = toCraftingRecipeWorldObject(makeRecipe({ results: [res] }));
    expect(wo.metadata.results).toHaveLength(1);
    expect(wo.metadata.results[0].chance).toBe(0.5);
  });

  it('ingredients vides si recipe.ingredients non chargé (undefined)', () => {
    const wo = toCraftingRecipeWorldObject(makeRecipe({ ingredients: undefined as any }));
    expect(wo.metadata.ingredients).toHaveLength(0);
  });

  it('metadata est frozen', () => {
    expect(Object.isFrozen(toCraftingRecipeWorldObject(makeRecipe()).metadata)).toBe(true);
  });
});

describe('toCraftingRecipeWorldObject — immutabilité', () => {
  it('le WorldObject retourné est frozen', () => {
    expect(Object.isFrozen(toCraftingRecipeWorldObject(makeRecipe()))).toBe(true);
  });
});
