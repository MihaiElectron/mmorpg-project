import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Character } from '../characters/entities/character.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { Item } from '../items/entities/item.entity';
import { WorldItem, WorldItemState } from './entities/world-item.entity';
import { WORLD_ITEM_PICKUP_RANGE_WU, WorldItemService } from './world-item.service';

function makeRepo<T>() {
  return {
    findOneBy: jest.fn(),
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

describe('WorldItemService', () => {
  let service: WorldItemService;
  let worldItems: jest.Mocked<Repository<WorldItem>>;
  let items: jest.Mocked<Repository<Item>>;
  let characters: jest.Mocked<Repository<Character>>;
  let dataSource: { transaction: jest.Mock };

  const item = {
    id: 'item-1',
    name: 'Baton de bois',
    type: 'material',
    category: 'wooden_stick',
    image: '/assets/images/items/wooden_stick.png',
  } as Item;

  beforeEach(() => {
    worldItems = makeRepo<WorldItem>();
    items = makeRepo<Item>();
    characters = makeRepo<Character>();
    dataSource = {
      transaction: jest.fn(async (fn: (manager: EntityManager) => unknown) => fn({} as EntityManager)),
    };

    service = new WorldItemService(
      worldItems,
      items,
      characters,
      dataSource as unknown as DataSource,
    );
  });

  it('spawn un WorldItem et diffuse dans la room map:N', async () => {
    const server = makeServer();
    service.setServer(server as any);
    items.findOneBy.mockResolvedValue(item);
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
      leftJoinAndSelect: jest.fn().mockReturnThis(),
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
      leftJoinAndSelect: jest.fn().mockReturnThis(),
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
    items.findOneBy.mockResolvedValue(null);

    await expect(service.spawnItem({
      itemId: 'missing',
      quantity: 1,
      worldX: 0,
      worldY: 0,
      mapId: 1,
    })).rejects.toBeInstanceOf(NotFoundException);
  });
});
