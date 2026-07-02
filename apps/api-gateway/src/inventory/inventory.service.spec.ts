import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { Character } from '../characters/entities/character.entity';
import { InventoryService } from './inventory.service';
import { Inventory } from './entities/inventory.entity';
import { Item, ObjectMode } from '../items/entities/item.entity';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from '../item-instances/entities/item-instance.entity';
import { ItemTransferService } from '../item-transfer/item-transfer.service';

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
        { provide: ItemTransferService, useValue: { transfer: jest.fn() } },
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

const DEFAULT_USER_ID = "user-1";
const DEFAULT_CHARACTER = { id: "char-1", userId: DEFAULT_USER_ID } as any;

function makeEquipService(overrides: {
  inventoryRepo?: Record<string, jest.Mock>;
  characterRepo?: Record<string, jest.Mock>;
  itemRepo?: Record<string, jest.Mock>;
  equipmentRepo?: Record<string, jest.Mock>;
  dataSource?: { transaction: jest.Mock };
  itemTransfer?: { transfer: jest.Mock };
} = {}): InventoryService {
  const inventoryRepo = overrides.inventoryRepo ?? { findOne: jest.fn(), save: jest.fn(), create: jest.fn((x) => x), find: jest.fn().mockResolvedValue([]) };
  const characterRepo = overrides.characterRepo ?? { findOneBy: jest.fn().mockResolvedValue(DEFAULT_CHARACTER) };
  const itemRepo = overrides.itemRepo ?? { findOne: jest.fn(), findOneBy: jest.fn() };
  const equipmentRepo = overrides.equipmentRepo ?? { findOne: jest.fn(), save: jest.fn(), delete: jest.fn() };
  const dataSource = overrides.dataSource ?? { transaction: jest.fn() };
  const itemTransfer = overrides.itemTransfer ?? { transfer: jest.fn().mockResolvedValue(makeInstance()) };

  return new InventoryService(
    inventoryRepo as any,
    characterRepo as any,
    itemRepo as any,
    equipmentRepo as any,
    dataSource as any,
    itemTransfer as unknown as ItemTransferService,
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
  find?: jest.Mock;
  save?: jest.Mock;
  update?: jest.Mock;
  delete?: jest.Mock;
  create?: jest.Mock;
  getRepository?: jest.Mock;
}): jest.Mocked<EntityManager> {
  return {
    findOne: calls.findOne ?? jest.fn(),
    find: calls.find ?? jest.fn().mockResolvedValue([]),
    save: calls.save ?? jest.fn(async (_entity, value) => value),
    update: calls.update ?? jest.fn().mockResolvedValue({ affected: 1 }),
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

  it("refuse le chemin legacy pour un item INSTANCE (doit passer par equip-instance)", async () => {
    // Un item INSTANCE via equip legacy creerait un CharacterEquipment sans
    // itemInstanceId et laisserait l ItemInstance non transitionnee (desync).
    const instanceItem = makeItem({ id: "earring-2", type: "accessory", category: "earring", slot: "left-earring" as any, objectMode: ObjectMode.INSTANCE });
    const service = makeEquipService({
      itemRepo: { findOne: jest.fn().mockResolvedValue(instanceItem), findOneBy: jest.fn() },
    });

    await expect(service.equipItem(characterId, instanceItem.id)).rejects.toBeInstanceOf(BadRequestException);
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

  it("equipe une ItemInstance valide et delegue la transition a ItemTransferService", async () => {
    const instance = makeInstance();
    const equippedInstance = makeInstance({
      state: ItemInstanceState.EQUIPPED,
      containerType: ItemInstanceContainerType.EQUIPMENT,
      containerId: characterId,
    });
    const itemTransfer = { transfer: jest.fn().mockResolvedValue(equippedInstance) };
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(instance)   // rawInstance (ItemInstance)
        .mockResolvedValueOnce(weaponItem) // Item
        .mockResolvedValueOnce(null),      // CharacterEquipment: aucun slot existant
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
      create: jest.fn((_, v) => v),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource, itemTransfer });

    const result = await service.equipItemInstance(characterId, instance.id, DEFAULT_USER_ID);

    expect(manager.save).toHaveBeenCalledWith(
      CharacterEquipment,
      expect.objectContaining({ characterId, itemId: weaponItem.id, slot: "weapon", itemInstanceId: instance.id }),
    );
    expect(itemTransfer.transfer).toHaveBeenCalledWith(
      manager, instance.id,
      expect.objectContaining({ requesterId: characterId, transition: { type: "EQUIP", characterId } }),
    );
    expect(result.state).toBe(ItemInstanceState.EQUIPPED);
    expect(result.containerType).toBe(ItemInstanceContainerType.EQUIPMENT);
    expect(result.containerId).toBe(characterId);
  });

  it("refuse si l instance est introuvable (NotFoundException)", async () => {
    const manager = makeManager({
      findOne: jest.fn().mockResolvedValueOnce(null), // rawInstance not found
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource });

    await expect(service.equipItemInstance(characterId, "ghost", DEFAULT_USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuse si l item n a pas de slot defini", async () => {
    const instance = makeInstance();
    const noSlotItem = makeItem({ id: "ore-1", type: "material", category: "iron_ore", slot: undefined as any });
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(instance)   // rawInstance
        .mockResolvedValueOnce(noSlotItem) // Item
        .mockResolvedValueOnce(null),      // CharacterEquipment
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource });

    await expect(service.equipItemInstance(characterId, instance.id, DEFAULT_USER_ID)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse si l instance n appartient pas au personnage (transfer leve BadRequestException)", async () => {
    const instance = makeInstance({ ownerId: "other-char" });
    const itemTransfer = { transfer: jest.fn().mockRejectedValue(new BadRequestException("Instance does not belong to requester")) };
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(instance)
        .mockResolvedValueOnce(weaponItem)
        .mockResolvedValueOnce(null),
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
      create: jest.fn((_, v) => v),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource, itemTransfer });

    await expect(service.equipItemInstance(characterId, instance.id, DEFAULT_USER_ID)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse si l instance n est pas AVAILABLE (transfer leve BadRequestException)", async () => {
    const instance = makeInstance({ state: ItemInstanceState.EQUIPPED });
    const itemTransfer = { transfer: jest.fn().mockRejectedValue(new BadRequestException("Expected state AVAILABLE")) };
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(instance)
        .mockResolvedValueOnce(weaponItem)
        .mockResolvedValueOnce(null),
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
      create: jest.fn((_, v) => v),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource, itemTransfer });

    await expect(service.equipItemInstance(characterId, instance.id, DEFAULT_USER_ID)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse si le characterId n appartient pas au user JWT (ForbiddenException)", async () => {
    const service = makeEquipService({
      characterRepo: { findOneBy: jest.fn().mockResolvedValue({ id: characterId, userId: "other-user" }) },
    });

    await expect(service.equipItemInstance(characterId, "inst-x", "user-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuse si le personnage est introuvable (ForbiddenException)", async () => {
    const service = makeEquipService({
      characterRepo: { findOneBy: jest.fn().mockResolvedValue(null) },
    });

    await expect(service.equipItemInstance(characterId, "inst-x", "user-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("appelle transfer UNEQUIP sur l ancienne instance si le slot etait occupe", async () => {
    const instance = makeInstance({ id: "new-inst" });
    const existingEquip = { characterId, itemId: weaponItem.id, slot: "weapon", itemInstanceId: "old-inst" } as CharacterEquipment;
    const equippedNew = makeInstance({ id: "new-inst", state: ItemInstanceState.EQUIPPED });
    const itemTransfer = { transfer: jest.fn().mockResolvedValue(equippedNew) };
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(instance)       // rawInstance
        .mockResolvedValueOnce(weaponItem)     // Item
        .mockResolvedValueOnce(existingEquip), // CharacterEquipment existant
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
      create: jest.fn((_, v) => v),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource, itemTransfer });

    await service.equipItemInstance(characterId, instance.id, DEFAULT_USER_ID);

    expect(itemTransfer.transfer).toHaveBeenNthCalledWith(
      1, manager, "old-inst",
      expect.objectContaining({ transition: { type: "UNEQUIP", characterId } }),
    );
    expect(itemTransfer.transfer).toHaveBeenNthCalledWith(
      2, manager, "new-inst",
      expect.objectContaining({ transition: { type: "EQUIP", characterId } }),
    );
    expect(manager.delete).toHaveBeenCalledWith(CharacterEquipment, { characterId, slot: "weapon" });
  });

  it("declenche recalculateEquipmentStats apres le transfer EQUIP (base 0 + arme 12 = 12)", async () => {
    const instance = makeInstance();
    const equippedInstance = makeInstance({ state: ItemInstanceState.EQUIPPED, containerType: ItemInstanceContainerType.EQUIPMENT });
    const weaponWithStats = makeItem({ id: "sword-1", type: "weapon", category: "basic_sword", slot: "weapon" as any, attack: 12, defense: 0 } as any);
    const characterBase = { id: characterId, baseAttack: 0, baseDefense: 0 };
    const itemTransfer = { transfer: jest.fn().mockResolvedValue(equippedInstance) };
    const equipRow = { characterId, slot: "weapon", itemInstanceId: instance.id, item: weaponWithStats };
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(instance)       // rawInstance
        .mockResolvedValueOnce(weaponWithStats) // Item
        .mockResolvedValueOnce(null)            // CharacterEquipment slot existant
        .mockResolvedValueOnce(characterBase),  // Character pour recalc
      find: jest.fn().mockResolvedValue([equipRow]),
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
      create: jest.fn((_, v) => v),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource, itemTransfer });

    await service.equipItemInstance(characterId, instance.id, DEFAULT_USER_ID);

    expect(manager.update).toHaveBeenCalledWith(
      Character, { id: characterId }, { attack: 12, defense: 0 },
    );
  });
});

