import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Character } from '../characters/entities/character.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { Item } from '../items/entities/item.entity';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from '../item-instances/entities/item-instance.entity';
import { InventoryEntryResolverService } from '../inventory/resolution/inventory-entry-resolver.service';
import { WorldItem, WorldItemState } from './entities/world-item.entity';
import { WORLD_ITEM_PICKUP_RANGE_WU, WorldItemService } from './world-item.service';

function makeRepo<T>() {
  return {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    find: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>;
}

function makeServer() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { to, emit };
}

const item = {
  id: 'item-1',
  name: 'Baton de bois',
  type: 'material',
  category: 'wooden_stick',
  image: '/assets/images/items/wooden_stick.png',
} as Item;

function makeInstance(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return {
    id: 'instance-1',
    itemId: item.id,
    ownerType: 'character',
    ownerId: 'char-1',
    state: ItemInstanceState.AVAILABLE,
    containerType: ItemInstanceContainerType.INVENTORY,
    containerId: 'char-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ItemInstance;
}

describe('WorldItemService', () => {
  let service: WorldItemService;
  let worldItems: jest.Mocked<Repository<WorldItem>>;
  let items: jest.Mocked<Repository<Item>>;
  let characters: jest.Mocked<Repository<Character>>;
  let dataSource: { transaction: jest.Mock };
  let resolver: { resolveWithinTransaction: jest.Mock };

  beforeEach(() => {
    worldItems = makeRepo<WorldItem>();
    items = makeRepo<Item>();
    characters = makeRepo<Character>();
    dataSource = {
      transaction: jest.fn(async (fn: (manager: EntityManager) => unknown) => fn({} as EntityManager)),
    };
    resolver = { resolveWithinTransaction: jest.fn() };

    service = new WorldItemService(
      worldItems,
      items,
      characters,
      dataSource as unknown as DataSource,
      resolver as unknown as InventoryEntryResolverService,
    );
  });

  it('spawn un WorldItem et diffuse dans la room map:N', async () => {
    const server = makeServer();
    service.setServer(server as any);
    items.findOne.mockResolvedValue(item);
    worldItems.save.mockImplementation(async (worldItem) => ({
      ...worldItem,
      id: 'world-item-1',
      createdAt: new Date('2026-06-27T10:00:00Z'),
    }) as WorldItem);

    const saved = await service.spawnItem({
      itemId: item.id,
      quantity: 3,
      worldX: 1024,
      worldY: 2048,
      mapId: 1,
    });

    expect(saved.state).toBe(WorldItemState.SPAWNED);
    expect(worldItems.save).toHaveBeenCalledWith(expect.objectContaining({
      itemId: item.id,
      quantity: 3,
      mapId: 1,
    }));
    expect(server.to).toHaveBeenCalledWith('map:1');
    expect(server.emit).toHaveBeenCalledWith(
      'world_item_spawn',
      expect.objectContaining({ id: 'world-item-1', itemId: item.id, quantity: 3 }),
    );
  });

  it('refuse un spawn avec quantité invalide', async () => {
    await expect(service.spawnItem({
      itemId: item.id,
      quantity: 0,
      worldX: 0,
      worldY: 0,
      mapId: 1,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('pickup atomique: verrouille, ajoute inventaire et retire du monde', async () => {
    const server = makeServer();
    service.setServer(server as any);
    const character = { id: 'char-1' } as Character;
    const existingInventory = {
      id: 'inv-1',
      character,
      item,
      quantity: 2,
      equipped: false,
    } as Inventory;
    const worldItem = {
      id: 'world-item-1',
      itemId: item.id,
      item,
      quantity: 5,
      worldX: 1000,
      worldY: 1000,
      mapId: 1,
      state: WorldItemState.SPAWNED,
      ownerCharacterId: null,
      expiresAt: null,
      createdAt: new Date(),
    } as WorldItem;
    const qb = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(worldItem),
    };
    const manager = {
      getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) })),
      findOne: jest.fn()
        .mockResolvedValueOnce(character)
        .mockResolvedValueOnce(existingInventory),
      save: jest.fn(async (_entity, value) => value),
      create: jest.fn((_entity, value) => value),
    };
    dataSource.transaction.mockImplementation(async (fn) => fn(manager as unknown as EntityManager));

    const inventory = await service.pickupItem({
      worldItemId: worldItem.id,
      characterId: character.id,
      worldX: 1100,
      worldY: 1100,
      mapId: 1,
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(inventory.quantity).toBe(7);
    expect(worldItem.state).toBe(WorldItemState.PICKED);
    expect(server.to).toHaveBeenCalledWith('map:1');
    expect(server.emit).toHaveBeenCalledWith('world_item_remove', {
      id: worldItem.id,
      mapId: 1,
      state: WorldItemState.PICKED,
    });
  });

  it("dropInventoryItem STACK — decremente inventaire et spawn un WorldItem dans la meme transaction", async () => {
    const server = makeServer();
    service.setServer(server as any);
    const character = { id: "char-1" } as Character;
    const inventory = {
      id: "inv-1",
      character,
      item,
      quantity: 4,
      equipped: false,
    } as Inventory;
    const worldItem = {
      id: "world-item-1",
      itemId: item.id,
      item,
      quantity: 1,
      worldX: 1200,
      worldY: 1300,
      mapId: 1,
      state: WorldItemState.SPAWNED,
      ownerCharacterId: character.id,
      expiresAt: null,
      createdAt: new Date(),
    } as WorldItem;
    const qb = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(inventory),
    };
    const manager = {
      getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) })),
      save: jest.fn(async (entity, value) => entity === WorldItem ? worldItem : value),
      remove: jest.fn(),
      create: jest.fn((_entity, value) => value),
    };
    resolver.resolveWithinTransaction.mockResolvedValue({ type: "STACK", inventory, itemId: item.id });
    dataSource.transaction.mockImplementation(async (fn) => fn(manager as unknown as EntityManager));

    const result = await service.dropInventoryItem({
      characterId: character.id,
      inventoryEntryId: "inv-1",
      quantity: 1,
      worldX: 1200,
      worldY: 1300,
      mapId: 1,
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(qb.setLock).toHaveBeenCalledWith("pessimistic_write");
    expect(inventory.quantity).toBe(3);
    expect(manager.save).toHaveBeenCalledWith(Inventory, inventory);
    expect(manager.save).toHaveBeenCalledWith(WorldItem, expect.objectContaining({
      itemId: item.id,
      quantity: 1,
      ownerCharacterId: character.id,
      state: WorldItemState.SPAWNED,
    }));
    expect(result.inventoryQuantity).toBe(3);
    expect(server.to).toHaveBeenCalledWith("map:1");
    expect(server.emit).toHaveBeenCalledWith(
      "world_item_spawn",
      expect.objectContaining({ id: "world-item-1", itemId: item.id, quantity: 1 }),
    );
  });

  it("dropInventoryItem STACK — supprime la pile inventaire quand la dernière unité est déposée", async () => {
    const inventory = {
      id: "inv-1",
      item,
      quantity: 1,
      equipped: false,
    } as Inventory;
    const qb = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(inventory),
    };
    const manager = {
      getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) })),
      save: jest.fn(async (_entity, value) => ({ ...value, id: "world-item-1", createdAt: new Date() })),
      remove: jest.fn(),
      create: jest.fn((_entity, value) => value),
    };
    resolver.resolveWithinTransaction.mockResolvedValue({ type: "STACK", inventory, itemId: item.id });
    dataSource.transaction.mockImplementation(async (fn) => fn(manager as unknown as EntityManager));

    const result = await service.dropInventoryItem({
      characterId: "char-1",
      inventoryEntryId: "inv-1",
      quantity: 1,
      worldX: 0,
      worldY: 0,
      mapId: 1,
    });

    expect(manager.remove).toHaveBeenCalledWith(Inventory, inventory);
    expect(result.inventoryQuantity).toBe(0);
  });

  it("dropInventoryItem refuse une quantite nulle ou negative", async () => {
    await expect(service.dropInventoryItem({
      characterId: "char-1",
      inventoryEntryId: "inv-1",
      quantity: 0,
      worldX: 0,
      worldY: 0,
      mapId: 1,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // INSTANCE path
  // -------------------------------------------------------------------------

  function makeInstanceDropManager(
    instanceResult: ItemInstance | null,
    itemResult: Item | null = item,
    worldItemId = "world-item-inst-1",
  ) {
    const instanceQb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(instanceResult),
    };
    return {
      getRepository: jest.fn().mockReturnValue({ createQueryBuilder: jest.fn(() => instanceQb) }),
      findOne: jest.fn().mockResolvedValue(itemResult),
      save: jest.fn(async (entity, value) => {
        if (entity === WorldItem) return { ...value, id: worldItemId, createdAt: new Date() };
        return value;
      }),
      create: jest.fn((_entity, value) => value),
    };
  }

  it("dropInventoryItem INSTANCE — crée un WorldItem avec itemInstanceId", async () => {
    const instance = makeInstance();
    const manager = makeInstanceDropManager(instance);
    resolver.resolveWithinTransaction.mockResolvedValue({ type: "INSTANCE", instance, itemId: item.id });
    dataSource.transaction.mockImplementation(async (fn) => fn(manager as unknown as EntityManager));

    const result = await service.dropInventoryItem({
      characterId: "char-1",
      inventoryEntryId: "instance-1",
      quantity: 1,
      worldX: 512,
      worldY: 1024,
      mapId: 1,
    });

    expect(manager.create).toHaveBeenCalledWith(WorldItem, expect.objectContaining({
      itemInstanceId: instance.id,
      quantity: 1,
      ownerCharacterId: "char-1",
      state: WorldItemState.SPAWNED,
    }));
    expect(result.worldItem.itemInstanceId).toBe(instance.id);
  });

  it("dropInventoryItem INSTANCE — transitionne instance vers IN_WORLD avec containerId = worldItem.id", async () => {
    const instance = makeInstance();
    const manager = makeInstanceDropManager(instance, item, "world-item-inst-1");
    resolver.resolveWithinTransaction.mockResolvedValue({ type: "INSTANCE", instance, itemId: item.id });
    dataSource.transaction.mockImplementation(async (fn) => fn(manager as unknown as EntityManager));

    await service.dropInventoryItem({
      characterId: "char-1",
      inventoryEntryId: "instance-1",
      quantity: 1,
      worldX: 0,
      worldY: 0,
      mapId: 1,
    });

    expect(instance.state).toBe(ItemInstanceState.IN_WORLD);
    expect(instance.containerType).toBe(ItemInstanceContainerType.WORLD);
    expect(instance.containerId).toBe("world-item-inst-1");
    expect(manager.save).toHaveBeenCalledWith(ItemInstance, instance);
  });

  it("dropInventoryItem INSTANCE — retourne inventoryQuantity = 0", async () => {
    const instance = makeInstance();
    const manager = makeInstanceDropManager(instance);
    resolver.resolveWithinTransaction.mockResolvedValue({ type: "INSTANCE", instance, itemId: item.id });
    dataSource.transaction.mockImplementation(async (fn) => fn(manager as unknown as EntityManager));

    const result = await service.dropInventoryItem({
      characterId: "char-1",
      inventoryEntryId: "instance-1",
      quantity: 1,
      worldX: 0,
      worldY: 0,
      mapId: 1,
    });

    expect(result.inventoryQuantity).toBe(0);
  });

  it("dropInventoryItem INSTANCE — refuse quantity > 1", async () => {
    const instance = makeInstance();
    resolver.resolveWithinTransaction.mockResolvedValue({ type: "INSTANCE", instance, itemId: item.id });
    dataSource.transaction.mockImplementation(async (fn) => fn({ getRepository: jest.fn(), findOne: jest.fn(), save: jest.fn(), create: jest.fn() } as unknown as EntityManager));

    await expect(service.dropInventoryItem({
      characterId: "char-1",
      inventoryEntryId: "instance-1",
      quantity: 2,
      worldX: 0,
      worldY: 0,
      mapId: 1,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("dropInventoryItem INSTANCE — refuse si findInstanceForUpdate retourne null (propriétaire incorrect ou hors INVENTORY)", async () => {
    const instance = makeInstance({ ownerId: "other-char" });
    const manager = makeInstanceDropManager(null); // lock query returns null
    resolver.resolveWithinTransaction.mockResolvedValue({ type: "INSTANCE", instance, itemId: item.id });
    dataSource.transaction.mockImplementation(async (fn) => fn(manager as unknown as EntityManager));

    await expect(service.dropInventoryItem({
      characterId: "char-1",
      inventoryEntryId: "instance-1",
      quantity: 1,
      worldX: 0,
      worldY: 0,
      mapId: 1,
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("dropInventoryItem INSTANCE — refuse une instance EQUIPPED", async () => {
    const instance = makeInstance({ state: ItemInstanceState.EQUIPPED });
    const manager = makeInstanceDropManager(instance);
    resolver.resolveWithinTransaction.mockResolvedValue({ type: "INSTANCE", instance, itemId: item.id });
    dataSource.transaction.mockImplementation(async (fn) => fn(manager as unknown as EntityManager));

    await expect(service.dropInventoryItem({
      characterId: "char-1",
      inventoryEntryId: "instance-1",
      quantity: 1,
      worldX: 0,
      worldY: 0,
      mapId: 1,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("dropInventoryItem INSTANCE — refuse une instance déjà IN_WORLD", async () => {
    const instance = makeInstance({ state: ItemInstanceState.IN_WORLD });
    const manager = makeInstanceDropManager(instance);
    resolver.resolveWithinTransaction.mockResolvedValue({ type: "INSTANCE", instance, itemId: item.id });
    dataSource.transaction.mockImplementation(async (fn) => fn(manager as unknown as EntityManager));

    await expect(service.dropInventoryItem({
      characterId: "char-1",
      inventoryEntryId: "instance-1",
      quantity: 1,
      worldX: 0,
      worldY: 0,
      mapId: 1,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("dropInventoryItem INSTANCE — rollback si save WorldItem échoue", async () => {
    const instance = makeInstance();
    const instanceQb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(instance),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue({ createQueryBuilder: jest.fn(() => instanceQb) }),
      findOne: jest.fn().mockResolvedValue(item),
      save: jest.fn().mockRejectedValue(new Error("DB failure")),
      create: jest.fn((_entity, value) => value),
    };
    resolver.resolveWithinTransaction.mockResolvedValue({ type: "INSTANCE", instance, itemId: item.id });
    dataSource.transaction.mockImplementation(async (fn) => fn(manager as unknown as EntityManager));

    await expect(service.dropInventoryItem({
      characterId: "char-1",
      inventoryEntryId: "instance-1",
      quantity: 1,
      worldX: 0,
      worldY: 0,
      mapId: 1,
    })).rejects.toThrow("DB failure");
    // instance.state reste AVAILABLE : save WorldItem a echoue avant la transition
    expect(instance.state).toBe(ItemInstanceState.AVAILABLE);
  });

  it("refuse le pickup si ownerCharacterId ne correspond pas au personnage", async () => {
    const ownedItem = {
      id: "world-item-owned",
      itemId: item.id,
      item,
      quantity: 1,
      worldX: 0,
      worldY: 0,
      mapId: 1,
      state: WorldItemState.SPAWNED,
      ownerCharacterId: "owner-char",
      expiresAt: null,
      createdAt: new Date(),
    } as WorldItem;
    const qb = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(ownedItem),
    };
    const manager = {
      getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) })),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    dataSource.transaction.mockImplementation(async (fn) => fn(manager as unknown as EntityManager));

    await expect(service.pickupItem({
      worldItemId: ownedItem.id,
      characterId: "other-char",
      worldX: 0,
      worldY: 0,
      mapId: 1,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it("refuse le pickup concurrent quand le WorldItem est deja ramasse", async () => {
    const qb = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const manager = {
      getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) })),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    dataSource.transaction.mockImplementation(async (fn) => fn(manager as unknown as EntityManager));

    await expect(service.pickupItem({
      worldItemId: "world-item-gone",
      characterId: "char-1",
      worldX: 0,
      worldY: 0,
      mapId: 1,
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it('refuse le pickup hors portée sans ajouter à l’inventaire', async () => {
    const worldItem = {
      id: 'world-item-1',
      itemId: item.id,
      item,
      quantity: 1,
      worldX: 0,
      worldY: 0,
      mapId: 1,
      state: WorldItemState.SPAWNED,
      ownerCharacterId: null,
      expiresAt: null,
      createdAt: new Date(),
    } as WorldItem;
    const qb = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(worldItem),
    };
    const manager = {
      getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) })),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    dataSource.transaction.mockImplementation(async (fn) => fn(manager as unknown as EntityManager));

    await expect(service.pickupItem({
      worldItemId: worldItem.id,
      characterId: 'char-1',
      worldX: WORLD_ITEM_PICKUP_RANGE_WU + 1,
      worldY: 0,
      mapId: 1,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it('expire les WorldItems spawned et diffuse leur retrait', async () => {
    const server = makeServer();
    service.setServer(server as any);
    const expired = {
      id: 'world-item-1',
      itemId: item.id,
      item,
      quantity: 1,
      worldX: 0,
      worldY: 0,
      mapId: 2,
      state: WorldItemState.SPAWNED,
      ownerCharacterId: null,
      expiresAt: new Date('2026-06-27T10:00:00Z'),
      createdAt: new Date(),
    } as WorldItem;
    worldItems.find.mockResolvedValue([expired]);
    (worldItems.save as jest.Mock).mockImplementation(async (value) => value as WorldItem[]);

    const saved = await service.removeExpiredItems(new Date('2026-06-27T10:01:00Z'));

    expect(saved[0].state).toBe(WorldItemState.EXPIRED);
    expect(server.to).toHaveBeenCalledWith('map:2');
    expect(server.emit).toHaveBeenCalledWith('world_item_remove', {
      id: expired.id,
      mapId: 2,
      state: WorldItemState.EXPIRED,
    });
  });

  it('signale un item absent au spawn', async () => {
    items.findOne.mockResolvedValue(null);

    await expect(service.spawnItem({
      itemId: 'missing',
      quantity: 1,
      worldX: 0,
      worldY: 0,
      mapId: 1,
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("toDto inclut itemInstanceId null pour un WorldItem stack", () => {
    const worldItem = {
      id: "wi-1",
      itemId: item.id,
      item,
      quantity: 3,
      itemInstanceId: null,
      worldX: 512,
      worldY: 1024,
      mapId: 1,
      ownerCharacterId: null,
      createdAt: new Date("2026-06-27T10:00:00Z"),
      expiresAt: null,
      state: WorldItemState.SPAWNED,
    } as WorldItem;

    const dto = service.toDto(worldItem);

    expect(dto.itemInstanceId).toBeNull();
    expect(dto.itemId).toBe(item.id);
    expect(dto.quantity).toBe(3);
  });

  it("spawnItem persiste itemInstanceId null quand non fourni", async () => {
    items.findOne.mockResolvedValue(item);
    worldItems.save.mockImplementation(async (wi) => ({ ...wi, id: "wi-2", createdAt: new Date() }) as WorldItem);

    await service.spawnItem({
      itemId: item.id,
      quantity: 1,
      worldX: 0,
      worldY: 0,
      mapId: 1,
    });

    expect(worldItems.create).toHaveBeenCalledWith(
      expect.objectContaining({ itemInstanceId: null }),
    );
  });
});
