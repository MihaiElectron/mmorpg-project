import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CraftJobService,
  CRAFT_JOB_VERSION,
  CRAFT_SERVER_FORMULA_VERSION,
} from './craft-job.service';
import { CraftJob, CraftJobState } from './entities/craft-job.entity';
import { CraftJobIngredient } from './entities/craft-job-ingredient.entity';
import { CraftJobOutput } from './entities/craft-job-output.entity';
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { CraftingService } from './crafting.service';
import { SkillsService } from '../skills/skills.service';
import { ItemTransferService } from '../item-transfer/item-transfer.service';
import { Character } from '../characters/entities/character.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { Item, ObjectMode } from '../items/entities/item.entity';
import { SkillDefinition } from '../skills/entities/skill-definition.entity';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
  ItemInstanceType,
} from '../item-instances/entities/item-instance.entity';

// ─── Factories ─────────────────────────────────────────────────────────────

function makeItem(id: string, objectMode = ObjectMode.STACKABLE): Item {
  return { id, name: id, type: 'material', category: id, objectMode } as Item;
}

function makeRecipe(overrides: Partial<CraftingRecipe> = {}): CraftingRecipe {
  return {
    id: 'recipe-1',
    key: 'iron_bar_from_ore',
    name: 'Fondre minerai',
    description: null,
    category: 'smithing',
    requiredSkillKey: 'smithing',
    requiredSkillLevel: 1,
    baseSuccessRate: 1.0,
    successBonusPerLevel: 0.0,
    minSuccessRate: 0.05,
    maxSuccessRate: 1.0,
    xpReward: 10,
    craftCharacterXpReward: 7,
    craftingDifficulty: 20,
    consumeIngredientsOnFailure: true,
    craftTimeMs: 2000,
    stationType: 'none',
    enabled: true,
    isDefault: true,
    version: 3,
    ingredients: [{ id: 'ing-1', itemId: 'item-iron_ore', requiredQuantity: 3 } as any],
    results: [{ id: 'res-1', itemId: 'item-iron_bar', producedQuantity: 1, chance: 1.0 } as any],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CraftingRecipe;
}

function makeSkillDef(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return { id: 'sd-1', key: 'smithing', name: 'Smithing', category: 'crafting', enabled: true, ...overrides } as SkillDefinition;
}

function makeInventoryRow(itemId: string, quantity: number): Inventory {
  return { id: `inv-${itemId}`, item: { id: itemId } as Item, quantity, equipped: false } as Inventory;
}

// ─── Suite ─────────────────────────────────────────────────────────────────

describe('CraftJobService — launch()', () => {
  let service: CraftJobService;
  let mockManager: Record<string, jest.Mock>;
  let mockSkills: { getOrCreatePlayerSkillInTx: jest.Mock };
  let mockTransfer: { transfer: jest.Mock };
  let mockCrafting: { findNearestCompatibleStationOrThrow: jest.Mock };
  let savedCraftJob: any;
  let lockedInstances: Partial<ItemInstance>[];

  beforeEach(async () => {
    savedCraftJob = null;
    lockedInstances = [];
    const instanceQb: any = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockImplementation(async () => lockedInstances),
    };
    mockManager = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((_e: unknown, data: unknown) => ({ ...(data as object) })),
      save: jest.fn().mockImplementation(async (entity: unknown, data: any) => {
        if (Array.isArray(data)) return data;
        if (entity === CraftJob) {
          savedCraftJob = { id: 'job-1', ...data };
          return savedCraftJob;
        }
        return { ...data };
      }),
      remove: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue({ createQueryBuilder: jest.fn().mockReturnValue(instanceQb) }),
    };

    mockSkills = { getOrCreatePlayerSkillInTx: jest.fn().mockResolvedValue({ level: 10, xp: 0 }) };
    mockTransfer = { transfer: jest.fn().mockResolvedValue({}) };
    mockCrafting = { findNearestCompatibleStationOrThrow: jest.fn().mockResolvedValue({ id: 'station-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CraftJobService,
        { provide: DataSource, useValue: { transaction: jest.fn().mockImplementation((cb) => cb(mockManager)) } },
        { provide: SkillsService, useValue: mockSkills },
        { provide: ItemTransferService, useValue: mockTransfer },
        { provide: CraftingService, useValue: mockCrafting },
      ],
    }).compile();

    service = module.get<CraftJobService>(CraftJobService);
  });

  // Configure un happy-path STACKABLE (1 ingrédient iron_ore, stock suffisant).
  function setupStackable(recipe = makeRecipe(), stock = 99) {
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve({ id: 'char-1', level: 5 });
      if (entity === CraftingRecipe) return Promise.resolve(recipe);
      if (entity === SkillDefinition) return Promise.resolve(makeSkillDef());
      return Promise.resolve(null);
    });
    mockManager.find.mockImplementation((entity: any) => {
      if (entity === Item) return Promise.resolve([makeItem('item-iron_ore', ObjectMode.STACKABLE), makeItem('item-iron_bar', ObjectMode.STACKABLE)]);
      if (entity === Inventory) return Promise.resolve([makeInventoryRow('item-iron_ore', stock)]);
      return Promise.resolve([]);
    });
  }

  it('crée un CraftJob RUNNING avec snapshot complet (STACKABLE)', async () => {
    setupStackable();

    const job = await service.launch('char-1', 'recipe-1', 2);

    expect(job.state).toBe(CraftJobState.RUNNING);
    expect(job.recipeId).toBe('recipe-1');
    expect(job.recipeVersion).toBe(3);
    expect(job.jobVersion).toBe(CRAFT_JOB_VERSION);
    expect(job.serverFormulaVersion).toBe(CRAFT_SERVER_FORMULA_VERSION);
    expect(job.quantity).toBe(2);
    expect(job.craftingDifficulty).toBe(20);
    expect(job.craftCharacterXpReward).toBe(7);
    expect(job.requiredSkillKey).toBe('smithing');
    expect(job.stationType).toBe('none');
    expect(job.stationId).toBeNull();
  });

  it('finishAt = startedAt + craftTimeMs × quantity', async () => {
    setupStackable(makeRecipe({ craftTimeMs: 2000 }));

    const job = await service.launch('char-1', 'recipe-1', 3);

    expect(job.finishAt.getTime() - job.startedAt.getTime()).toBe(2000 * 3);
  });

  it('décrémente l’Inventory du montant réservé et snapshote les ingrédients', async () => {
    const inv = makeInventoryRow('item-iron_ore', 10);
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve({ id: 'char-1', level: 5 });
      if (entity === CraftingRecipe) return Promise.resolve(makeRecipe());
      if (entity === SkillDefinition) return Promise.resolve(makeSkillDef());
      return Promise.resolve(null);
    });
    mockManager.find.mockImplementation((entity: any) => {
      if (entity === Item) return Promise.resolve([makeItem('item-iron_ore'), makeItem('item-iron_bar')]);
      if (entity === Inventory) return Promise.resolve([inv]);
      return Promise.resolve([]);
    });

    await service.launch('char-1', 'recipe-1', 2); // 3 × 2 = 6 réservés

    expect(inv.quantity).toBe(4);
    // aucun ingrédient INSTANCE → pas de RESERVE_FOR_CRAFT
    expect(mockTransfer.transfer).not.toHaveBeenCalled();
    // un CraftJobIngredient snapshoté avec reservedQuantity = 6
    const ingSave = mockManager.save.mock.calls.find((c) => c[0] === CraftJobIngredient);
    expect(ingSave[1][0]).toMatchObject({ itemId: 'item-iron_ore', objectMode: ObjectMode.STACKABLE, requiredQuantity: 3, reservedQuantity: 6 });
  });

  it('réserve les ingrédients INSTANCE via RESERVE_FOR_CRAFT (escrow)', async () => {
    const recipe = makeRecipe({ ingredients: [{ id: 'ing-1', itemId: 'item-sword', requiredQuantity: 1 } as any] });
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve({ id: 'char-1', level: 5 });
      if (entity === CraftingRecipe) return Promise.resolve(recipe);
      if (entity === SkillDefinition) return Promise.resolve(makeSkillDef());
      return Promise.resolve(null);
    });
    mockManager.find.mockImplementation((entity: any) => {
      if (entity === Item) return Promise.resolve([makeItem('item-sword', ObjectMode.INSTANCE), makeItem('item-iron_bar')]);
      if (entity === Inventory) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    lockedInstances = [{ id: 'inst-0' }, { id: 'inst-1' }];

    await service.launch('char-1', 'recipe-1', 2); // 1 × 2 = 2 instances réservées

    expect(mockTransfer.transfer).toHaveBeenCalledTimes(2);
    expect(mockTransfer.transfer).toHaveBeenCalledWith(mockManager, 'inst-0', {
      requesterId: 'char-1',
      transition: { type: 'RESERVE_FOR_CRAFT', characterId: 'char-1', jobId: 'job-1' },
    });
  });

  it('valide la station quand stationType ≠ none et snapshote stationId', async () => {
    setupStackable(makeRecipe({ stationType: 'forge' }));

    const job = await service.launch('char-1', 'recipe-1', 1);

    expect(mockCrafting.findNearestCompatibleStationOrThrow).toHaveBeenCalled();
    expect(job.stationId).toBe('station-1');
    expect(job.stationType).toBe('forge');
  });

  it('rejette si stock STACKABLE insuffisant, sans créer de job', async () => {
    setupStackable(makeRecipe(), 2); // besoin 3, stock 2

    await expect(service.launch('char-1', 'recipe-1', 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(mockManager.save).not.toHaveBeenCalledWith(CraftJob, expect.anything());
    expect(mockTransfer.transfer).not.toHaveBeenCalled();
  });

  it('rejette si instances INSTANCE insuffisantes', async () => {
    const recipe = makeRecipe({ ingredients: [{ id: 'ing-1', itemId: 'item-sword', requiredQuantity: 1 } as any] });
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve({ id: 'char-1', level: 5 });
      if (entity === CraftingRecipe) return Promise.resolve(recipe);
      if (entity === SkillDefinition) return Promise.resolve(makeSkillDef());
      return Promise.resolve(null);
    });
    mockManager.find.mockImplementation((entity: any) => {
      if (entity === Item) return Promise.resolve([makeItem('item-sword', ObjectMode.INSTANCE)]);
      return Promise.resolve([]);
    });
    lockedInstances = []; // 0 dispo, besoin 1

    await expect(service.launch('char-1', 'recipe-1', 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(mockTransfer.transfer).not.toHaveBeenCalled();
  });

  it('rejette une recette désactivée', async () => {
    setupStackable(makeRecipe({ enabled: false }));
    await expect(service.launch('char-1', 'recipe-1', 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette un niveau de skill insuffisant', async () => {
    setupStackable(makeRecipe({ requiredSkillLevel: 50 }));
    await expect(service.launch('char-1', 'recipe-1', 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette une recette introuvable (NotFound)', async () => {
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve({ id: 'char-1', level: 5 });
      return Promise.resolve(null);
    });
    await expect(service.launch('char-1', 'recipe-x', 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejette quantity < 1', async () => {
    await expect(service.launch('char-1', 'recipe-1', 0)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('snapshote les outputs', async () => {
    setupStackable();
    await service.launch('char-1', 'recipe-1', 1);
    const outSave = mockManager.save.mock.calls.find((c) => c[0] === CraftJobOutput);
    expect(outSave[1][0]).toMatchObject({ itemId: 'item-iron_bar', producedQuantity: 1, chance: 1.0 });
  });
});
