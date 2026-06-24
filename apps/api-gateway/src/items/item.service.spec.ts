import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ItemService, LOOT_ITEM_SEEDS } from './item.service';
import { Item } from './entities/item.entity';

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

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((e) => Promise.resolve({ ...e, id: 'new-uuid' })),
      create: jest.fn().mockImplementation((e) => e),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemService,
        { provide: getRepositoryToken(Item), useValue: repo },
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
  });

  // ── onModuleInit / seedLootItems ─────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('insère les items absents au démarrage', async () => {
      repo.findOne.mockResolvedValue(null); // aucun item material en DB
      await service.onModuleInit();
      expect(repo.save).toHaveBeenCalledTimes(LOOT_ITEM_SEEDS.length);
    });

    it('ne duplique pas les items déjà présents', async () => {
      repo.findOne.mockResolvedValue(makeItem()); // material déjà présents
      await service.onModuleInit();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('insère uniquement les items manquants (un absent parmi plusieurs présents)', async () => {
      repo.findOne
        .mockResolvedValueOnce(makeItem()) // wooden_stick présent
        .mockResolvedValueOnce(null)       // iron_ore absent → insert
        .mockResolvedValue(makeItem());    // iron_bar, basic_handle, rough_blade, basic_sword présents
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
        expect.objectContaining({ where: expect.objectContaining({ type: 'material' }) }),
      );
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
      await expect(service.findOne('inexistant')).rejects.toThrow(NotFoundException);
    });
  });
});