describe("InventoryService.equipItemInstance — auto-slot earring/ring/bracelet", () => {
  const characterId = "char-1";
  const earringItem = makeItem({
    id: "earring-1",
    type: "accessory",
    category: "earring",
    slot: "left-earring" as any,
  });

  it("equipe left-earring quand les deux slots sont libres", async () => {
    const instance = makeInstance({ itemId: earringItem.id });
    const equippedInstance = makeInstance({ id: instance.id, state: ItemInstanceState.EQUIPPED });
    const itemTransfer = { transfer: jest.fn().mockResolvedValue(equippedInstance) };
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(instance)     // rawInstance
        .mockResolvedValueOnce(earringItem)  // Item
        .mockResolvedValueOnce(null)         // resolveEquipSlot: left-earring libre
        .mockResolvedValueOnce(null),        // existing CharacterEquipment (left-earring)
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
      create: jest.fn((_, v) => v),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource, itemTransfer });

    await service.equipItemInstance(characterId, instance.id, DEFAULT_USER_ID);

    expect(manager.save).toHaveBeenCalledWith(
      CharacterEquipment,
      expect.objectContaining({ slot: "left-earring" }),
    );
  });

  it("equipe right-earring si left-earring est occupe", async () => {
    const instance = makeInstance({ itemId: earringItem.id });
    const equippedInstance = makeInstance({ id: instance.id, state: ItemInstanceState.EQUIPPED });
    const existingLeft = { characterId, itemId: earringItem.id, slot: "left-earring", itemInstanceId: "old-left" };
    const itemTransfer = { transfer: jest.fn().mockResolvedValue(equippedInstance) };
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(instance)      // rawInstance
        .mockResolvedValueOnce(earringItem)   // Item
        .mockResolvedValueOnce(existingLeft)  // resolveEquipSlot: left-earring occupe
        .mockResolvedValueOnce(null)          // resolveEquipSlot: right-earring libre
        .mockResolvedValueOnce(null),         // existing CharacterEquipment (right-earring)
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
      create: jest.fn((_, v) => v),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource, itemTransfer });

    await service.equipItemInstance(characterId, instance.id, DEFAULT_USER_ID);

    expect(manager.save).toHaveBeenCalledWith(
      CharacterEquipment,
      expect.objectContaining({ slot: "right-earring" }),
    );
  });

  it("echange left-earring si les deux slots sont occupes (swap pair[0])", async () => {
    const instance = makeInstance({ itemId: earringItem.id });
    const equippedInstance = makeInstance({ id: instance.id, state: ItemInstanceState.EQUIPPED });
    const existingLeft = { characterId, itemId: earringItem.id, slot: "left-earring", itemInstanceId: "old-left" };
    const existingRight = { characterId, itemId: earringItem.id, slot: "right-earring", itemInstanceId: "old-right" };
    const itemTransfer = { transfer: jest.fn().mockResolvedValue(equippedInstance) };
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(instance)       // rawInstance
        .mockResolvedValueOnce(earringItem)    // Item
        .mockResolvedValueOnce(existingLeft)   // resolveEquipSlot: left-earring occupe
        .mockResolvedValueOnce(existingRight)  // resolveEquipSlot: right-earring occupe
        .mockResolvedValueOnce(existingLeft),  // existing CharacterEquipment (left-earring = pair[0])
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
      create: jest.fn((_, v) => v),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource, itemTransfer });

    await service.equipItemInstance(characterId, instance.id, DEFAULT_USER_ID);

    expect(itemTransfer.transfer).toHaveBeenNthCalledWith(
      1, manager, "old-left",
      expect.objectContaining({ transition: { type: "UNEQUIP", characterId } }),
    );
    expect(manager.delete).toHaveBeenCalledWith(CharacterEquipment, { characterId, slot: "left-earring" });
    expect(manager.save).toHaveBeenCalledWith(
      CharacterEquipment,
      expect.objectContaining({ slot: "left-earring" }),
    );
  });
});

