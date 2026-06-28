import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { InventoryService } from './inventory.service';
import { Inventory } from './entities/inventory.entity';
import { Character } from '../characters/entities/character.entity';
import { Item } from '../items/entities/item.entity';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from '../item-instances/entities/item-instance.entity';

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    name: 'Bâton de bois',
    type: 'material',
    category: 'wooden_stick',
    image: '/assets/images/items/wooden_stick.png',
    ...overrides,
  } as Item;
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
        {
          provide: getRepositoryToken(Inventory),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn(),
            create: jest.fn((x) => x),
          },
        },
        {
          provide: getRepositoryToken(Character),
          useValue: { findOne: jest.fn() },
        },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        {
          provide: getRepositoryToken(CharacterEquipment),
          useValue: { findOne: jest.fn(), save: jest.fn(), delete: jest.fn() },
        },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  it('retourne le material si category et type correspondent', async () => {
    const materialItem = makeItem({
      type: 'material',
      category: 'wooden_stick',
    });
    // Première findOne (material) : trouvé
    itemRepo.findOne.mockResolvedValueOnce(materialItem);

    // Appel indirect via addItem ne suffit pas — on accède à la méthode privée via cast
    const result = await (service as any).findItemForLoot('wooden_stick');

    expect(result).toBe(materialItem);
    expect(itemRepo.findOne).toHaveBeenCalledWith({
      where: { category: 'wooden_stick', type: 'material' },
    });
  });

  it('ne retourne pas un item non-material pour le même category si un material existe', async () => {
    const materialItem = makeItem({
      type: 'material',
      category: 'wooden_stick',
    });
    // Première findOne (material) : trouvé → ne doit pas aller plus loin
    itemRepo.findOne.mockResolvedValueOnce(materialItem);

    const result = await (service as any).findItemForLoot('wooden_stick');

    expect(result?.type).toBe('material');
    // findOne appelé une seule fois — le fallback générique n'est pas consulté
    expect(itemRepo.findOne).toHaveBeenCalledTimes(1);
  });

  it("retourne l'item canonique affichable plutôt que le doublon legacy type=wooden_stick", async () => {
    const canonical = makeItem({
      id: 'canonical-wood',
      type: 'material',
      category: 'wooden_stick',
      image: '/assets/images/items/wooden_stick.png',
    });
    itemRepo.findOne.mockResolvedValueOnce(canonical);

    const result = await (service as any).findItemForLoot('wooden_stick');

    expect(result).toMatchObject({
      id: 'canonical-wood',
      type: 'material',
      category: 'wooden_stick',
      image: '/assets/images/items/wooden_stick.png',
    });
    expect(itemRepo.findOne).toHaveBeenCalledWith({
      where: { category: 'wooden_stick', type: 'material' },
    });
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

function makeEquipService(overrides: {
  inventoryRepo?: Record<string, jest.Mock>;
  itemRepo?: Record<string, jest.Mock>;
  equipmentRepo?: Record<string, jest.Mock>;
  dataSource?: { transaction: jest.Mock };
} = {}): InventoryService {
  const inventoryRepo = overrides.inventoryRepo ?? { findOne: jest.fn(), save: jest.fn(), create: jest.fn((x) => x), find: jest.fn().mockResolvedValue([]) };
  const itemRepo = overrides.itemRepo ?? { findOne: jest.fn(), findOneBy: jest.fn() };
  const equipmentRepo = overrides.equipmentRepo ?? { findOne: jest.fn(), save: jest.fn(), delete: jest.fn() };
  const dataSource = overrides.dataSource ?? { transaction: jest.fn() };

  return new InventoryService(
    inventoryRepo as any,
    { findOneBy: jest.fn() } as any,
    itemRepo as any,
    equipmentRepo as any,
    dataSource as any,
  );
}

function makeInstance(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return {
    id: "instance-1",
    itemId: "sword-1",
    ownerType: "character",
    ownerId: "char-1",
    state: ItemInstanceState.AVAILABLE,
    containerType: ItemInstanceContainerType.INVENTORY,
    containerId: "char-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ItemInstance;
}

function makeManager(calls: {
  findOne?: jest.Mock;
  save?: jest.Mock;
  delete?: jest.Mock;
  create?: jest.Mock;
  getRepository?: jest.Mock;
}): jest.Mocked<EntityManager> {
  return {
    findOne: calls.findOne ?? jest.fn(),
    save: calls.save ?? jest.fn(async (_entity, value) => value),
    delete: calls.delete ?? jest.fn(),
    create: calls.create ?? jest.fn((_entity, value) => value),
    getRepository: calls.getRepository ?? jest.fn(),
  } as unknown as jest.Mocked<EntityManager>;
}

describe("InventoryService.equipItem — Equipment Runtime V2", () => {
  const weaponItem = makeItem({ id: "sword-1", type: "weapon", category: "basic_sword", slot: "weapon" as any });
  const characterId = "char-1";

  it("cree CharacterEquipment et met à jour Inventory.equipped à true", async () => {
    const inv = { id: "inv-1", quantity: 1, equipped: false, item: weaponItem } as Inventory;
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(null)       // existing CharacterEquipment: none
        .mockResolvedValueOnce(inv),       // Inventory row
      save: jest.fn(async (_entity, value) => value),
      delete: jest.fn(),
      create: jest.fn((_entity, value) => value),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({
      itemRepo: { findOne: jest.fn().mockResolvedValue(weaponItem), findOneBy: jest.fn() },
      dataSource,
    });

    const result = await service.equipItem(characterId, weaponItem.id);

    expect(manager.save).toHaveBeenCalledWith(CharacterEquipment, expect.objectContaining({ characterId, itemId: weaponItem.id, slot: "weapon" }));
    expect(result.equipped).toBe(true);
  });

  it("retire l ancien CharacterEquipment et met Inventory.equipped à false pour l item precedent", async () => {
    const existingEquip = { characterId, itemId: "old-sword", slot: "weapon" } as CharacterEquipment;
    const oldInv = { id: "inv-old", quantity: 1, equipped: true, item: makeItem({ id: "old-sword" }) } as Inventory;
    const newInv = { id: "inv-new", quantity: 1, equipped: false, item: weaponItem } as Inventory;
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(existingEquip)  // existing CharacterEquipment
        .mockResolvedValueOnce(oldInv)         // old Inventory row
        .mockResolvedValueOnce(newInv),        // new Inventory row
      save: jest.fn(async (_entity, value) => value),
      delete: jest.fn(),
      create: jest.fn((_entity, value) => value),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({
      itemRepo: { findOne: jest.fn().mockResolvedValue(weaponItem), findOneBy: jest.fn() },
      dataSource,
    });

    await service.equipItem(characterId, weaponItem.id);

    expect(manager.delete).toHaveBeenCalledWith(CharacterEquipment, { characterId, slot: "weapon" });
    expect(oldInv.equipped).toBe(false);
  });

  it("refuse si l item n a pas de slot defini", async () => {
    const noSlotItem = makeItem({ id: "ore-1", type: "material", category: "iron_ore", slot: undefined as any });
    const service = makeEquipService({
      itemRepo: { findOne: jest.fn().mockResolvedValue(noSlotItem), findOneBy: jest.fn() },
    });

    await expect(service.equipItem(characterId, noSlotItem.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse si l item n est pas dans l inventaire du personnage", async () => {
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(null)   // no existing CharacterEquipment
        .mockResolvedValueOnce(null),  // Inventory row: not found
      save: jest.fn(),
      delete: jest.fn(),
      create: jest.fn((_entity, value) => value),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({
      itemRepo: { findOne: jest.fn().mockResolvedValue(weaponItem), findOneBy: jest.fn() },
      dataSource,
    });

    await expect(service.equipItem(characterId, weaponItem.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("InventoryService.unequipItem — Equipment Runtime V2", () => {
  const characterId = "char-1";
  const slot = "weapon";
  const itemId = "sword-1";

  it("supprime CharacterEquipment et met Inventory.equipped à false", async () => {
    const equipment = { characterId, itemId, slot } as CharacterEquipment;
    const inv = { id: "inv-1", quantity: 1, equipped: true, item: makeItem({ id: itemId }) } as Inventory;
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(equipment)  // CharacterEquipment found
        .mockResolvedValueOnce(inv),       // Inventory row
      save: jest.fn(async (_entity, value) => value),
      delete: jest.fn(),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource });

    const result = await service.unequipItem(characterId, slot);

    expect(manager.delete).toHaveBeenCalledWith(CharacterEquipment, { characterId, slot });
    expect((result as Inventory).equipped).toBe(false);
  });

  it("refuse si aucune CharacterEquipment n existe pour le slot", async () => {
    const manager = makeManager({
      findOne: jest.fn().mockResolvedValueOnce(null),  // no CharacterEquipment
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource });

    await expect(service.unequipItem(characterId, slot)).rejects.toBeInstanceOf(NotFoundException);
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it("refuse si aucune ligne Inventory ne correspond à l item equipe", async () => {
    const equipment = { characterId, itemId, slot } as CharacterEquipment;
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(equipment)  // CharacterEquipment found
        .mockResolvedValueOnce(null),      // Inventory row: not found
      save: jest.fn(),
      delete: jest.fn(),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource });

    await expect(service.unequipItem(characterId, slot)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("InventoryService.equipItemInstance — Equipment Runtime V2", () => {
  const characterId = "char-1";
  const weaponItem = makeItem({ id: "sword-1", type: "weapon", category: "basic_sword", slot: "weapon" as any });

  function makeInstanceQb(instance: ItemInstance | null) {
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(instance),
    };
    return { createQueryBuilder: jest.fn().mockReturnValue(qb) };
  }

  it("equipe une ItemInstance valide et la transitionne vers EQUIPPED", async () => {
    const instance = makeInstance();
    const manager = makeManager({
      getRepository: jest.fn().mockReturnValue(makeInstanceQb(instance)),
      findOne: jest.fn()
        .mockResolvedValueOnce(weaponItem)  // Item
        .mockResolvedValueOnce(null),       // existing CharacterEquipment: none
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
      create: jest.fn((_, v) => v),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource });

    const result = await service.equipItemInstance(characterId, instance.id);

    expect(manager.save).toHaveBeenCalledWith(
      CharacterEquipment,
      expect.objectContaining({ characterId, itemId: weaponItem.id, slot: "weapon", itemInstanceId: instance.id }),
    );
    expect(result.state).toBe(ItemInstanceState.EQUIPPED);
    expect(result.containerType).toBe(ItemInstanceContainerType.EQUIPMENT);
    expect(result.containerId).toBe(characterId);
  });

  it("refuse si l instance n appartient pas au personnage", async () => {
    const instance = makeInstance({ ownerId: "other-char" });
    const manager = makeManager({
      getRepository: jest.fn().mockReturnValue(makeInstanceQb(instance)),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource });

    await expect(service.equipItemInstance(characterId, instance.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse si l instance n est pas dans INVENTORY", async () => {
    const instance = makeInstance({ containerType: ItemInstanceContainerType.WORLD });
    const manager = makeManager({
      getRepository: jest.fn().mockReturnValue(makeInstanceQb(instance)),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource });

    await expect(service.equipItemInstance(characterId, instance.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse si l instance n est pas AVAILABLE (EQUIPPED)", async () => {
    const instance = makeInstance({ state: ItemInstanceState.EQUIPPED });
    const manager = makeManager({
      getRepository: jest.fn().mockReturnValue(makeInstanceQb(instance)),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource });

    await expect(service.equipItemInstance(characterId, instance.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse si l instance n est pas AVAILABLE (IN_WORLD)", async () => {
    const instance = makeInstance({ state: ItemInstanceState.IN_WORLD });
    const manager = makeManager({
      getRepository: jest.fn().mockReturnValue(makeInstanceQb(instance)),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource });

    await expect(service.equipItemInstance(characterId, instance.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("retransitionne l ancienne instance vers AVAILABLE si le slot etait occupe par une instance", async () => {
    const instance = makeInstance({ id: "new-inst" });
    const oldInstance = makeInstance({ id: "old-inst", state: ItemInstanceState.EQUIPPED, containerType: ItemInstanceContainerType.EQUIPMENT });
    const existingEquip = { characterId, itemId: weaponItem.id, slot: "weapon", itemInstanceId: "old-inst" } as CharacterEquipment;
    const manager = makeManager({
      getRepository: jest.fn().mockReturnValue(makeInstanceQb(instance)),
      findOne: jest.fn()
        .mockResolvedValueOnce(weaponItem)      // Item
        .mockResolvedValueOnce(existingEquip)   // existing CharacterEquipment
        .mockResolvedValueOnce(oldInstance),    // old ItemInstance
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
      create: jest.fn((_, v) => v),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource });

    await service.equipItemInstance(characterId, instance.id);

    expect(oldInstance.state).toBe(ItemInstanceState.AVAILABLE);
    expect(oldInstance.containerType).toBe(ItemInstanceContainerType.INVENTORY);
    expect(manager.delete).toHaveBeenCalledWith(CharacterEquipment, { characterId, slot: "weapon" });
  });
});

describe("InventoryService.unequipItem — chemin INSTANCE", () => {
  const characterId = "char-1";
  const slot = "weapon";

  it("transitionne l instance vers AVAILABLE et retourne l instance", async () => {
    const instance = makeInstance({ state: ItemInstanceState.EQUIPPED, containerType: ItemInstanceContainerType.EQUIPMENT });
    const equipment = { characterId, itemId: "sword-1", slot, itemInstanceId: instance.id } as CharacterEquipment;
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(equipment)   // CharacterEquipment
        .mockResolvedValueOnce(instance),   // ItemInstance
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource });

    const result = await service.unequipItem(characterId, slot);

    expect(manager.delete).toHaveBeenCalledWith(CharacterEquipment, { characterId, slot });
    expect(instance.state).toBe(ItemInstanceState.AVAILABLE);
    expect(instance.containerType).toBe(ItemInstanceContainerType.INVENTORY);
    expect(instance.containerId).toBe(characterId);
    expect(result).toBe(instance);
  });

  it("leve NotFoundException si l instance est introuvable apres suppression du slot", async () => {
    const equipment = { characterId, itemId: "sword-1", slot, itemInstanceId: "ghost-inst" } as CharacterEquipment;
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(equipment)  // CharacterEquipment
        .mockResolvedValueOnce(null),      // ItemInstance: not found
      save: jest.fn(),
      delete: jest.fn(),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource });

    await expect(service.unequipItem(characterId, slot)).rejects.toBeInstanceOf(NotFoundException);
  });
});
