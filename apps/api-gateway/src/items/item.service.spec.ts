import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import {
  CANONICAL_WOODEN_STICK,
  ItemService,
  LEGACY_WOODEN_STICK_MATCH,
  LOOT_ITEM_SEEDS,
} from './item.service';
import { Item } from './entities/item.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';

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
  };
  let equipmentRepo: {
    count: jest.Mock;
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
    };
    equipmentRepo = {
      count: jest.fn().mockResolvedValue(0),
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
      repo.findOne.mockResolvedValue(
        makeItem({ image: '/assets/images/items/wooden_stick.png' }),
      ); // material déjà présents
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
        .mockResolvedValueOnce(
          makeItem({ image: '/assets/images/items/wooden_stick.png' }),
        ) // wooden_stick présent
        .mockResolvedValueOnce(null) // iron_ore absent → insert
        .mockResolvedValue(makeItem({ image: null })); // iron_bar, basic_handle, rough_blade, basic_sword présents
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
  });
});
