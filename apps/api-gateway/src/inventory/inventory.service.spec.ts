import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { Inventory } from './entities/inventory.entity';
import { Character } from '../characters/entities/character.entity';
import { Item } from '../items/entities/item.entity';

function makeItem(overrides: Partial<Item> = {}): Item {
  return { id: 'item-1', name: 'Bâton de bois', type: 'material', category: 'wooden_stick', ...overrides } as Item;
}

describe('InventoryService — findItemForLoot', () => {
  let service: InventoryService;
  let itemRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    itemRepo = {
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      create: jest.fn((x) => x),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(Inventory), useValue: { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]), save: jest.fn(), create: jest.fn((x) => x) } },
        { provide: getRepositoryToken(Character), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  it('retourne le material si category et type correspondent', async () => {
    const materialItem = makeItem({ type: 'material', category: 'wooden_stick' });
    // Première findOne (material) : trouvé
    itemRepo.findOne.mockResolvedValueOnce(materialItem);

    // Appel indirect via addItem ne suffit pas — on accède à la méthode privée via cast
    const result = await (service as any).findItemForLoot('wooden_stick');

    expect(result).toBe(materialItem);
    expect(itemRepo.findOne).toHaveBeenCalledWith({
      where: { category: 'wooden_stick', type: 'material' },
    });
  });

  it("ne retourne pas un item non-material pour le même category si un material existe", async () => {
    const materialItem = makeItem({ type: 'material', category: 'wooden_stick' });
    // Première findOne (material) : trouvé → ne doit pas aller plus loin
    itemRepo.findOne.mockResolvedValueOnce(materialItem);

    const result = await (service as any).findItemForLoot('wooden_stick');

    expect(result?.type).toBe('material');
    // findOne appelé une seule fois — le fallback générique n'est pas consulté
    expect(itemRepo.findOne).toHaveBeenCalledTimes(1);
  });

  it('plusieurs earring/accessory avec même category ne cassent pas la recherche', async () => {
    // Aucun earring n'est de type material → findOne(material) retourne null
    itemRepo.findOne.mockResolvedValueOnce(null);
    // Fallback : findOne générique retourne un accessory
    const earring = makeItem({ type: 'accessory', category: 'earring' });
    itemRepo.findOne.mockResolvedValueOnce(earring);
    itemRepo.findOneBy.mockResolvedValue(null); // pas un UUID

    const result = await (service as any).findItemForLoot('earring');
    expect(result?.category).toBe('earring');
  });

  it('retourne null si aucun item ne correspond', async () => {
    itemRepo.findOne.mockResolvedValue(null);
    itemRepo.findOneBy.mockResolvedValue(null);

    const result = await (service as any).findItemForLoot('inexistant');
    expect(result).toBeNull();
  });

  it('résout par UUID si itemRef est un UUID', async () => {
    const uuid = '12345678-1234-1234-8234-123456789abc'; // 4e groupe [89ab]xxxxx
    const found = makeItem({ id: uuid });
    itemRepo.findOneBy.mockResolvedValue(found);

    const result = await (service as any).findItemForLoot(uuid);
    expect(result?.id).toBe(uuid);
    expect(itemRepo.findOneBy).toHaveBeenCalledWith({ id: uuid });
  });
});
