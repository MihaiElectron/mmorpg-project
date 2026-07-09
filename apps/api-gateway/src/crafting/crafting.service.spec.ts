import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CraftingService, DEFAULT_CRAFTING_STATION_TEMPLATES, DEFAULT_RECIPES } from './crafting.service';
import { Item, ObjectMode } from '../items/entities/item.entity';
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { CraftingIngredient } from './entities/crafting-ingredient.entity';
import { CraftingResult } from './entities/crafting-result.entity';
import { CraftingStationTemplate } from './entities/crafting-station-template.entity';
import { CraftingStation } from './entities/crafting-station.entity';
import { WorldService } from '../world/world.service';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeItem(category: string, type = 'material', objectMode = ObjectMode.STACKABLE): Item {
  return { id: `item-${category}`, name: category, type, category, objectMode } as Item;
}

function makeRecipe(key: string): CraftingRecipe {
  return { id: `recipe-${key}`, key } as CraftingRecipe;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

describe('CraftingService — seedDefaultRecipes', () => {
  let service: CraftingService;
  let itemRepo: Record<string, jest.Mock>;
  let recipeRepo: Record<string, jest.Mock>;
  let ingredientRepo: Record<string, jest.Mock>;
  let resultRepo: Record<string, jest.Mock>;
  let stationTemplateRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    itemRepo = {
      findOne: jest.fn(),
    };

    recipeRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: `recipe-${x.key}` })),
    };

    ingredientRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
    };

    resultRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
    };
    stationTemplateRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CraftingService,
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: getRepositoryToken(CraftingRecipe), useValue: recipeRepo },
        { provide: getRepositoryToken(CraftingIngredient), useValue: ingredientRepo },
        { provide: getRepositoryToken(CraftingResult), useValue: resultRepo },
        { provide: getRepositoryToken(CraftingStationTemplate), useValue: stationTemplateRepo },
        { provide: getRepositoryToken(CraftingStation), useValue: { find: jest.fn() } },
        { provide: WorldService, useValue: { getConnectedPlayerByCharacterId: jest.fn() } },
      ],
    }).compile();

    service = module.get<CraftingService>(CraftingService);
  });

  it('ne recrée pas un station template déjà existant (seed non destructif)', async () => {
    stationTemplateRepo.findOne.mockResolvedValue({ key: 'forge' });

    await service.seedDefaultStationTemplates();

    expect(stationTemplateRepo.save).not.toHaveBeenCalled();
  });

  it('insère les station templates absents du seed minimum', async () => {
    stationTemplateRepo.findOne.mockResolvedValue(null);

    await service.seedDefaultStationTemplates();

    const savedKeys = stationTemplateRepo.save.mock.calls.map((call) => call[0].key);
    expect(savedKeys).toEqual(DEFAULT_CRAFTING_STATION_TEMPLATES.map((tpl) => tpl.key));
  });

  // ─── Non destructif ───────────────────────────────────────────────────────

  it('ne recrée pas une recette déjà existante (seed non destructif)', async () => {
    // Toutes les recettes "existent" déjà
    recipeRepo.findOne.mockResolvedValue(makeRecipe('iron_bar_from_ore'));

    await service.seedDefaultRecipes();

    expect(recipeRepo.save).not.toHaveBeenCalled();
  });

  it('insère une recette absente quand tous les items sont présents', async () => {
    recipeRepo.findOne.mockResolvedValue(null); // recette absente
    // Fournir les items nécessaires à iron_bar_from_ore
    itemRepo.findOne.mockImplementation(({ where }: any) => {
      const map: Record<string, Item> = {
        iron_ore: makeItem('iron_ore'),
        iron_bar: makeItem('iron_bar'),
      };
      return Promise.resolve(map[where.category] ?? null);
    });

    // Seed uniquement la première recette pour le test
    const originalRecipes = [...DEFAULT_RECIPES];
    (DEFAULT_RECIPES as any).length = 0;
    DEFAULT_RECIPES.push(originalRecipes[0]); // iron_bar_from_ore seulement

    await service.seedDefaultRecipes();

    // Restaurer pour ne pas affecter les autres tests
    DEFAULT_RECIPES.length = 0;
    originalRecipes.forEach((r) => DEFAULT_RECIPES.push(r));

    expect(recipeRepo.save).toHaveBeenCalledTimes(1);
    expect(recipeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'iron_bar_from_ore' }),
    );
  });

  // ─── Skip si item manquant ────────────────────────────────────────────────

  it('skippe la recette si un ingrédient est absent en DB', async () => {
    recipeRepo.findOne.mockResolvedValue(null);
    // ingrédient iron_ore absent
    itemRepo.findOne.mockResolvedValue(null);

    await service.seedDefaultRecipes();

    expect(recipeRepo.save).not.toHaveBeenCalled();
  });

  it('skippe la recette si un résultat est absent en DB', async () => {
    recipeRepo.findOne.mockResolvedValue(null);
    itemRepo.findOne
      .mockResolvedValueOnce(makeItem('iron_ore')) // ingrédient trouvé
      .mockResolvedValueOnce(null);                // résultat iron_bar absent

    // Seed uniquement iron_bar_from_ore pour isoler le test
    const originalRecipes = [...DEFAULT_RECIPES];
    (DEFAULT_RECIPES as any).length = 0;
    DEFAULT_RECIPES.push(originalRecipes[0]);

    await service.seedDefaultRecipes();

    DEFAULT_RECIPES.length = 0;
    originalRecipes.forEach((r) => DEFAULT_RECIPES.push(r));

    expect(recipeRepo.save).not.toHaveBeenCalled();
  });

  // ─── Ingrédients et résultats créés ──────────────────────────────────────

  it('crée les ingrédients après insertion de la recette', async () => {
    recipeRepo.findOne.mockResolvedValue(null);
    itemRepo.findOne.mockImplementation(({ where }: any) => {
      const map: Record<string, Item> = {
        iron_ore: makeItem('iron_ore'),
        iron_bar: makeItem('iron_bar'),
      };
      return Promise.resolve(map[where.category] ?? null);
    });

    const originalRecipes = [...DEFAULT_RECIPES];
    (DEFAULT_RECIPES as any).length = 0;
    DEFAULT_RECIPES.push(originalRecipes[0]); // iron_bar_from_ore : 1 ingrédient

    await service.seedDefaultRecipes();

    DEFAULT_RECIPES.length = 0;
    originalRecipes.forEach((r) => DEFAULT_RECIPES.push(r));

    expect(ingredientRepo.save).toHaveBeenCalledTimes(1);
    expect(ingredientRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ requiredQuantity: 3 }),
    );
  });

  it('crée les résultats après insertion de la recette', async () => {
    recipeRepo.findOne.mockResolvedValue(null);
    itemRepo.findOne.mockImplementation(({ where }: any) => {
      const map: Record<string, Item> = {
        iron_ore: makeItem('iron_ore'),
        iron_bar: makeItem('iron_bar'),
      };
      return Promise.resolve(map[where.category] ?? null);
    });

    const originalRecipes = [...DEFAULT_RECIPES];
    (DEFAULT_RECIPES as any).length = 0;
    DEFAULT_RECIPES.push(originalRecipes[0]); // iron_bar_from_ore : 1 résultat

    await service.seedDefaultRecipes();

    DEFAULT_RECIPES.length = 0;
    originalRecipes.forEach((r) => DEFAULT_RECIPES.push(r));

    expect(resultRepo.save).toHaveBeenCalledTimes(1);
    expect(resultRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ producedQuantity: 1, chance: 1.0 }),
    );
  });

  // ─── DEFAULT_RECIPES validité ─────────────────────────────────────────────

  describe('DEFAULT_RECIPES', () => {
    it('contient 4 recettes', () => {
      expect(DEFAULT_RECIPES).toHaveLength(4);
    });

    it('toutes les recettes ont une key unique', () => {
      const keys = DEFAULT_RECIPES.map((r) => r.key);
      const unique = new Set(keys);
      expect(unique.size).toBe(keys.length);
    });

    it('toutes les recettes référencent "smithing" ou "woodworking"', () => {
      const validMasteries = ['smithing', 'woodworking'];
      for (const recipe of DEFAULT_RECIPES) {
        expect(validMasteries).toContain(recipe.requiredMasteryKey);
      }
    });

    it('chaque recette a une category cohérente avec son requiredMasteryKey', () => {
      for (const recipe of DEFAULT_RECIPES) {
        expect(recipe.category).toBe(recipe.requiredMasteryKey);
      }
    });

    it('baseSuccessRate et minSuccessRate sont dans [0, 1]', () => {
      for (const recipe of DEFAULT_RECIPES) {
        expect(recipe.baseSuccessRate).toBeGreaterThanOrEqual(0);
        expect(recipe.baseSuccessRate).toBeLessThanOrEqual(1);
        expect(recipe.minSuccessRate).toBeGreaterThanOrEqual(0);
        expect(recipe.minSuccessRate).toBeLessThanOrEqual(1);
      }
    });

    it('minSuccessRate <= baseSuccessRate <= maxSuccessRate', () => {
      for (const recipe of DEFAULT_RECIPES) {
        expect(recipe.minSuccessRate).toBeLessThanOrEqual(recipe.baseSuccessRate);
        expect(recipe.baseSuccessRate).toBeLessThanOrEqual(recipe.maxSuccessRate);
      }
    });

    it('chaque recette a au moins 1 ingrédient et 1 résultat', () => {
      for (const recipe of DEFAULT_RECIPES) {
        expect(recipe.ingredients.length).toBeGreaterThanOrEqual(1);
        expect(recipe.results.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('tous les xpReward sont > 0', () => {
      for (const recipe of DEFAULT_RECIPES) {
        expect(recipe.xpReward).toBeGreaterThan(0);
      }
    });
  });
});

