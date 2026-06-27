import { DEFAULT_MAP_ID } from '../common/world-coordinates';
import { WorldItemService } from './world-item.service';
import { WorldItemsGateway } from './world-items.gateway';

describe('WorldItemsGateway', () => {
  it('branche le serveur socket sur le service pour les broadcasts spawn/remove', () => {
    const service = { setServer: jest.fn() } as unknown as WorldItemService;
    const gateway = new WorldItemsGateway(service, { authenticate: jest.fn() } as any);
    const server = {};

    gateway.afterInit(server as any);

    expect(service.setServer).toHaveBeenCalledWith(server);
  });

  it('émet les WorldItems de la map demandée', async () => {
    const dto = { id: 'world-item-1', mapId: 3 };
    const service = {
      findSpawnedByMap: jest.fn().mockResolvedValue([dto]),
      toDto: jest.fn((item) => item),
    } as unknown as WorldItemService;
    const gateway = new WorldItemsGateway(service, { authenticate: jest.fn() } as any);
    const client = {
      data: { player: { mapId: 1 } },
      emit: jest.fn(),
    };

    await gateway.onGetWorldItems(client as any, { mapId: 3 });

    expect(service.findSpawnedByMap).toHaveBeenCalledWith(3);
    expect(client.emit).toHaveBeenCalledWith('world_items', [dto]);
  });

  it('drop_inventory_item décrémente via service, émet inventory_update et retourne un ack', async () => {
    const item = {
      id: 'item-1',
      name: 'Baton',
      type: 'material',
      category: 'wooden_stick',
      image: '/assets/images/items/wooden_stick.png',
    };
    const worldItem = {
      id: 'world-item-1',
      itemId: item.id,
      item,
      quantity: 1,
      worldX: 120,
      worldY: 240,
      mapId: 5,
      ownerCharacterId: 'char-1',
      createdAt: new Date(),
      expiresAt: null,
      state: 'spawned',
    };
    const service = {
      dropInventoryItem: jest.fn().mockResolvedValue({ inventoryQuantity: 2, worldItem }),
      toDto: jest.fn((value) => value),
    } as unknown as WorldItemService;
    const gateway = new WorldItemsGateway(service, { authenticate: jest.fn() } as any);
    const client = {
      data: { player: { characterId: 'char-1', mapId: 5 } },
      emit: jest.fn(),
    };

    const ack = await gateway.onDropInventoryItem(client as any, {
      itemId: item.id,
      quantity: 1,
      worldX: 120,
      worldY: 240,
    });

    expect(service.dropInventoryItem).toHaveBeenCalledWith({
      characterId: 'char-1',
      itemId: item.id,
      quantity: 1,
      worldX: 120,
      worldY: 240,
      mapId: 5,
    });
    expect(client.emit).toHaveBeenCalledWith('inventory_update', {
      itemId: item.id,
      total: 2,
      item,
    });
    expect(ack).toEqual({
      success: true,
      worldItem,
      inventoryQuantity: 2,
    });
  });

  it('drop_inventory_item refuse une socket sans joueur joiné', async () => {
    const service = {
      dropInventoryItem: jest.fn(),
      toDto: jest.fn((value) => value),
    } as unknown as WorldItemService;
    const gateway = new WorldItemsGateway(service, { authenticate: jest.fn() } as any);

    const ack = await gateway.onDropInventoryItem({ data: {}, emit: jest.fn() } as any, {
      itemId: 'item-1',
      quantity: 1,
      worldX: 0,
      worldY: 0,
    });

    expect(ack.success).toBe(false);
    expect(service.dropInventoryItem).not.toHaveBeenCalled();
  });

  it('utilise la map du joueur puis DEFAULT_MAP_ID en fallback', async () => {
    const service = {
      findSpawnedByMap: jest.fn().mockResolvedValue([]),
      toDto: jest.fn((item) => item),
    } as unknown as WorldItemService;
    const gateway = new WorldItemsGateway(service, { authenticate: jest.fn() } as any);

    await gateway.onGetWorldItems({ data: { player: { mapId: 2 } }, emit: jest.fn() } as any, {});
    await gateway.onGetWorldItems({ data: {}, emit: jest.fn() } as any, {});

    expect(service.findSpawnedByMap).toHaveBeenNthCalledWith(1, 2);
    expect(service.findSpawnedByMap).toHaveBeenNthCalledWith(2, DEFAULT_MAP_ID);
  });
});
