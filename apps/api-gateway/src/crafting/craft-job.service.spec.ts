import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, LessThanOrEqual } from 'typeorm';
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
import { MasteriesService } from '../masteries/masteries.service';
import { ItemTransferService } from '../item-transfer/item-transfer.service';
import { ProgressionService } from '../progression/progression.service';
import { ItemMaterializationService } from '../item-materialization/item-materialization.service';
import { CraftIngredientResolver } from './craft-ingredient-resolver';
import { Character } from '../characters/entities/character.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { Item, ObjectMode } from '../items/entities/item.entity';
import { MasteryDefinition } from '../masteries/entities/mastery-definition.entity';
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
    requiredMasteryKey: 'smithing',
    requiredMasteryLevel: 1,
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

function makeMasteryDef(overrides: Partial<MasteryDefinition> = {}): MasteryDefinition {
  return { id: 'sd-1', key: 'smithing', name: 'Smithing', category: 'crafting', enabled: true, ...overrides } as MasteryDefinition;
}

function makeInventoryRow(itemId: string, quantity: number): Inventory {
  return { id: `inv-${itemId}`, item: { id: itemId } as Item, quantity, equipped: false } as Inventory;
}

// ─── Suite ─────────────────────────────────────────────────────────────────

describe('CraftJobService — launch()', () => {
  let service: CraftJobService;
  let mockManager: Record<string, jest.Mock>;
  let mockMasteries: { getOrCreatePlayerMasteryInTx: jest.Mock; applyMasteryXpInTx: jest.Mock };
  let mockTransfer: { transfer: jest.Mock };
  let mockCrafting: { findNearestCompatibleStationOrThrow: jest.Mock };
  let mockProgression: { applyCharacterXpInTx: jest.Mock };
  let mockMaterialization: { materialize: jest.Mock };
  let craftJobRepo: { find: jest.Mock };
  let savedCraftJob: any;
  let lockedInstances: Partial<ItemInstance>[];
  let jobToComplete: any;

  beforeEach(async () => {
    savedCraftJob = null;
    lockedInstances = [];
    jobToComplete = null;
    const instanceQb: any = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockImplementation(async () => lockedInstances),
    };
    const craftJobQb: any = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockImplementation(async () => jobToComplete),
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
      getRepository: jest.fn().mockImplementation((entity: unknown) => ({
        createQueryBuilder: jest.fn().mockReturnValue(entity === CraftJob ? craftJobQb : instanceQb),
      })),
    };

    mockMasteries = {
      getOrCreatePlayerMasteryInTx: jest.fn().mockResolvedValue({ level: 10, xp: 0 }),
      applyMasteryXpInTx: jest.fn().mockResolvedValue({ key: 'smithing', level: 10, xp: 0 }),
    };
    mockTransfer = { transfer: jest.fn().mockResolvedValue({}) };
    mockCrafting = { findNearestCompatibleStationOrThrow: jest.fn().mockResolvedValue({ id: 'station-1' }) };
    mockProgression = { applyCharacterXpInTx: jest.fn().mockResolvedValue({ level: 1, experience: 0, nextLevelXp: 100, leveledUp: false }) };
    mockMaterialization = { materialize: jest.fn().mockResolvedValue({ stacks: [], instances: [], worldItems: [] }) };
    craftJobRepo = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CraftJobService,
        { provide: DataSource, useValue: {
          transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
          getRepository: jest.fn().mockReturnValue(craftJobRepo),
        } },
        { provide: MasteriesService, useValue: mockMasteries },
        { provide: ItemTransferService, useValue: mockTransfer },
        { provide: CraftingService, useValue: mockCrafting },
        { provide: ProgressionService, useValue: mockProgression },
        { provide: ItemMaterializationService, useValue: mockMaterialization },
        CraftIngredientResolver,
      ],
    }).compile();

    service = module.get<CraftJobService>(CraftJobService);
  });

  // Configure un happy-path STACKABLE (1 ingrédient iron_ore, stock suffisant).
  function setupStackable(recipe = makeRecipe(), stock = 99) {
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve({ id: 'char-1', level: 5 });
      if (entity === CraftingRecipe) return Promise.resolve(recipe);
      if (entity === MasteryDefinition) return Promise.resolve(makeMasteryDef());
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
    expect(job.recipeName).toBe('Fondre minerai'); // nom snapshoté
    expect(job.recipeVersion).toBe(3);
    expect(job.jobVersion).toBe(CRAFT_JOB_VERSION);
    expect(job.serverFormulaVersion).toBe(CRAFT_SERVER_FORMULA_VERSION);
    expect(job.quantity).toBe(2);
    expect(job.craftingDifficulty).toBe(20);
    expect(job.craftCharacterXpReward).toBe(7);
    expect(job.requiredMasteryKey).toBe('smithing');
    expect(job.stationType).toBe('none');
    expect(job.stationId).toBeNull();
  });

  it('stationType "none" : aucune validation de station (findNearestCompatibleStationOrThrow non appelé)', async () => {
    setupStackable(makeRecipe({ stationType: 'none' }));

    const job = await service.launch('char-1', 'recipe-1', 1);

    expect(job.stationType).toBe('none');
    expect(job.stationId).toBeNull();
    expect(mockCrafting.findNearestCompatibleStationOrThrow).not.toHaveBeenCalled();
  });

  it('finishAt = startedAt + craftTimeMs × quantity (durée >= min)', async () => {
    setupStackable(makeRecipe({ craftTimeMs: 4000 }));

    const job = await service.launch('char-1', 'recipe-1', 3);

    expect(job.finishAt.getTime() - job.startedAt.getTime()).toBe(4000 * 3);
  });

  it('durée 10 s : quantity 1 → 10000 ms, quantity 3 → 30000 ms', async () => {
    setupStackable(makeRecipe({ craftTimeMs: 10000 }));
    const j1 = await service.launch('char-1', 'recipe-1', 1);
    expect(j1.finishAt.getTime() - j1.startedAt.getTime()).toBe(10000);

    setupStackable(makeRecipe({ craftTimeMs: 10000 }));
    const j3 = await service.launch('char-1', 'recipe-1', 3);
    expect(j3.finishAt.getTime() - j3.startedAt.getTime()).toBe(30000);
  });

  it('garde Runtime : une durée DB < 3000 est clampée à 3000 (jamais de job < 3 s)', async () => {
    for (const craftTimeMs of [0, 1000, 2999]) {
      setupStackable(makeRecipe({ craftTimeMs }));
      const job = await service.launch('char-1', 'recipe-1', 2);
      // durée effective clampée à MIN_CRAFT_TIME_MS (3000) × quantity
      expect(job.finishAt.getTime() - job.startedAt.getTime()).toBe(3000 * 2);
      expect(job.craftTimeMs).toBe(3000); // snapshot = durée effective
    }
  });

  it('garde Runtime : une durée DB >= 3000 est respectée telle quelle', async () => {
    setupStackable(makeRecipe({ craftTimeMs: 3000 }));
    const j3000 = await service.launch('char-1', 'recipe-1', 1);
    expect(j3000.finishAt.getTime() - j3000.startedAt.getTime()).toBe(3000);
    expect(j3000.craftTimeMs).toBe(3000);

    setupStackable(makeRecipe({ craftTimeMs: 10000 }));
    const j10000 = await service.launch('char-1', 'recipe-1', 1);
    expect(j10000.finishAt.getTime() - j10000.startedAt.getTime()).toBe(10000);
    expect(j10000.craftTimeMs).toBe(10000);
  });

  it('décrémente l’Inventory du montant réservé et snapshote les ingrédients', async () => {
    const inv = makeInventoryRow('item-iron_ore', 10);
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Character) return Promise.resolve({ id: 'char-1', level: 5 });
      if (entity === CraftingRecipe) return Promise.resolve(makeRecipe());
      if (entity === MasteryDefinition) return Promise.resolve(makeMasteryDef());
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
      if (entity === MasteryDefinition) return Promise.resolve(makeMasteryDef());
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
      if (entity === MasteryDefinition) return Promise.resolve(makeMasteryDef());
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

  it('rejette un niveau de mastery insuffisant', async () => {
    setupStackable(makeRecipe({ requiredMasteryLevel: 50 }));
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

  // ── complete() — Phase 2 ────────────────────────────────────────────────────

  function makeJob(overrides: Partial<CraftJob> = {}): any {
    return {
      id: 'job-1',
      characterId: 'char-1',
      state: CraftJobState.RUNNING,
      quantity: 1,
      requiredMasteryKey: 'smithing',
      requiredMasteryLevel: 1,
      baseSuccessRate: 1.0,
      successBonusPerLevel: 0.0,
      minSuccessRate: 0.05,
      maxSuccessRate: 1.0,
      craftingDifficulty: 20,
      craftCharacterXpReward: 7,
      consumeIngredientsOnFailure: true,
      craftTimeMs: 2000,
      successes: 0,
      failures: 0,
      ...overrides,
    };
  }

  function setupComplete(job: any, ingredients: any[] = [], outputs: any[] = [], masteryDef = makeMasteryDef()) {
    jobToComplete = job;
    mockManager.find.mockImplementation((entity: any) => {
      if (entity === CraftJobIngredient) return Promise.resolve(ingredients);
      if (entity === CraftJobOutput) return Promise.resolve(outputs);
      return Promise.resolve([]);
    });
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === MasteryDefinition) return Promise.resolve(masteryDef);
      return Promise.resolve(null);
    });
  }

  function forceRandom(value: number) {
    (service as any)._randomFn = jest.fn().mockReturnValue(value);
  }

  it('complete ignore un job qui n’est plus RUNNING (idempotent)', async () => {
    setupComplete(makeJob({ state: CraftJobState.COMPLETED }));

    const result = await service.complete('job-1');

    expect(result).toBeNull();
    expect(mockManager.save).not.toHaveBeenCalledWith(CraftJob, expect.anything());
  });

  it('complete ignore un job introuvable', async () => {
    setupComplete(null);
    const result = await service.complete('job-x');
    expect(result).toBeNull();
  });

  it('succès → COMPLETED + XP character + XP mastery (× succès)', async () => {
    const outputs = [{ itemId: 'item-iron_bar', producedQuantity: 1, chance: 1.0, resolvedQuantity: 0 }];
    setupComplete(makeJob({ quantity: 1 }), [], outputs);
    forceRandom(0); // succès garanti + chance ok

    const result = await service.complete('job-1');

    expect(result).toMatchObject({
      state: CraftJobState.COMPLETED,
      successes: 1,
      failures: 0,
      grantedCharacterXp: 7,
      grantedMasteryXp: 17,
    });
    // difficulté 20 → mastery XP base 17, × 1 succès
    expect(mockMasteries.applyMasteryXpInTx).toHaveBeenCalledWith('char-1', 'smithing', 17, mockManager);
    expect(mockProgression.applyCharacterXpInTx).toHaveBeenCalledWith('char-1', 7, 'CRAFT', mockManager);
    expect(outputs[0].resolvedQuantity).toBe(1);
  });

  it('échec total (×1) → FAILED + XP mastery partielle 25% + 0 XP perso (règle V1)', async () => {
    setupComplete(makeJob({ baseSuccessRate: 0, minSuccessRate: 0, quantity: 1 }));
    forceRandom(0.99); // échec garanti

    const result = await service.complete('job-1');

    // perSuccessMasteryXp = 15 + floor(20/10) = 17 ; échec = floor(17 × 0.25) = 4.
    expect(result).toMatchObject({
      state: CraftJobState.FAILED,
      successes: 0,
      failures: 1,
      grantedCharacterXp: 0,
      grantedMasteryXp: 4,
    });
    expect(mockMasteries.applyMasteryXpInTx).toHaveBeenCalledWith('char-1', 'smithing', 4, mockManager);
    expect(mockProgression.applyCharacterXpInTx).not.toHaveBeenCalled();
  });

  it('échec total (×3) → XP mastery partielle multipliée par le nombre d\'échecs', async () => {
    setupComplete(makeJob({ baseSuccessRate: 0, minSuccessRate: 0, quantity: 3 }));
    forceRandom(0.99);

    const result = await service.complete('job-1');

    // 3 échecs × floor(17 × 0.25) = 3 × 4 = 12.
    expect(result).toMatchObject({
      state: CraftJobState.FAILED,
      successes: 0,
      failures: 3,
      grantedCharacterXp: 0,
      grantedMasteryXp: 12,
    });
    expect(mockMasteries.applyMasteryXpInTx).toHaveBeenCalledWith('char-1', 'smithing', 12, mockManager);
    expect(mockProgression.applyCharacterXpInTx).not.toHaveBeenCalled();
  });

  it('consomme les ingrédients INSTANCE réservés via CONSUME_FROM_CRAFT_ORDER', async () => {
    const ingredients = [{ itemId: 'item-sword', objectMode: ObjectMode.INSTANCE, requiredQuantity: 1, reservedQuantity: 1, consumedQuantity: 0 }];
    setupComplete(makeJob({ quantity: 1 }), ingredients);
    lockedInstances = [{ id: 'inst-0' }];
    forceRandom(0);

    await service.complete('job-1');

    expect(mockTransfer.transfer).toHaveBeenCalledWith(mockManager, 'inst-0', {
      requesterId: null,
      transition: { type: 'CONSUME_FROM_CRAFT_ORDER', jobId: 'job-1' },
    });
    expect(ingredients[0].consumedQuantity).toBe(1);
  });

  it('STACKABLE déjà décrémenté au launch : pas de re-décrément à la complétion', async () => {
    const ingredients = [{ itemId: 'item-iron_ore', objectMode: ObjectMode.STACKABLE, requiredQuantity: 3, reservedQuantity: 3, consumedQuantity: 0 }];
    setupComplete(makeJob({ quantity: 1 }), ingredients);
    forceRandom(0);

    await service.complete('job-1');

    expect(mockManager.save).not.toHaveBeenCalledWith(Inventory, expect.anything());
    expect(mockManager.remove).not.toHaveBeenCalled();
    expect(mockTransfer.transfer).not.toHaveBeenCalled(); // pas d'INSTANCE
    expect(ingredients[0].consumedQuantity).toBe(3);
  });

  it('ne matérialise aucun output et ne relit jamais la recette vivante', async () => {
    setupComplete(makeJob(), [], [{ itemId: 'item-iron_bar', producedQuantity: 1, chance: 1.0, resolvedQuantity: 0 }]);
    forceRandom(0);

    await service.complete('job-1');

    // aucune création d'entité (pas d'ItemInstance/Inventory créés)
    expect(mockManager.create).not.toHaveBeenCalled();
    // la recette vivante n'est jamais relue
    expect(mockManager.findOne).not.toHaveBeenCalledWith(CraftingRecipe, expect.anything());
  });

  it('double complétion idempotente (2e appel = null, XP non ré-appliquée)', async () => {
    const job = makeJob({ quantity: 1 });
    setupComplete(job);
    forceRandom(0);

    const first = await service.complete('job-1');
    expect(first?.state).toBe(CraftJobState.COMPLETED);
    // le job a été muté en COMPLETED → 2e appel voit un état non RUNNING
    const second = await service.complete('job-1');
    expect(second).toBeNull();
    expect(mockProgression.applyCharacterXpInTx).toHaveBeenCalledTimes(1);
  });

  it('rollback : une erreur d’XP propage (transaction annulée)', async () => {
    setupComplete(makeJob());
    forceRandom(0);
    mockProgression.applyCharacterXpInTx.mockRejectedValueOnce(new Error('xp error'));

    await expect(service.complete('job-1')).rejects.toThrow('xp error');
  });

  // ── claim() — Phase 3 ───────────────────────────────────────────────────────

  function setupClaim(job: any, outputs: any[] = []) {
    jobToComplete = job; // même holder que le query builder CraftJob
    mockManager.find.mockImplementation((entity: any) => {
      if (entity === CraftJobOutput) return Promise.resolve(outputs);
      return Promise.resolve([]);
    });
  }

  const completedJob = (overrides: any = {}) =>
    makeJob({ state: CraftJobState.COMPLETED, successes: 1, failures: 0, ...overrides });

  it('claim STACKABLE : materialize appelé une fois puis CLAIMED', async () => {
    setupClaim(completedJob(), [{ itemId: 'item-iron_bar', resolvedQuantity: 2, producedQuantity: 1, chance: 1 }]);

    const result = await service.claim('char-1', 'job-1');

    expect(mockMaterialization.materialize).toHaveBeenCalledTimes(1);
    expect(mockMaterialization.materialize).toHaveBeenCalledWith(
      mockManager,
      [{ itemId: 'item-iron_bar', quantity: 2 }],
      { source: 'CRAFT', destination: { type: 'INVENTORY', characterId: 'char-1' }, ownerId: 'char-1' },
    );
    expect(result).toMatchObject({ state: CraftJobState.CLAIMED, produced: [{ itemId: 'item-iron_bar', quantity: 2 }] });
    const jobSave = mockManager.save.mock.calls.find((c) => c[0] === CraftJob);
    expect(jobSave[1]).toMatchObject({ state: CraftJobState.CLAIMED });
    expect(jobSave[1].claimedAt).toBeInstanceOf(Date);
  });

  it('claim INSTANCE : mêmes entrées passées à materialize', async () => {
    setupClaim(completedJob(), [{ itemId: 'item-sword', resolvedQuantity: 1, producedQuantity: 1, chance: 1 }]);

    await service.claim('char-1', 'job-1');

    expect(mockMaterialization.materialize).toHaveBeenCalledWith(
      mockManager,
      [{ itemId: 'item-sword', quantity: 1 }],
      expect.objectContaining({ source: 'CRAFT' }),
    );
  });

  it('claim mélange STACKABLE + INSTANCE : deux entrées, un seul materialize', async () => {
    setupClaim(completedJob(), [
      { itemId: 'item-iron_bar', resolvedQuantity: 3, producedQuantity: 1, chance: 1 },
      { itemId: 'item-sword', resolvedQuantity: 1, producedQuantity: 1, chance: 1 },
    ]);

    const result = await service.claim('char-1', 'job-1');

    expect(mockMaterialization.materialize).toHaveBeenCalledTimes(1);
    expect(mockMaterialization.materialize).toHaveBeenCalledWith(
      mockManager,
      [{ itemId: 'item-iron_bar', quantity: 3 }, { itemId: 'item-sword', quantity: 1 }],
      expect.objectContaining({ source: 'CRAFT' }),
    );
    expect(result.produced).toHaveLength(2);
  });

  it('n’inclut pas les outputs à resolvedQuantity 0 (0 output → pas de materialize)', async () => {
    setupClaim(completedJob(), [{ itemId: 'item-iron_bar', resolvedQuantity: 0, producedQuantity: 1, chance: 0.1 }]);

    const result = await service.claim('char-1', 'job-1');

    expect(mockMaterialization.materialize).not.toHaveBeenCalled();
    expect(result.state).toBe(CraftJobState.CLAIMED);
  });

  it('double claim : 409 Conflict, aucune seconde création', async () => {
    setupClaim(completedJob({ state: CraftJobState.CLAIMED }), [{ itemId: 'item-iron_bar', resolvedQuantity: 2, producedQuantity: 1, chance: 1 }]);

    await expect(service.claim('char-1', 'job-1')).rejects.toBeInstanceOf(ConflictException);
    expect(mockMaterialization.materialize).not.toHaveBeenCalled();
  });

  it('claim d’un job FAILED : refusé, aucune matérialisation', async () => {
    setupClaim(completedJob({ state: CraftJobState.FAILED }), [{ itemId: 'item-iron_bar', resolvedQuantity: 2, producedQuantity: 1, chance: 1 }]);

    await expect(service.claim('char-1', 'job-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(mockMaterialization.materialize).not.toHaveBeenCalled();
  });

  it('claim par un mauvais propriétaire : Forbidden', async () => {
    setupClaim(completedJob({ characterId: 'char-2' }), [{ itemId: 'item-iron_bar', resolvedQuantity: 2, producedQuantity: 1, chance: 1 }]);

    await expect(service.claim('char-1', 'job-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockMaterialization.materialize).not.toHaveBeenCalled();
  });

  it('rollback si materialize échoue : job non passé CLAIMED', async () => {
    setupClaim(completedJob(), [{ itemId: 'item-iron_bar', resolvedQuantity: 2, producedQuantity: 1, chance: 1 }]);
    mockMaterialization.materialize.mockRejectedValueOnce(new Error('materialize error'));

    await expect(service.claim('char-1', 'job-1')).rejects.toThrow('materialize error');
    expect(mockManager.save).not.toHaveBeenCalledWith(CraftJob, expect.anything());
  });

  it('rollback si update CLAIMED échoue', async () => {
    setupClaim(completedJob(), [{ itemId: 'item-iron_bar', resolvedQuantity: 2, producedQuantity: 1, chance: 1 }]);
    mockManager.save.mockImplementationOnce(async () => { throw new Error('save error'); });

    await expect(service.claim('char-1', 'job-1')).rejects.toThrow('save error');
  });

  // ── findDueJobIds — Phase 2 (bornage temps) ─────────────────────────────────

  it('findDueJobIds ne sélectionne que RUNNING avec finishAt <= now (jamais avant finishAt)', async () => {
    craftJobRepo.find.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const now = new Date('2026-07-01T00:00:00.000Z');

    const ids = await service.findDueJobIds(now, 50);

    expect(ids).toEqual(['a', 'b']);
    const arg = craftJobRepo.find.mock.calls[0][0];
    expect(arg.where.state).toBe(CraftJobState.RUNNING);
    // finishAt <= now : un job dont finishAt > now n'est jamais retourné.
    expect(arg.where.finishAt).toEqual(LessThanOrEqual(now));
    expect(arg.take).toBe(50);
    expect(arg.order).toEqual({ finishAt: 'ASC' });
  });
});
