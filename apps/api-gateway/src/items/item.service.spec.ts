import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  CANONICAL_WOODEN_STICK,
  ItemService,
  LEGACY_WOODEN_STICK_MATCH,
  LOOT_ITEM_SEEDS,
} from './item.service';
import { Item, ObjectMode } from './entities/item.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { ItemInstance } from '../item-instances/entities/item-instance.entity';
import { ResourceTemplate } from '../resources/entities/resource-template.entity';
import { CreatureTemplate } from '../creatures/entities/creature-template.entity';
import { CraftingIngredient } from '../crafting/entities/crafting-ingredient.entity';
import { CraftingResult } from '../crafting/entities/crafting-result.entity';
import { WorldItem } from '../world-items/entities/world-item.entity';
import { AuctionListing } from '../auction/entities/auction-listing.entity';
import { MailMessage } from '../mail/entities/mail-message.entity';
import { Character } from '../characters/entities/character.entity';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-uuid-1',
    name: 'Bâton de bois',
    type: 'material',
    category: 'wooden_stick',
    attack: null,
    defense: null,
    range: null,
    slot: null,
    image: null,
    weaponType: null,
    objectMode: ObjectMode.STACKABLE,
    enabled: true,
    characterEquipment: [],
    inventory: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Item;
}

function makeInventory(overrides: Partial<Inventory> = {}): Inventory {
  return {
    id: 'inv-1',
    character: { id: 'char-1' } as any,
    item: makeItem(),
    quantity: 1,
    equipped: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Inventory;
}

function makeQueryBuilder(overrides: Record<string, jest.Mock> = {}) {
  const qb: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn(),
    getCount: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
  return qb;
}

// ── Setup ──────────────────────────────────────────────────────────────────────

describe('ItemService', () => {
  let service: ItemService;
  let repo: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    remove: jest.Mock;
  };
  let inventoryRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let equipmentRepo: {
    count: jest.Mock;
  };
  let resourceTemplateRepo: {
    createQueryBuilder: jest.Mock;
    find: jest.Mock;
  };
  let creatureTemplateRepo: {
    createQueryBuilder: jest.Mock;
    find: jest.Mock;
  };
  let craftingIngredientRepo: {
    createQueryBuilder: jest.Mock;
    find: jest.Mock;
  };
  let craftingResultRepo: {
    createQueryBuilder: jest.Mock;
    find: jest.Mock;
  };
  let instanceRepo: {
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let worldItemRepo: {
    count: jest.Mock;
  };
  let auctionListingRepo: {
    createQueryBuilder: jest.Mock;
  };
  let mailMessageRepo: {
    createQueryBuilder: jest.Mock;
  };
  let characterRepo: {
    findOne: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest
        .fn()
        .mockImplementation((e) => Promise.resolve({ ...e, id: 'new-uuid' })),
      create: jest.fn().mockImplementation((e) => e),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    inventoryRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
      remove: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(),
    };
    equipmentRepo = {
      count: jest.fn().mockResolvedValue(0),
    };
    resourceTemplateRepo = {
      createQueryBuilder: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    creatureTemplateRepo = {
      createQueryBuilder: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    craftingIngredientRepo = {
      createQueryBuilder: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    craftingResultRepo = {
      createQueryBuilder: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    instanceRepo = {
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(),
    };
    worldItemRepo = {
      count: jest.fn().mockResolvedValue(0),
    };
    auctionListingRepo = {
      createQueryBuilder: jest.fn(),
    };
    mailMessageRepo = {
      createQueryBuilder: jest.fn(),
    };
    characterRepo = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemService,
        { provide: getRepositoryToken(Item), useValue: repo },
        { provide: getRepositoryToken(Inventory), useValue: inventoryRepo },
        {
          provide: getRepositoryToken(CharacterEquipment),
          useValue: equipmentRepo,
        },
        {
          provide: getRepositoryToken(ResourceTemplate),
          useValue: resourceTemplateRepo,
        },
        {
          provide: getRepositoryToken(CreatureTemplate),
          useValue: creatureTemplateRepo,
        },
        {
          provide: getRepositoryToken(CraftingIngredient),
          useValue: craftingIngredientRepo,
        },
        {
          provide: getRepositoryToken(CraftingResult),
          useValue: craftingResultRepo,
        },
        {
          provide: getRepositoryToken(ItemInstance),
          useValue: instanceRepo,
        },
        {
          provide: getRepositoryToken(WorldItem),
          useValue: worldItemRepo,
        },
        {
          provide: getRepositoryToken(AuctionListing),
          useValue: auctionListingRepo,
        },
        {
          provide: getRepositoryToken(MailMessage),
          useValue: mailMessageRepo,
        },
        {
          provide: getRepositoryToken(Character),
          useValue: characterRepo,
        },
      ],
    }).compile();

    service = module.get(ItemService);
  });

  // ── LOOT_ITEM_SEEDS ──────────────────────────────────────────────────────────

  describe('LOOT_ITEM_SEEDS', () => {
    it('contient wooden_stick', () => {
      const seed = LOOT_ITEM_SEEDS.find((s) => s.category === 'wooden_stick');
      expect(seed).toBeDefined();
      expect(seed!.type).toBe('material');
      expect(seed!.name).toBe('Bâton de bois');
      expect(seed!.image).toBe('/assets/images/items/wooden_stick.png');
    });

    it('contient iron_ore', () => {
      const seed = LOOT_ITEM_SEEDS.find((s) => s.category === 'iron_ore');
      expect(seed).toBeDefined();
      expect(seed!.type).toBe('material');
    });

    it('tous les seeds ont name, type, category non vides', () => {
      for (const s of LOOT_ITEM_SEEDS) {
        expect(s.name.length).toBeGreaterThan(0);
        expect(s.type.length).toBeGreaterThan(0);
        expect(s.category.length).toBeGreaterThan(0);
      }
    });

    it('le seed canonique dead_tree → wooden_stick est complet pour l’inventaire', () => {
      const seed = LOOT_ITEM_SEEDS.find(
        (s) => s.category === 'wooden_stick' && s.type === 'material',
      );
      expect(seed).toMatchObject({
        name: 'Bâton de bois',
        category: 'wooden_stick',
        type: 'material',
        image: '/assets/images/items/wooden_stick.png',
      });
    });

    it('expose la définition canonique wooden_stick', () => {
      expect(CANONICAL_WOODEN_STICK).toEqual({
        category: 'wooden_stick',
        type: 'material',
        image: '/assets/images/items/wooden_stick.png',
      });
    });
  });

  // ── onModuleInit / seedLootItems ─────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('insère les items absents au démarrage', async () => {
      repo.findOne.mockResolvedValue(null); // aucun item material en DB
      await service.onModuleInit();
      expect(repo.save).toHaveBeenCalledTimes(LOOT_ITEM_SEEDS.length);
    });

    it('ne duplique pas les items déjà présents', async () => {
      // Chaque seed retourne un item avec tous les champs identiques → aucun dirty
      for (const seed of LOOT_ITEM_SEEDS) {
        repo.findOne.mockResolvedValueOnce(
          makeItem({
            image: seed.image ?? null,
            objectMode: seed.objectMode,
            slot: seed.slot ?? null,
            attack: seed.attack ?? null,
            defense: seed.defense ?? null,
            weaponType: seed.weaponType ?? null,
          }),
        );
      }
      await service.onModuleInit();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("complète l'image de l'item canonique existant sans créer de doublon", async () => {
      const existingWoodenStick = makeItem({ image: null });
      repo.findOne
        .mockResolvedValueOnce(existingWoodenStick)
        .mockResolvedValue(makeItem({ image: null }));

      await service.onModuleInit();

      expect(repo.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ category: 'wooden_stick' }),
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: existingWoodenStick.id,
          category: 'wooden_stick',
          image: '/assets/images/items/wooden_stick.png',
        }),
      );
    });

    it('insère uniquement les items manquants (un absent parmi plusieurs présents)', async () => {
      repo.findOne
        .mockResolvedValueOnce(makeItem({ image: '/assets/images/items/wooden_stick.png', objectMode: ObjectMode.STACKABLE })) // wooden_stick présent
        .mockResolvedValueOnce(null)                                                                                            // iron_ore absent → insert
        .mockResolvedValueOnce(makeItem({ objectMode: ObjectMode.STACKABLE }))                                                  // iron_bar présent
        .mockResolvedValueOnce(makeItem({ objectMode: ObjectMode.STACKABLE }))                                                  // basic_handle présent
        .mockResolvedValueOnce(makeItem({ objectMode: ObjectMode.STACKABLE }))                                                  // rough_blade présent
        .mockResolvedValueOnce(makeItem({ objectMode: ObjectMode.INSTANCE, slot: 'right-hand' as any, attack: 5, defense: 0, weaponType: 'two_handed_sword' })); // basic_sword présent
      await service.onModuleInit();
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('vérifie par (category, type) — un earring wooden_stick ne bloque pas le seed', async () => {
      // Un item non-material avec category='wooden_stick' ne doit pas bloquer la seed
      // La seed cherche { category, type: 'material' } — ici findOne retourne null → insert OK
      repo.findOne.mockResolvedValue(null);
      await service.onModuleInit();
      // Vérifie que la recherche inclut type dans le where
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'material' }),
        }),
      );
    });
  });

  // ── mergeLegacyWoodenStickItems ─────────────────────────────────────────────

  describe('mergeLegacyWoodenStickItems', () => {
    it('fusionne les quantités inventory du doublon legacy vers le canonique', async () => {
      const canonical = makeItem({
        id: 'canonical-wood',
        ...CANONICAL_WOODEN_STICK,
        name: 'Bâton de bois',
      });
      const legacy = makeItem({
        id: 'legacy-wood',
        ...LEGACY_WOODEN_STICK_MATCH,
        name: 'Bâton en bois',
      });
      const canonicalRow = makeInventory({
        id: 'inv-canonical',
        character: { id: 'char-1' } as any,
        item: canonical,
        quantity: 57,
      });
      const legacyRow = makeInventory({
        id: 'inv-legacy',
        character: { id: 'char-1' } as any,
        item: legacy,
        quantity: 7,
      });

      repo.findOne.mockResolvedValue(canonical);
      repo.find.mockResolvedValue([legacy]);
      inventoryRepo.find.mockResolvedValue([legacyRow]);
      inventoryRepo.findOne.mockResolvedValue(canonicalRow);
      inventoryRepo.count.mockResolvedValue(0);
      equipmentRepo.count.mockResolvedValue(0);

      await (service as any).mergeLegacyWoodenStickItems();

      expect(repo.find).toHaveBeenCalledWith({
        where: LEGACY_WOODEN_STICK_MATCH,
      });
      expect(inventoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'inv-canonical',
          quantity: 64,
          item: expect.objectContaining({
            category: 'wooden_stick',
            type: 'material',
            image: '/assets/images/items/wooden_stick.png',
          }),
        }),
      );
      expect(inventoryRepo.remove).toHaveBeenCalledWith(legacyRow);
      expect(repo.remove).toHaveBeenCalledWith(legacy);
    });

    it("réassigne la ligne legacy vers l'item canonique si le personnage n'a pas encore de ligne canonique", async () => {
      const canonical = makeItem({
        id: 'canonical-wood',
        ...CANONICAL_WOODEN_STICK,
      });
      const legacy = makeItem({
        id: 'legacy-wood',
        ...LEGACY_WOODEN_STICK_MATCH,
        name: 'Bâton en bois',
      });
      const legacyRow = makeInventory({
        id: 'inv-legacy',
        character: { id: 'char-2' } as any,
        item: legacy,
        quantity: 3,
      });

      repo.findOne.mockResolvedValue(canonical);
      repo.find.mockResolvedValue([legacy]);
      inventoryRepo.find.mockResolvedValue([legacyRow]);
      inventoryRepo.findOne.mockResolvedValue(null);
      inventoryRepo.count.mockResolvedValue(0);
      equipmentRepo.count.mockResolvedValue(0);

      await (service as any).mergeLegacyWoodenStickItems();

      expect(inventoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'inv-legacy',
          quantity: 3,
          item: expect.objectContaining({
            id: 'canonical-wood',
            image: '/assets/images/items/wooden_stick.png',
          }),
        }),
      );
      expect(inventoryRepo.remove).not.toHaveBeenCalled();
      expect(repo.remove).toHaveBeenCalledWith(legacy);
    });

    it("conserve l'ancien item si une référence équipement reste présente", async () => {
      const canonical = makeItem({
        id: 'canonical-wood',
        ...CANONICAL_WOODEN_STICK,
      });
      const legacy = makeItem({
        id: 'legacy-wood',
        ...LEGACY_WOODEN_STICK_MATCH,
      });

      repo.findOne.mockResolvedValue(canonical);
      repo.find.mockResolvedValue([legacy]);
      inventoryRepo.find.mockResolvedValue([]);
      inventoryRepo.count.mockResolvedValue(0);
      equipmentRepo.count.mockResolvedValue(1);

      await (service as any).mergeLegacyWoodenStickItems();

      expect(repo.remove).not.toHaveBeenCalled();
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it("retourne l'item si trouvé", async () => {
      const item = makeItem();
      repo.findOne.mockResolvedValue(item);
      await expect(service.findOne('item-uuid-1')).resolves.toEqual(item);
    });

    it('lève NotFoundException si absent', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne('inexistant')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it("met à jour l'image d'un item existant", async () => {
      const item = makeItem({ image: null });
      repo.findOne.mockResolvedValue(item);

      await expect(
        service.update('item-uuid-1', {
          image: '/assets/images/items/wooden_stick.png',
        }),
      ).resolves.toMatchObject({
        image: '/assets/images/items/wooden_stick.png',
      });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          image: '/assets/images/items/wooden_stick.png',
        }),
      );
    });

    it("refuse de changer objectMode si des instances runtime existent", async () => {
      const item = makeItem({ objectMode: ObjectMode.INSTANCE });
      repo.findOne.mockResolvedValue(item);
      instanceRepo.count.mockResolvedValue(2);
      inventoryRepo.count.mockResolvedValue(0);
      equipmentRepo.count.mockResolvedValue(0);

      await expect(
        service.update("item-uuid-1", { objectMode: ObjectMode.STACKABLE }),
      ).rejects.toThrow("Cannot change objectMode");
    });

    it("refuse de changer objectMode si des stacks inventory existent", async () => {
      const item = makeItem({ objectMode: ObjectMode.STACKABLE });
      repo.findOne.mockResolvedValue(item);
      instanceRepo.count.mockResolvedValue(0);
      inventoryRepo.count.mockResolvedValue(5);
      equipmentRepo.count.mockResolvedValue(0);

      await expect(
        service.update("item-uuid-1", { objectMode: ObjectMode.INSTANCE }),
      ).rejects.toThrow("Cannot change objectMode");
    });

    it("refuse de changer objectMode si l'item est équipé en legacy character_equipment", async () => {
      const item = makeItem({ objectMode: ObjectMode.STACKABLE });
      repo.findOne.mockResolvedValue(item);
      instanceRepo.count.mockResolvedValue(0);
      inventoryRepo.count.mockResolvedValue(0);
      equipmentRepo.count.mockResolvedValue(1);

      await expect(
        service.update("item-uuid-1", { objectMode: ObjectMode.INSTANCE }),
      ).rejects.toThrow("Cannot change objectMode");
    });

    it("autorise le changement de objectMode si aucune donnée runtime", async () => {
      const item = makeItem({ objectMode: ObjectMode.INSTANCE });
      repo.findOne.mockResolvedValue(item);
      instanceRepo.count.mockResolvedValue(0);
      inventoryRepo.count.mockResolvedValue(0);
      equipmentRepo.count.mockResolvedValue(0);

      await expect(
        service.update("item-uuid-1", { objectMode: ObjectMode.STACKABLE }),
      ).resolves.toMatchObject({ objectMode: ObjectMode.STACKABLE });
    });
  });

  // ── getUsageStats ───────────────────────────────────────────────────────────

  describe('getUsageStats', () => {
    it('retourne les usages inventory, lootPool et craft depuis des requêtes serveur', async () => {
      const item = makeItem({
        id: 'item-wood',
        category: 'wooden_stick',
        type: 'material',
      });
      repo.findOne.mockResolvedValue(item);

      const inventoryQb = makeQueryBuilder({
        getRawOne: jest.fn().mockResolvedValue({
          totalQuantityServer: '64',
          inventoryEntries: '4',
          uniqueCharacters: '4',
        }),
      });
      inventoryRepo.createQueryBuilder.mockReturnValue(inventoryQb);

      const resourceQb = makeQueryBuilder({
        getMany: jest
          .fn()
          .mockResolvedValue([{ id: 'res-tpl-1', type: 'dead_tree' }]),
      });
      resourceTemplateRepo.createQueryBuilder.mockReturnValue(resourceQb);

      const creatureQb = makeQueryBuilder({
        getMany: jest
          .fn()
          .mockResolvedValue([{ id: 1, key: 'turkey', name: 'Turkey' }]),
      });
      creatureTemplateRepo.createQueryBuilder.mockReturnValue(creatureQb);

      const outputQb = makeQueryBuilder({
        getRawMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'recipe-1', key: 'basic_handle', name: 'Manche brut' },
          ]),
      });
      craftingResultRepo.createQueryBuilder.mockReturnValue(outputQb);

      const ingredientQb = makeQueryBuilder({
        getRawMany: jest.fn().mockResolvedValue([
          { id: 'recipe-2', key: 'basic_sword', name: 'Épée basique' },
          { id: 'recipe-2', key: 'basic_sword', name: 'Épée basique' },
        ]),
      });
      craftingIngredientRepo.createQueryBuilder.mockReturnValue(ingredientQb);

      await expect(service.getUsageStats('item-wood')).resolves.toEqual({
        itemId: 'item-wood',
        totalQuantityServer: 64,
        inventoryEntries: 4,
        uniqueCharacters: 4,
        usedInResourceLootPools: [{ id: 'res-tpl-1', type: 'dead_tree' }],
        usedInCreatureLootPools: [{ id: 1, key: 'turkey', name: 'Turkey' }],
        usedInCraftRecipesOutput: [
          { id: 'recipe-1', key: 'basic_handle', name: 'Manche brut' },
        ],
        usedInCraftRecipesIngredient: [
          { id: 'recipe-2', key: 'basic_sword', name: 'Épée basique' },
        ],
      });

      expect(inventoryQb.where).toHaveBeenCalledWith(
        'inventory."itemId" = :itemId',
        { itemId: 'item-wood' },
      );
      expect(resourceQb.where).toHaveBeenCalledWith(
        expect.stringContaining(
          'template.lootPool @> CAST(:lootRef0 AS jsonb)',
        ),
        expect.objectContaining({
          lootRef0: JSON.stringify([{ itemId: 'wooden_stick' }]),
          lootRef1: JSON.stringify([{ itemId: 'item-wood' }]),
        }),
      );
      expect(outputQb.where).toHaveBeenCalledWith('result.itemId = :itemId', {
        itemId: 'item-wood',
      });
      expect(ingredientQb.where).toHaveBeenCalledWith(
        'ingredient.itemId = :itemId',
        { itemId: 'item-wood' },
      );
    });
  });

  // ── Maintenance ────────────────────────────────────────────────────────────

  describe('getMaintenanceReport', () => {
    function wireEmptyReport(item: Item) {
      repo.findOne.mockResolvedValue(item);
      // inventory : aggregate (getRawOne) + lignes (getRawMany)
      inventoryRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({
          getRawOne: jest.fn().mockResolvedValue({
            totalQuantityServer: '0',
            inventoryEntries: '0',
            uniqueCharacters: '0',
          }),
          getRawMany: jest.fn().mockResolvedValue([]),
        }),
      );
      instanceRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([]) }),
      );
      resourceTemplateRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      creatureTemplateRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      craftingResultRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      craftingIngredientRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      auctionListingRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      mailMessageRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
    }

    it('retourne totalReferences=0 quand aucune reference nexiste', async () => {
      const item = makeItem({ id: 'item-x', name: 'Epee', objectMode: ObjectMode.INSTANCE });
      wireEmptyReport(item);

      const report = await service.getMaintenanceReport('item-x');

      expect(report.template.id).toBe('item-x');
      expect(report.template.enabled).toBe(true);
      expect(report.totalReferences).toBe(0);
      expect(report.inventory.stackCount).toBe(0);
      expect(report.instances.total).toBe(0);
    });

    it('ne crash pas avec un item.id uuid vs item_instance.itemId varchar : la jointure mail caste inst.id en ::text', async () => {
      // Reproduit "operator does not exist: uuid = character varying" :
      // item_instance.id (uuid) joint sur mail_message.attachedItemInstanceId (varchar).
      const item = makeItem({
        id: '11111111-2222-3333-4444-555555555555', // uuid reel
        name: 'Épée basique',
        category: 'basic_sword',
        objectMode: ObjectMode.INSTANCE,
      });
      const mailQb = makeQueryBuilder();
      wireEmptyReport(item);
      mailMessageRepo.createQueryBuilder.mockReturnValue(mailQb);

      await expect(service.getMaintenanceReport(item.id)).resolves.toBeDefined();

      // La condition de jointure doit caster l'uuid en texte pour eviter le crash.
      const joinCondition = mailQb.innerJoin.mock.calls[0][2] as string;
      expect(joinCondition).toContain('inst.id::text');
      expect(joinCondition).not.toMatch(/inst\.id\s*=/);
    });

    it('compte les stacks inventory et les instances actives dans totalReferences', async () => {
      const item = makeItem({ id: 'item-y', objectMode: ObjectMode.INSTANCE });
      repo.findOne.mockResolvedValue(item);
      inventoryRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({
          getRawOne: jest.fn().mockResolvedValue({
            totalQuantityServer: '5',
            inventoryEntries: '1',
            uniqueCharacters: '1',
          }),
          getRawMany: jest.fn().mockResolvedValue([
            { id: 'inv-1', quantity: 5, equipped: false, characterId: 'char-1', characterName: 'Alice' },
          ]),
        }),
      );
      instanceRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({
          getRawMany: jest.fn().mockResolvedValue([
            { instanceType: 'NORMAL', state: 'AVAILABLE', containerType: 'INVENTORY', count: '2' },
            { instanceType: 'NORMAL', state: 'DESTROYED', containerType: 'NONE', count: '3' },
          ]),
        }),
      );
      resourceTemplateRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      creatureTemplateRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      craftingResultRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      craftingIngredientRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      auctionListingRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      mailMessageRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());

      const report = await service.getMaintenanceReport('item-y');

      // 1 stack + 2 instances actives (DESTROYED exclue) = 3
      expect(report.inventory.stacks[0].characterName).toBe('Alice');
      expect(report.instances.total).toBe(5);
      expect(report.instances.activeTotal).toBe(2);
      expect(report.totalReferences).toBe(3);
      // Detail par categorie : la somme du breakdown egale totalReferences.
      expect(report.references.inventoryStacks).toBe(1);
      expect(report.references.activeItemInstances).toBe(2);
      expect(report.references.equipped).toBe(0);
      expect(report.references.lootPoolRefs).toBe(0);
      expect(report.references.recipeRefs).toBe(0);
      const sum = Object.values(report.references).reduce((a, b) => a + b, 0);
      expect(sum).toBe(report.totalReferences);
    });
  });

  describe('deleteItemTemplate', () => {
    it('refuse la suppression si des references existent', async () => {
      const item = makeItem({ id: 'item-z', name: 'Epee' });
      repo.findOne.mockResolvedValue(item);
      inventoryRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({
          getRawOne: jest.fn().mockResolvedValue({
            totalQuantityServer: '1', inventoryEntries: '1', uniqueCharacters: '1',
          }),
          getRawMany: jest.fn().mockResolvedValue([
            { id: 'inv-9', quantity: 1, equipped: false, characterId: 'char-1', characterName: 'Bob' },
          ]),
        }),
      );
      instanceRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([]) }),
      );
      resourceTemplateRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      creatureTemplateRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      craftingResultRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      craftingIngredientRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      auctionListingRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      mailMessageRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());

      await expect(service.deleteItemTemplate('item-z')).rejects.toBeInstanceOf(ConflictException);
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('supprime le template si zero reference', async () => {
      const item = makeItem({ id: 'item-free', name: 'Orphelin', objectMode: ObjectMode.INSTANCE });
      repo.findOne.mockResolvedValue(item);
      inventoryRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({
          getRawOne: jest.fn().mockResolvedValue({
            totalQuantityServer: '0', inventoryEntries: '0', uniqueCharacters: '0',
          }),
          getRawMany: jest.fn().mockResolvedValue([]),
        }),
      );
      instanceRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([]) }),
      );
      resourceTemplateRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      creatureTemplateRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      craftingResultRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      craftingIngredientRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      auctionListingRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());
      mailMessageRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());

      const result = await service.deleteItemTemplate('item-free');

      expect(result.name).toBe('Orphelin');
      expect(repo.remove).toHaveBeenCalledWith(item);
    });
  });

  describe('disableItemTemplate', () => {
    it('passe enabled a false', async () => {
      const item = makeItem({ id: 'item-d', enabled: true });
      repo.findOne.mockResolvedValue(item);
      repo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.disableItemTemplate('item-d');

      expect(result.enabled).toBe(false);
      expect(repo.save).toHaveBeenCalled();
    });

    it('ne resauvegarde pas un template deja desactive', async () => {
      const item = makeItem({ id: 'item-d2', enabled: false });
      repo.findOne.mockResolvedValue(item);

      await service.disableItemTemplate('item-d2');

      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('deleteInventoryStack', () => {
    // Helper : manager avec repo Inventory mocke (createQueryBuilder verrou + findOne relations).
    function makeStackManager(lockedRow: any, detailedRow: any) {
      const managerQb = makeQueryBuilder({ getOne: jest.fn().mockResolvedValue(lockedRow) });
      const invRepo = {
        createQueryBuilder: jest.fn(() => managerQb),
        findOne: jest.fn().mockResolvedValue(detailedRow),
      };
      const manager = {
        getRepository: jest.fn().mockReturnValue(invRepo),
        remove: jest.fn().mockResolvedValue(undefined),
      };
      (repo as any).manager = {
        transaction: jest.fn().mockImplementation(async (fn: any) => fn(manager)),
      };
      return { manager, managerQb, invRepo };
    }

    it('ne combine pas FOR UPDATE avec un LEFT JOIN (garde regression uuid/varchar)', async () => {
      const { managerQb } = makeStackManager(
        { id: 'inv-ok', equipped: false },
        { id: 'inv-ok', character: { id: 'char-7' }, item: { name: 'Baton' } },
      );

      await service.deleteInventoryStack('inv-ok');

      // Le verrou pessimiste est pose...
      expect(managerQb.setLock).toHaveBeenCalledWith('pessimistic_write');
      // ...mais sans aucun join (Postgres interdit FOR UPDATE + outer join).
      expect(managerQb.leftJoinAndSelect).not.toHaveBeenCalled();
      expect(managerQb.leftJoin).not.toHaveBeenCalled();
      expect(managerQb.innerJoin).not.toHaveBeenCalled();
    });

    it('refuse une stack equipee', async () => {
      const { manager } = makeStackManager(
        { id: 'inv-eq', equipped: true },
        { id: 'inv-eq', character: { id: 'char-1' }, item: { name: 'Epee' } },
      );

      await expect(service.deleteInventoryStack('inv-eq')).rejects.toBeInstanceOf(BadRequestException);
      expect(manager.remove).not.toHaveBeenCalled();
    });

    it('supprime une stack non equipee et retourne le characterId', async () => {
      const { manager } = makeStackManager(
        { id: 'inv-ok', equipped: false },
        { id: 'inv-ok', character: { id: 'char-7' }, item: { name: 'Baton' } },
      );

      const result = await service.deleteInventoryStack('inv-ok');

      expect(result).toEqual({ characterId: 'char-7', itemName: 'Baton' });
      expect(manager.remove).toHaveBeenCalled();
    });
  });
});
