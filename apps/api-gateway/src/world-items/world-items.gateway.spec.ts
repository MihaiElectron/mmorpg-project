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
