import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CraftingService, DEFAULT_CRAFTING_STATION_TEMPLATES, DEFAULT_RECIPES } from './crafting.service';
import { Item } from '../items/entities/item.entity';
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { CraftingIngredient } from './entities/crafting-ingredient.entity';
import { CraftingResult } from './entities/crafting-result.entity';
import { CraftingStationTemplate } from './entities/crafting-station-template.entity';
import { CraftingStation } from './entities/crafting-station.entity';
import { Character } from '../characters/entities/character.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { SkillDefinition } from '../skills/entities/skill-definition.entity';
import { PlayerSkill } from '../skills/entities/player-skill.entity';
import { SkillsService } from '../skills/skills.service';
import { WorldService } from '../world/world.service';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeItem(category: string, type = 'material'): Item {
  return { id: `item-${category}`, name: category, type, category } as Item;
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
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: SkillsService, useValue: {} },
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
      const validSkills = ['smithing', 'woodworking'];
      for (const recipe of DEFAULT_RECIPES) {
        expect(validSkills).toContain(recipe.requiredSkillKey);
      }
    });

    it('chaque recette a une category cohérente avec son requiredSkillKey', () => {
      for (const recipe of DEFAULT_RECIPES) {
        expect(recipe.category).toBe(recipe.requiredSkillKey);
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

// ─── CraftingService — craft() ────────────────────────────────────────────────

// Factories locales pour craft()
function makeCharacter(id = 'char-1'): Character {
  return { id } as Character;
}

function makeSkillDef(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: 'skilldef-1',
    key: 'smithing',
    name: 'Smithing',
    category: 'crafting',
    maxLevel: 100,
    baseXpPerLevel: 100,
    xpCurveExponent: 1.5,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SkillDefinition;
}

function makePlayerSkill(overrides: Partial<PlayerSkill> = {}): PlayerSkill {
  return {
    id: 'ps-1',
    characterId: 'char-1',
    skillDefinitionId: 'skilldef-1',
    level: 10,
    xp: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PlayerSkill;
}

function makeFullRecipe(overrides: Partial<CraftingRecipe> = {}): CraftingRecipe {
  return {
    id: 'recipe-1',
    key: 'iron_bar_from_ore',
    name: 'Fondre minerai',
    description: null,
    category: 'smithing',
    requiredSkillKey: 'smithing',
    requiredSkillLevel: 1,
    baseSuccessRate: 1.0,
    successBonusPerLevel: 0.02,
    minSuccessRate: 0.05,
    maxSuccessRate: 1.0,
    xpReward: 10,
    consumeIngredientsOnFailure: true,
    craftTimeMs: 2000,
    stationType: 'none',
    enabled: true,
    isDefault: true,
    ingredients: [{ id: 'ing-1', itemId: 'item-iron_ore', requiredQuantity: 3 } as CraftingIngredient],
    results: [{ id: 'res-1', itemId: 'item-iron_bar', producedQuantity: 1, chance: 1.0 } as CraftingResult],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CraftingRecipe;
}

function makeInventoryRow(itemId: string, quantity: number): Inventory {
  return {
    id: `inv-${itemId}`,
    item: { id: itemId } as Item,
    quantity,
    equipped: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Inventory;
}

describe('CraftingService — craft()', () => {
  let service: CraftingService;
  let mockManager: Record<string, jest.Mock>;
  let mockDataSource: { transaction: jest.Mock };
  let mockSkillsService: Partial<Record<keyof SkillsService, jest.Mock>>;
  let mockWorldService: { getConnectedPlayerByCharacterId: jest.Mock };

  beforeEach(async () => {
    mockManager = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn().mockImplementation((_entity, data) => Promise.resolve({ ...data })),
      create: jest.fn().mockImplementation((_entity, data) => ({ ...data })),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    mockDataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };

    mockSkillsService = {
      getOrCreatePlayerSkillInTx: jest.fn(),
      applyXpInTx: jest.fn().mockImplementation(async (ps) => ps),
      getNextLevelXp: jest.fn().mockReturnValue(100),
    };
    mockWorldService = {
      getConnectedPlayerByCharacterId: jest.fn().mockReturnValue({
        socketId: 'socket-1',
        characterId: 'char-1',
        name: 'Hero',
        worldX: 1000,
        worldY: 1000,
        mapId: 1,
        x: 100,
        y: 100,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CraftingService,
        { provide: getRepositoryToken(Item), useValue: {} },
        { provide: getRepositoryToken(CraftingRecipe), useValue: {} },
        { provide: getRepositoryToken(CraftingIngredient), useValue: {} },
        { provide: getRepositoryToken(CraftingResult), useValue: {} },
        { provide: getRepositoryToken(CraftingStationTemplate), useValue: {} },
        { provide: DataSource, useValue: mockDataSource },
        { provide: SkillsService, useValue: mockSkillsService },
        { provide: WorldService, useValue: mockWorldService },
      ],
    }).compile();

    service = module.get<CraftingService>(CraftingService);
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setupHappyPath(quantity = 1) {
    const character = makeCharacter();
    const recipe = makeFullRecipe();
    const skillDef = makeSkillDef();
    const playerSkill = makePlayerSkill({ level: 10 });
    const inventoryRow = makeInventoryRow('item-iron_ore', 3 * quantity + 10);

    // manager.findOne retourne la bonne entité selon le type
    mockManager.findOne.mockImplementation((entity: any, opts: any) => {
      if (entity === Character) return Promise.resolve(character);
      if (entity === CraftingRecipe) return Promise.resolve(recipe);
      if (entity === SkillDefinition) return Promise.resolve(skillDef);
      if (entity === Inventory) return Promise.resolve(null); // pas d'inventaire existant pour la production
      return Promise.resolve(null);
    });

    mockManager.find.mockResolvedValue([inventoryRow]);

    mockSkillsService.getOrCreatePlayerSkillInTx!.mockResolvedValue(playerSkill);
    mockSkillsService.applyXpInTx!.mockImplementation(async (ps) => ps);

    // Succès garanti
    service['_randomFn'] = jest.fn().mockReturnValue(0.0);

    return { character, recipe, skillDef, playerSkill, inventoryRow };
  }

  // ── Tests ──────────────────────────────────────────────────────────────────

  it('craft succès 100% : consomme ingrédients, ajoute résultat, ajoute XP', async () => {
    setupHappyPath(1);

    const result = await service.craft('char-1', 'recipe-1', 1);

    expect(result.successes).toBe(1);
    expect(result.failures).toBe(0);
    expect(result.consumed).toEqual([{ itemId: 'item-iron_ore', quantity: 3 }]);
    expect(result.produced).toEqual([{ itemId: 'item-iron_bar', quantity: 1 }]);
    expect(result.skill.xpGained).toBe(10); // xpReward × 1 tentative
    // save appelé pour : consommation (quantité restante) + production (nouveau slot)
    expect(mockManager.save).toHaveBeenCalled();
    expect(mockSkillsService.applyXpInTx).toHaveBeenCalledWith(
      expect.anything(),
      10,
      expect.anything(),
      mockManager,
    );
  });

  it('recette stationType none fonctionne sans station', async () => {
    setupHappyPath(1);

    const result = await service.craft('char-1', 'recipe-1', 1);

    expect(result.successes).toBe(1);
    expect(mockWorldService.getConnectedPlayerByCharacterId).not.toHaveBeenCalled();
  });

  it('recette forge échoue sans forge proche', async () => {
    setupHappyPath(1);
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve(makeCharacter());
      if (entity === CraftingRecipe) return Promise.resolve(makeFullRecipe({ stationType: 'forge' }));
      return Promise.resolve(null);
    });
    mockManager.find.mockResolvedValue([]);

    await expect(service.craft('char-1', 'recipe-1', 1)).rejects.toThrow(/Station "forge" requise/);
    expect(mockSkillsService.getOrCreatePlayerSkillInTx).not.toHaveBeenCalled();
  });

  it('recette forge réussit avec forge proche', async () => {
    setupHappyPath(1);
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve(makeCharacter());
      if (entity === CraftingRecipe) return Promise.resolve(makeFullRecipe({ stationType: 'forge' }));
      if (entity === SkillDefinition) return Promise.resolve(makeSkillDef());
      if (entity === Inventory) return Promise.resolve(null);
      return Promise.resolve(null);
    });
    mockManager.find
      .mockResolvedValueOnce([
        {
          id: 'station-1',
          templateId: 'tpl-forge',
          mapId: 1,
          worldX: 1200,
          worldY: 1000,
          enabled: true,
          template: { stationType: 'forge', interactionRadiusWU: 1536, enabled: true },
        } as CraftingStation,
      ])
      .mockResolvedValueOnce([makeInventoryRow('item-iron_ore', 13)]);

    const result = await service.craft('char-1', 'recipe-1', 1);

    expect(result.successes).toBe(1);
  });

  it('station disabled ignorée', async () => {
    setupHappyPath(1);
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve(makeCharacter());
      if (entity === CraftingRecipe) return Promise.resolve(makeFullRecipe({ stationType: 'forge' }));
      return Promise.resolve(null);
    });
    mockManager.find.mockResolvedValue([
      {
        mapId: 1,
        worldX: 1000,
        worldY: 1000,
        enabled: false,
        template: { stationType: 'forge', interactionRadiusWU: 1536, enabled: true },
      } as CraftingStation,
    ]);

    await expect(service.craft('char-1', 'recipe-1', 1)).rejects.toThrow(/Station "forge" requise/);
  });

  it('template disabled ignoré', async () => {
    setupHappyPath(1);
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve(makeCharacter());
      if (entity === CraftingRecipe) return Promise.resolve(makeFullRecipe({ stationType: 'forge' }));
      return Promise.resolve(null);
    });
    mockManager.find.mockResolvedValue([
      {
        mapId: 1,
        worldX: 1000,
        worldY: 1000,
        enabled: true,
        template: { stationType: 'forge', interactionRadiusWU: 1536, enabled: false },
      } as CraftingStation,
    ]);

    await expect(service.craft('char-1', 'recipe-1', 1)).rejects.toThrow(/Station "forge" requise/);
  });

  it('mauvaise map ignorée', async () => {
    setupHappyPath(1);
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve(makeCharacter());
      if (entity === CraftingRecipe) return Promise.resolve(makeFullRecipe({ stationType: 'forge' }));
      return Promise.resolve(null);
    });
    mockManager.find.mockResolvedValue([
      {
        mapId: 2,
        worldX: 1000,
        worldY: 1000,
        enabled: true,
        template: { stationType: 'forge', interactionRadiusWU: 1536, enabled: true },
      } as CraftingStation,
    ]);

    await expect(service.craft('char-1', 'recipe-1', 1)).rejects.toThrow(/Station "forge" requise/);
  });

  it('station trop loin ignorée', async () => {
    setupHappyPath(1);
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve(makeCharacter());
      if (entity === CraftingRecipe) return Promise.resolve(makeFullRecipe({ stationType: 'forge' }));
      return Promise.resolve(null);
    });
    mockManager.find.mockResolvedValue([
      {
        mapId: 1,
        worldX: 5000,
        worldY: 1000,
        enabled: true,
        template: { stationType: 'forge', interactionRadiusWU: 1536, enabled: true },
      } as CraftingStation,
    ]);

    await expect(service.craft('char-1', 'recipe-1', 1)).rejects.toThrow(/Station "forge" requise/);
  });

  it('inventaire insuffisant : throw BadRequestException sans aucun changement', async () => {
    setupHappyPath(1);
    // Inventaire vide
    mockManager.find.mockResolvedValue([]);

    await expect(service.craft('char-1', 'recipe-1', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockManager.save).not.toHaveBeenCalled();
    expect(mockManager.remove).not.toHaveBeenCalled();
  });

  it('recipe disabled : throw BadRequestException', async () => {
    setupHappyPath(1);
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve(makeCharacter());
      if (entity === CraftingRecipe) return Promise.resolve(makeFullRecipe({ enabled: false }));
      return Promise.resolve(null);
    });

    await expect(service.craft('char-1', 'recipe-1', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('skill disabled : throw BadRequestException', async () => {
    setupHappyPath(1);
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve(makeCharacter());
      if (entity === CraftingRecipe) return Promise.resolve(makeFullRecipe());
      if (entity === SkillDefinition) return Promise.resolve(makeSkillDef({ enabled: false }));
      return Promise.resolve(null);
    });

    await expect(service.craft('char-1', 'recipe-1', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('level insuffisant : throw BadRequestException', async () => {
    setupHappyPath(1);
    const playerSkillLow = makePlayerSkill({ level: 1 });
    mockSkillsService.getOrCreatePlayerSkillInTx!.mockResolvedValue(playerSkillLow);
    // recipe requiredSkillLevel = 1, mais on change la recette à level 5
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve(makeCharacter());
      if (entity === CraftingRecipe) return Promise.resolve(makeFullRecipe({ requiredSkillLevel: 5 }));
      if (entity === SkillDefinition) return Promise.resolve(makeSkillDef());
      return Promise.resolve(null);
    });

    await expect(service.craft('char-1', 'recipe-1', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('échec avec consumeIngredientsOnFailure=true : consomme, pas de résultat, ajoute XP', async () => {
    setupHappyPath(1);
    // Recette avec taux de succès 0 — toujours échec
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve(makeCharacter());
      if (entity === CraftingRecipe)
        return Promise.resolve(
          makeFullRecipe({ baseSuccessRate: 0, minSuccessRate: 0, consumeIngredientsOnFailure: true }),
        );
      if (entity === SkillDefinition) return Promise.resolve(makeSkillDef());
      return Promise.resolve(null);
    });
    service['_randomFn'] = jest.fn().mockReturnValue(0.999); // toujours échec

    const result = await service.craft('char-1', 'recipe-1', 1);

    expect(result.failures).toBe(1);
    expect(result.successes).toBe(0);
    expect(result.consumed).toEqual([{ itemId: 'item-iron_ore', quantity: 3 }]);
    expect(result.produced).toHaveLength(0);
    expect(result.skill.xpGained).toBe(10);
  });

  it('échec avec consumeIngredientsOnFailure=false : ne consomme pas, pas de résultat, ajoute XP', async () => {
    setupHappyPath(1);
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve(makeCharacter());
      if (entity === CraftingRecipe)
        return Promise.resolve(
          makeFullRecipe({ baseSuccessRate: 0, minSuccessRate: 0, consumeIngredientsOnFailure: false }),
        );
      if (entity === SkillDefinition) return Promise.resolve(makeSkillDef());
      return Promise.resolve(null);
    });
    service['_randomFn'] = jest.fn().mockReturnValue(0.999);

    const result = await service.craft('char-1', 'recipe-1', 1);

    expect(result.failures).toBe(1);
    expect(result.consumed).toHaveLength(0); // aucune consommation
    expect(result.produced).toHaveLength(0);
    expect(result.skill.xpGained).toBe(10);
    expect(mockManager.save).not.toHaveBeenCalledWith(
      Inventory,
      expect.objectContaining({ quantity: expect.anything() }),
    );
  });

  it('quantity > 1 : agrège consumed/produced sur plusieurs tentatives', async () => {
    setupHappyPath(3);

    const result = await service.craft('char-1', 'recipe-1', 3);

    expect(result.attempts).toBe(3);
    expect(result.successes).toBe(3);
    // 3 tentatives × 3 iron_ore = 9 consommés
    expect(result.consumed).toEqual([{ itemId: 'item-iron_ore', quantity: 9 }]);
    // 3 tentatives × 1 iron_bar = 3 produits
    expect(result.produced).toEqual([{ itemId: 'item-iron_bar', quantity: 3 }]);
    expect(result.skill.xpGained).toBe(30); // 10 × 3
  });

  it('rejette si une erreur survient pendant la production (rollback)', async () => {
    setupHappyPath(1);
    // La 2e écriture (production) lève une exception
    mockManager.save
      .mockResolvedValueOnce({}) // consommation OK
      .mockRejectedValueOnce(new Error('DB error'));

    await expect(service.craft('char-1', 'recipe-1', 1)).rejects.toThrow('DB error');
  });

  it('PlayerSkill absent : créé level=1 xp=0 puis reçoit XP', async () => {
    setupHappyPath(1);
    const newSkill = makePlayerSkill({ level: 1, xp: 0 });
    mockSkillsService.getOrCreatePlayerSkillInTx!.mockResolvedValue(newSkill);
    // applyXpInTx retourne level=1 avec xp=10
    mockSkillsService.applyXpInTx!.mockResolvedValue({ ...newSkill, xp: 10 });

    const result = await service.craft('char-1', 'recipe-1', 1);

    expect(result.skill.previousLevel).toBe(1);
    expect(result.skill.newXp).toBe(10);
    expect(result.skill.xpGained).toBe(10);
    expect(mockSkillsService.getOrCreatePlayerSkillInTx).toHaveBeenCalledWith(
      'char-1',
      expect.anything(),
      mockManager,
    );
  });

  it('successRate : bonus par niveau borné à maxSuccessRate', async () => {
    setupHappyPath(1);
    // level=50, required=1, base=0.75, bonus=0.02, max=1.0
    // clamp(0.75 + (50-1)*0.02, 0.05, 1.0) = clamp(0.75+0.98, ...) = 1.0
    const highLevelSkill = makePlayerSkill({ level: 50 });
    mockSkillsService.getOrCreatePlayerSkillInTx!.mockResolvedValue(highLevelSkill);
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve(makeCharacter());
      if (entity === CraftingRecipe)
        return Promise.resolve(
          makeFullRecipe({
            baseSuccessRate: 0.75,
            successBonusPerLevel: 0.02,
            minSuccessRate: 0.05,
            maxSuccessRate: 1.0,
            requiredSkillLevel: 1,
          }),
        );
      if (entity === SkillDefinition) return Promise.resolve(makeSkillDef());
      return Promise.resolve(null);
    });

    // random retourne 0.99 — succès seulement si successRate = 1.0
    service['_randomFn'] = jest.fn().mockReturnValue(0.99);

    const result = await service.craft('char-1', 'recipe-1', 1);

    // successRate=1.0 → 0.99 < 1.0 → succès
    expect(result.successes).toBe(1);
  });

  it('successRate : minSuccessRate empêche de tomber en dessous du minimum', async () => {
    setupHappyPath(1);
    // level=1, required=10 → base - pénalité négatif, mais borné à min=0.5
    const lowSkill = makePlayerSkill({ level: 1 });
    mockSkillsService.getOrCreatePlayerSkillInTx!.mockResolvedValue(lowSkill);
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve(makeCharacter());
      if (entity === CraftingRecipe)
        return Promise.resolve(
          makeFullRecipe({
            requiredSkillLevel: 1, // level OK pour ne pas throw
            baseSuccessRate: 0.2,
            successBonusPerLevel: 0.02,
            minSuccessRate: 0.5, // plancher à 0.5
            maxSuccessRate: 1.0,
          }),
        );
      if (entity === SkillDefinition) return Promise.resolve(makeSkillDef());
      return Promise.resolve(null);
    });

    // random retourne 0.4 — succès si successRate >= 0.5
    service['_randomFn'] = jest.fn().mockReturnValue(0.4);

    const result = await service.craft('char-1', 'recipe-1', 1);

    // successRate = max(0.5, ...) → 0.4 < 0.5 → succès
    expect(result.successes).toBe(1);
  });
});
