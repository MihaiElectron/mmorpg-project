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
import { ItemMaterializationService } from '../item-materialization/item-materialization.service';
import { ProgressionService } from '../progression/progression.service';
import { ItemTransferService } from '../item-transfer/item-transfer.service';
import { ObjectMode } from '../items/entities/item.entity';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
  ItemInstanceType,
} from '../item-instances/entities/item-instance.entity';

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
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: SkillsService, useValue: {} },
        { provide: WorldService, useValue: { getConnectedPlayerByCharacterId: jest.fn() } },
        { provide: ItemMaterializationService, useValue: { materialize: jest.fn() } },
        { provide: ProgressionService, useValue: { applyCharacterXpInTx: jest.fn() } },
        { provide: ItemTransferService, useValue: { transfer: jest.fn() } },
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
    craftCharacterXpReward: 0,
    craftingDifficulty: 0,
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
  let materializeMock: { materialize: jest.Mock };
  let mockProgressionService: { applyCharacterXpInTx: jest.Mock };
  let mockItemTransferService: { transfer: jest.Mock };
  // Instances retournées par le query builder verrouillé (ingrédients INSTANCE).
  let lockedInstances: Partial<ItemInstance>[];
  let instanceQB: any;

  beforeEach(async () => {
    lockedInstances = [];
    const instanceQueryBuilder: any = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockImplementation(async () => lockedInstances),
    };
    instanceQB = instanceQueryBuilder;
    mockManager = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn().mockImplementation((_entity, data) => Promise.resolve({ ...data })),
      create: jest.fn().mockImplementation((_entity, data) => ({ ...data })),
      remove: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(instanceQueryBuilder),
      }),
    };

    mockItemTransferService = { transfer: jest.fn().mockResolvedValue({}) };

    materializeMock = {
      materialize: jest.fn().mockResolvedValue({ stacks: [], instances: [], worldItems: [] }),
    };

    mockDataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };

    mockSkillsService = {
      getOrCreatePlayerSkillInTx: jest.fn(),
      applyXpInTx: jest.fn().mockImplementation(async (ps) => ps),
      // ADR-0016 : applySkillXpInTx renvoie un SkillUpdatePayload. Mock générique
      // qui reflète le montant reçu pour vérifier xpGained côté résultat.
      applySkillXpInTx: jest.fn().mockImplementation(async (_charId, skillKey, xpAmount) => ({
        skillDefinitionKey: skillKey,
        key: skillKey,
        name: skillKey,
        category: 'crafting',
        enabled: true,
        level: 10,
        xp: xpAmount,
        nextLevelXp: 100,
        leveledUp: false,
      })),
      getNextLevelXp: jest.fn().mockReturnValue(100),
    };
    mockProgressionService = {
      applyCharacterXpInTx: jest.fn().mockImplementation(async (_charId, amount) => ({
        level: 1,
        experience: amount,
        nextLevelXp: 100,
        leveledUp: false,
      })),
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
        { provide: getRepositoryToken(CraftingStation), useValue: {} },
        { provide: DataSource, useValue: mockDataSource },
        { provide: SkillsService, useValue: mockSkillsService },
        { provide: WorldService, useValue: mockWorldService },
        { provide: ItemMaterializationService, useValue: materializeMock },
        { provide: ProgressionService, useValue: mockProgressionService },
        { provide: ItemTransferService, useValue: mockItemTransferService },
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

    // find discrimine par entité : Item (objectMode), Inventory (stock),
    // CraftingStation (résolution station) — l'ordre des appels n'importe plus.
    mockManager.find.mockImplementation((entity: any) => {
      if (entity === Item) return Promise.resolve([makeItem('iron_ore', 'material', ObjectMode.STACKABLE)]);
      if (entity === Inventory) return Promise.resolve([inventoryRow]);
      return Promise.resolve([]);
    });

    mockSkillsService.getOrCreatePlayerSkillInTx!.mockResolvedValue(playerSkill);
    mockSkillsService.applyXpInTx!.mockImplementation(async (ps) => ps);

    // Succès garanti
    service['_randomFn'] = jest.fn().mockReturnValue(0.0);

    return { character, recipe, skillDef, playerSkill, inventoryRow };
  }

  async function expectStationError(
    expected: Record<string, unknown>,
  ): Promise<BadRequestException> {
    try {
      await service.craft('char-1', 'recipe-1', 1);
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(expect.objectContaining(expected));
      return err as BadRequestException;
    }
    throw new Error('Expected station BadRequestException');
  }

  // ── Tests ──────────────────────────────────────────────────────────────────

  it('craft succès 100% : consomme ingrédients, ajoute résultat, ajoute XP', async () => {
    setupHappyPath(1);

    const result = await service.craft('char-1', 'recipe-1', 1);

    expect(result.successes).toBe(1);
    expect(result.failures).toBe(0);
    expect(result.consumed).toEqual([{ itemId: 'item-iron_ore', quantity: 3 }]);
    expect(result.produced).toEqual([{ itemId: 'item-iron_bar', quantity: 1 }]);
    // Skill XP Runtime : base craft 15 + difficulté 0, × 1 succès = 15.
    expect(result.skill?.xpGained).toBe(15);
    // save appelé pour : consommation (quantité restante) + production (nouveau slot)
    expect(mockManager.save).toHaveBeenCalled();
    expect(mockSkillsService.applySkillXpInTx).toHaveBeenCalledWith(
      'char-1',
      'smithing',
      15,
      mockManager,
    );
    // craftCharacterXpReward = 0 par défaut → pas de Character XP.
    expect(result.characterXp).toBeNull();
    expect(mockProgressionService.applyCharacterXpInTx).not.toHaveBeenCalled();
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

    await expectStationError({
      code: 'CRAFTING_STATION_REQUIRED',
      stationType: 'forge',
      message: 'Forge requise : aucune station compatible active à portée.',
    });
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
    const station = {
      id: 'station-1',
      templateId: 'tpl-forge',
      mapId: 1,
      worldX: 1200,
      worldY: 1000,
      enabled: true,
      template: { stationType: 'forge', interactionRadiusWU: 1536, enabled: true },
    } as CraftingStation;
    mockManager.find.mockImplementation((entity: any) => {
      if (entity === CraftingStation) return Promise.resolve([station]);
      if (entity === Item) return Promise.resolve([makeItem('iron_ore', 'material', ObjectMode.STACKABLE)]);
      if (entity === Inventory) return Promise.resolve([makeInventoryRow('item-iron_ore', 13)]);
      return Promise.resolve([]);
    });

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

    await expectStationError({
      code: 'CRAFTING_STATION_REQUIRED',
      stationType: 'forge',
    });
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

    await expectStationError({
      code: 'CRAFTING_STATION_REQUIRED',
      stationType: 'forge',
    });
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

    await expectStationError({
      code: 'CRAFTING_STATION_REQUIRED',
      stationType: 'forge',
    });
  });

  it('station trop loin ignorée et retourne distance + radius', async () => {
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

    await expectStationError({
      code: 'CRAFTING_STATION_OUT_OF_RANGE',
      stationType: 'forge',
      nearestDistanceWU: 4000,
      requiredRadiusWU: 1536,
      message: 'Forge trop éloignée.',
    });
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
    // ADR-0016 : les échecs n'accordent aucune XP skill.
    expect(result.skill).toBeNull();
    expect(mockSkillsService.applySkillXpInTx).not.toHaveBeenCalled();
  });

  it('échec avec consumeIngredientsOnFailure=false : ne consomme pas, pas de résultat, pas d\'XP', async () => {
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
    expect(result.skill).toBeNull();
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
    // Skill XP Runtime : 15 (base craft, difficulté 0) × 3 succès = 45.
    expect(result.skill?.xpGained).toBe(45);
    expect(mockSkillsService.applySkillXpInTx).toHaveBeenCalledWith('char-1', 'smithing', 45, mockManager);
  });

  it('rejette si une erreur survient pendant la matérialisation (rollback)', async () => {
    setupHappyPath(1);
    materializeMock.materialize.mockRejectedValueOnce(new Error('DB error'));

    await expect(service.craft('char-1', 'recipe-1', 1)).rejects.toThrow('DB error');
  });

  it('PlayerSkill absent : créé level=1 xp=0 puis reçoit XP via applySkillXpInTx', async () => {
    setupHappyPath(1);
    const newSkill = makePlayerSkill({ level: 1, xp: 0 });
    mockSkillsService.getOrCreatePlayerSkillInTx!.mockResolvedValue(newSkill);

    const result = await service.craft('char-1', 'recipe-1', 1);

    // previousLevel/previousXp lus depuis le PlayerSkill avant application.
    expect(result.skill?.previousLevel).toBe(1);
    expect(result.skill?.previousXp).toBe(0);
    expect(result.skill?.newXp).toBe(15); // mock reflète le montant reçu
    expect(result.skill?.xpGained).toBe(15);
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

  // ── C5 : Hybrid Runtime ────────────────────────────────────────────────────

  describe("craft() Hybrid Runtime (C5)", () => {
    it("materialize appelé avec source CRAFT, destination INVENTORY et ownerId", async () => {
      setupHappyPath(1);

      await service.craft("char-1", "recipe-1", 1);

      expect(materializeMock.materialize).toHaveBeenCalledWith(
        mockManager,
        [{ itemId: "item-iron_bar", quantity: 1 }],
        {
          source: "CRAFT",
          destination: { type: "INVENTORY", characterId: "char-1" },
          ownerId: "char-1",
        },
      );
    });

    it("materialize pas appelé si producedMap est vide (échec sans production)", async () => {
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
      service["_randomFn"] = jest.fn().mockReturnValue(0.999);

      await service.craft("char-1", "recipe-1", 1);

      expect(materializeMock.materialize).not.toHaveBeenCalled();
    });

    it("quantity > 1 : materialize appelé avec quantité agrégée sur les tentatives", async () => {
      setupHappyPath(3);

      await service.craft("char-1", "recipe-1", 3);

      expect(materializeMock.materialize).toHaveBeenCalledWith(
        mockManager,
        [{ itemId: "item-iron_bar", quantity: 3 }],
        expect.objectContaining({ source: "CRAFT" }),
      );
    });

    it("craft recette basic_sword : entries passées à materialize — CraftingService ne connaît pas objectMode", async () => {
      setupHappyPath(1);
      mockManager.findOne.mockImplementation((entity: any) => {
        if (entity === Character) return Promise.resolve(makeCharacter());
        if (entity === CraftingRecipe)
          return Promise.resolve(
            makeFullRecipe({
              results: [{ id: "res-1", itemId: "item-basic_sword", producedQuantity: 1, chance: 1.0 } as CraftingResult],
            }),
          );
        if (entity === SkillDefinition) return Promise.resolve(makeSkillDef());
        return Promise.resolve(null);
      });
      service["_randomFn"] = jest.fn().mockReturnValue(0.0);

      await service.craft("char-1", "recipe-1", 1);

      expect(materializeMock.materialize).toHaveBeenCalledWith(
        expect.anything(),
        [{ itemId: "item-basic_sword", quantity: 1 }],
        expect.objectContaining({ source: "CRAFT" }),
      );
    });

    it("rollback si consommation échoue en DB (manager.save lève une exception)", async () => {
      setupHappyPath(1);
      mockManager.save.mockRejectedValueOnce(new Error("DB consumption error"));

      await expect(service.craft("char-1", "recipe-1", 1)).rejects.toThrow("DB consumption error");
      expect(materializeMock.materialize).not.toHaveBeenCalled();
    });

    it("recette inconnue : NotFoundException avant tout accès à materialize", async () => {
      setupHappyPath(1);
      mockManager.findOne.mockImplementation((entity: any) => {
        if (entity === Character) return Promise.resolve(makeCharacter());
        if (entity === CraftingRecipe) return Promise.resolve(null);
        return Promise.resolve(null);
      });

      await expect(service.craft("char-1", "recipe-1", 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(materializeMock.materialize).not.toHaveBeenCalled();
    });

    it("quantité insuffisante : BadRequestException avant materialize", async () => {
      setupHappyPath(1);
      mockManager.find.mockResolvedValue([]);

      await expect(service.craft("char-1", "recipe-1", 1)).rejects.toBeInstanceOf(BadRequestException);
      expect(materializeMock.materialize).not.toHaveBeenCalled();
    });
  });

  // ── Phase 2d : Craft XP Runtime (ADR-0016) ─────────────────────────────────
  describe("craft() XP Runtime (ADR-0016)", () => {
    function setupRecipe(overrides: Partial<CraftingRecipe>, level = 10) {
      mockSkillsService.getOrCreatePlayerSkillInTx!.mockResolvedValue(makePlayerSkill({ level }));
      mockManager.findOne.mockImplementation((entity: any) => {
        if (entity === Character) return Promise.resolve(makeCharacter());
        if (entity === CraftingRecipe) return Promise.resolve(makeFullRecipe(overrides));
        if (entity === SkillDefinition) return Promise.resolve(makeSkillDef());
        return Promise.resolve(null);
      });
      mockManager.find.mockResolvedValue([makeInventoryRow("item-iron_ore", 999)]);
      service["_randomFn"] = jest.fn().mockReturnValue(0.0); // succès garanti
    }

    it("craft réussi accorde Character XP + Skill XP dans la même transaction", async () => {
      setupHappyPath(1);
      setupRecipe({ craftCharacterXpReward: 20, craftingDifficulty: 0 });

      const result = await service.craft("char-1", "recipe-1", 1);

      expect(result.produced).toEqual([{ itemId: "item-iron_bar", quantity: 1 }]);
      expect(result.skill?.xpGained).toBe(15);
      expect(result.characterXp).toEqual(
        expect.objectContaining({ level: 1, xpGained: 20, leveledUp: false }),
      );
      expect(mockProgressionService.applyCharacterXpInTx).toHaveBeenCalledWith(
        "char-1", 20, "CRAFT", mockManager,
      );
    });

    it("craftCharacterXpReward = 0 → aucune Character XP émise", async () => {
      setupHappyPath(1);
      setupRecipe({ craftCharacterXpReward: 0 });

      const result = await service.craft("char-1", "recipe-1", 1);

      expect(result.characterXp).toBeNull();
      expect(mockProgressionService.applyCharacterXpInTx).not.toHaveBeenCalled();
    });

    it.each([
      [0, 15],
      [20, 17],
      [100, 25],
    ])("difficulté %i → Skill XP %i", async (difficulty, expectedXp) => {
      setupHappyPath(1);
      setupRecipe({ craftingDifficulty: difficulty });

      const result = await service.craft("char-1", "recipe-1", 1);

      expect(result.skill?.xpGained).toBe(expectedXp);
      expect(mockSkillsService.applySkillXpInTx).toHaveBeenCalledWith(
        "char-1", "smithing", expectedXp, mockManager,
      );
    });

    it("0 succès : ni Character XP ni Skill XP même avec récompenses configurées", async () => {
      setupHappyPath(1);
      setupRecipe({ craftCharacterXpReward: 50, craftingDifficulty: 50, baseSuccessRate: 0, minSuccessRate: 0 });
      service["_randomFn"] = jest.fn().mockReturnValue(0.999); // échec garanti

      const result = await service.craft("char-1", "recipe-1", 1);

      expect(result.successes).toBe(0);
      expect(result.skill).toBeNull();
      expect(result.characterXp).toBeNull();
      expect(mockSkillsService.applySkillXpInTx).not.toHaveBeenCalled();
      expect(mockProgressionService.applyCharacterXpInTx).not.toHaveBeenCalled();
    });
  });

  // ── Ingrédients INSTANCE (ItemInstance) ────────────────────────────────────
  describe("craft() ingrédients INSTANCE", () => {
    // Recette dont l'ingrédient est un item INSTANCE (ex: Épée basique).
    function setupInstanceRecipe(availableCount, { requiredQuantity = 1 } = {}) {
      const recipe = makeFullRecipe({
        ingredients: [
          { id: "ing-1", itemId: "item-basic_sword", requiredQuantity } as CraftingIngredient,
        ],
        results: [
          { id: "res-1", itemId: "item-iron_bar", producedQuantity: 1, chance: 1.0 } as CraftingResult,
        ],
      });
      mockManager.findOne.mockImplementation((entity: any) => {
        if (entity === Character) return Promise.resolve(makeCharacter());
        if (entity === CraftingRecipe) return Promise.resolve(recipe);
        if (entity === SkillDefinition) return Promise.resolve(makeSkillDef());
        return Promise.resolve(null);
      });
      mockManager.find.mockImplementation((entity: any) => {
        if (entity === Item) return Promise.resolve([makeItem("basic_sword", "weapon", ObjectMode.INSTANCE)]);
        if (entity === Inventory) return Promise.resolve([]);
        return Promise.resolve([]);
      });
      lockedInstances = Array.from({ length: availableCount }, (_, i) => ({
        id: `inst-${i}`,
        itemId: "item-basic_sword",
        ownerId: "char-1",
        state: ItemInstanceState.AVAILABLE,
        containerType: ItemInstanceContainerType.INVENTORY,
        instanceType: ItemInstanceType.NORMAL,
      }));
      mockSkillsService.getOrCreatePlayerSkillInTx!.mockResolvedValue(makePlayerSkill({ level: 10 }));
      service["_randomFn"] = jest.fn().mockReturnValue(0.0); // succès garanti
    }

    it("consomme une instance via CRAFT_CONSUME et matérialise l'output", async () => {
      setupInstanceRecipe(1);

      const result = await service.craft("char-1", "recipe-1", 1);

      expect(result.successes).toBe(1);
      expect(mockItemTransferService.transfer).toHaveBeenCalledTimes(1);
      expect(mockItemTransferService.transfer).toHaveBeenCalledWith(mockManager, "inst-0", {
        requesterId: "char-1",
        transition: { type: "CRAFT_CONSUME", characterId: "char-1" },
      });
      expect(materializeMock.materialize).toHaveBeenCalledWith(
        mockManager,
        [{ itemId: "item-iron_bar", quantity: 1 }],
        expect.objectContaining({ source: "CRAFT" }),
      );
    });

    it("quantité INSTANCE insuffisante → BadRequestException, rien consommé", async () => {
      setupInstanceRecipe(0); // aucune instance disponible

      await expect(service.craft("char-1", "recipe-1", 1)).rejects.toBeInstanceOf(BadRequestException);
      expect(mockItemTransferService.transfer).not.toHaveBeenCalled();
      expect(materializeMock.materialize).not.toHaveBeenCalled();
    });

    it("ne compte que les instances AVAILABLE/NORMAL/INVENTORY du personnage (exclut EQUIPPED/LISTED/LOT/IN_MAIL)", async () => {
      setupInstanceRecipe(1);

      await service.craft("char-1", "recipe-1", 1);

      // La sélection est filtrée côté requête : état AVAILABLE, type NORMAL,
      // container INVENTORY, owner = personnage. EQUIPPED/LISTED/LOT/IN_MAIL exclus.
      expect(instanceQB.where).toHaveBeenCalledWith(
        expect.stringContaining("i.state = :state"),
        expect.objectContaining({
          ownerId: "char-1",
          containerType: ItemInstanceContainerType.INVENTORY,
          state: ItemInstanceState.AVAILABLE,
          instanceType: ItemInstanceType.NORMAL,
        }),
      );
    });

    it("quantity > 1 : consomme autant d'instances que de crafts", async () => {
      setupInstanceRecipe(5);

      const result = await service.craft("char-1", "recipe-1", 3);

      expect(result.successes).toBe(3);
      expect(mockItemTransferService.transfer).toHaveBeenCalledTimes(3);
    });

    it("rollback : une erreur en aval propage et annule la transaction", async () => {
      setupInstanceRecipe(1);
      materializeMock.materialize.mockRejectedValueOnce(new Error("materialize error"));

      await expect(service.craft("char-1", "recipe-1", 1)).rejects.toThrow("materialize error");
    });
  });
});