describe("InventoryService.unequipItem — chemin INSTANCE", () => {
  const characterId = "char-1";
  const slot = "weapon";

  it("delegue la transition UNEQUIP a ItemTransferService et retourne l instance", async () => {
    const instance = makeInstance({ state: ItemInstanceState.EQUIPPED, containerType: ItemInstanceContainerType.EQUIPMENT });
    const availInstance = makeInstance({ state: ItemInstanceState.AVAILABLE, containerType: ItemInstanceContainerType.INVENTORY, containerId: characterId });
    const equipment = { characterId, itemId: "sword-1", slot, itemInstanceId: instance.id } as CharacterEquipment;
    const itemTransfer = { transfer: jest.fn().mockResolvedValue(availInstance) };
    const manager = makeManager({
      findOne: jest.fn().mockResolvedValueOnce(equipment),
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource, itemTransfer });

    const result = await service.unequipItem(characterId, slot);

    expect(manager.delete).toHaveBeenCalledWith(CharacterEquipment, { characterId, slot });
    expect(itemTransfer.transfer).toHaveBeenCalledWith(
      manager, instance.id,
      expect.objectContaining({ transition: { type: "UNEQUIP", characterId } }),
    );
    expect(result).toBe(availInstance);
  });

  it("recalcule les stats apres UNEQUIP (epee retrait: attaque revient a la base)", async () => {
    const instance = makeInstance({ state: ItemInstanceState.EQUIPPED, containerType: ItemInstanceContainerType.EQUIPMENT });
    const availInstance = makeInstance({ state: ItemInstanceState.AVAILABLE, containerType: ItemInstanceContainerType.INVENTORY });
    const equipment = { characterId, itemId: "sword-1", slot, itemInstanceId: instance.id } as CharacterEquipment;
    const characterBase = { id: characterId, baseAttack: 10, baseDefense: 5 };
    const itemTransfer = { transfer: jest.fn().mockResolvedValue(availInstance) };
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(equipment)      // CharacterEquipment
        .mockResolvedValueOnce(characterBase), // Character pour recalc
      find: jest.fn().mockResolvedValue([]),   // aucun item equipe apres unequip
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource, itemTransfer });

    await service.unequipItem(characterId, slot);

    expect(manager.update).toHaveBeenCalledWith(
      Character, { id: characterId }, { attack: 10, defense: 5 },
    );
  });

  it("leve NotFoundException si l instance est introuvable (transfer leve NotFoundException)", async () => {
    const equipment = { characterId, itemId: "sword-1", slot, itemInstanceId: "ghost-inst" } as CharacterEquipment;
    const itemTransfer = { transfer: jest.fn().mockRejectedValue(new NotFoundException("ItemInstance ghost-inst not found")) };
    const manager = makeManager({
      findOne: jest.fn().mockResolvedValueOnce(equipment),
      save: jest.fn(),
      delete: jest.fn(),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource, itemTransfer });

    await expect(service.unequipItem(characterId, slot)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("InventoryService.equipItemInstance — auto-slot ring et bracelet", () => {
  const characterId = "char-1";

  it("equipe left-ring si les deux slots sont libres", async () => {
    const ringItem = makeItem({ id: "ring-1", type: "accessory", category: "ring", slot: "left-ring" as any });
    const instance = makeInstance({ itemId: ringItem.id });
    const equippedInstance = makeInstance({ id: instance.id, state: ItemInstanceState.EQUIPPED });
    const itemTransfer = { transfer: jest.fn().mockResolvedValue(equippedInstance) };
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(instance)   // rawInstance
        .mockResolvedValueOnce(ringItem)   // Item
        .mockResolvedValueOnce(null)       // resolveEquipSlot: left-ring libre
        .mockResolvedValueOnce(null),      // existing CharacterEquipment
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
      create: jest.fn((_, v) => v),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource, itemTransfer });

    await service.equipItemInstance(characterId, instance.id, DEFAULT_USER_ID);

    expect(manager.save).toHaveBeenCalledWith(
      CharacterEquipment,
      expect.objectContaining({ slot: "left-ring" }),
    );
  });

  it("equipe right-bracelet si left-bracelet est occupe", async () => {
    const braceletItem = makeItem({ id: "brac-1", type: "accessory", category: "bracelet", slot: "left-bracelet" as any });
    const instance = makeInstance({ itemId: braceletItem.id });
    const equippedInstance = makeInstance({ id: instance.id, state: ItemInstanceState.EQUIPPED });
    const existingLeft = { characterId, itemId: braceletItem.id, slot: "left-bracelet", itemInstanceId: "old-brac" };
    const itemTransfer = { transfer: jest.fn().mockResolvedValue(equippedInstance) };
    const manager = makeManager({
      findOne: jest.fn()
        .mockResolvedValueOnce(instance)      // rawInstance
        .mockResolvedValueOnce(braceletItem)  // Item
        .mockResolvedValueOnce(existingLeft)  // resolveEquipSlot: left occupe
        .mockResolvedValueOnce(null)          // resolveEquipSlot: right libre
        .mockResolvedValueOnce(null),         // existing CharacterEquipment (right-bracelet)
      save: jest.fn(async (_, v) => v),
      delete: jest.fn(),
      create: jest.fn((_, v) => v),
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };
    const service = makeEquipService({ dataSource, itemTransfer });

    await service.equipItemInstance(characterId, instance.id, DEFAULT_USER_ID);

    expect(manager.save).toHaveBeenCalledWith(
      CharacterEquipment,
      expect.objectContaining({ slot: "right-bracelet" }),
    );
  });
});
