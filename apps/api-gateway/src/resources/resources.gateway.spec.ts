import { resolveGatheringSkill } from './resources.gateway';
import { ResourcesGateway } from './resources.gateway';
import { ResourcesService } from './resources.service';
import { LootService } from '../world/loot.service';
import { InventoryService } from '../inventory/inventory.service';
import { WsAuthService } from '../common/ws-auth.service';
import { SkillsService } from '../skills/skills.service';

// ─── resolveGatheringSkill ────────────────────────────────────────────────────

describe('resolveGatheringSkill', () => {
  it('retourne woodcutting pour dead_tree', () => {
    expect(resolveGatheringSkill('dead_tree')).toBe('woodcutting');
  });

  it('retourne mining pour ore', () => {
    expect(resolveGatheringSkill('ore')).toBe('mining');
  });

  it('retourne null pour un type inconnu', () => {
    expect(resolveGatheringSkill('unknown_type')).toBeNull();
  });
});

// ─── ResourcesGateway — runGatherCycle XP ────────────────────────────────────

describe('ResourcesGateway — runGatherCycle XP', () => {
  let gateway: ResourcesGateway;
  let resourcesMock: Record<string, jest.Mock>;
  let lootMock: Record<string, jest.Mock>;
  let inventoryMock: Record<string, jest.Mock>;
  let skillsMock: Record<string, jest.Mock>;

  function makeResource(type: string, remainingLoots = 3) {
    return {
      id: 'res-1',
      type,
      state: 'alive',
      remainingLoots,
      x: 100,
      y: 100,
      worldX: 1024,
      worldY: 1024,
      mapId: 1,
    };
  }

  function makeInventoryEntry() {
    return {
      quantity: 1,
      item: { id: 'item-uuid', name: 'Wooden Stick', image: null },
    };
  }

  function makeClient(characterId = 'char-1', x = 100, y = 100): any {
    return {
      id: 'socket-1',
      connected: true,
      emit: jest.fn(),
      data: {
        player: { characterId, x, y, worldX: 1024, worldY: 1024, mapId: 1 },
      },
    };
  }

  beforeEach(() => {
    resourcesMock = {
      findOne: jest.fn(),
      getTemplate: jest.fn().mockResolvedValue(null),
      consumeLoot: jest.fn(),
      scheduleRespawn: jest.fn().mockResolvedValue(undefined),
      buildResourceBroadcast: jest.fn().mockReturnValue({}),
      setServer: jest.fn(),
    };
    lootMock = {
      generateLoot: jest.fn().mockReturnValue({ itemId: 'wooden_stick', quantity: 1 }),
    };
    inventoryMock = {
      addItem: jest.fn().mockResolvedValue(makeInventoryEntry()),
    };
    skillsMock = {
      addXp: jest.fn().mockResolvedValue({ level: 1, xp: 5 }),
    };

    gateway = new ResourcesGateway(
      resourcesMock as unknown as ResourcesService,
      lootMock as unknown as LootService,
      inventoryMock as unknown as InventoryService,
      {} as unknown as WsAuthService,
      skillsMock as unknown as SkillsService,
    );

    // Simuler server WebSocket
    (gateway as any).server = { emit: jest.fn() };
  });

  it('accorde XP woodcutting après loot dead_tree réussi', async () => {
    const resource = makeResource('dead_tree');
    const updated = { ...resource, remainingLoots: 2 };
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLoot.mockResolvedValue(updated);

    const client = makeClient('char-1');
    (gateway as any).gatherSessions.set(client.id, {
      targetId: 'res-1', timer: null, lastX: 100, lastY: 100,
    });

    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).toHaveBeenCalledWith('char-1', 'woodcutting', 5);
  });

  it('accorde XP mining après loot ore réussi', async () => {
    const resource = makeResource('ore');
    const updated = { ...resource, remainingLoots: 5 };
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLoot.mockResolvedValue(updated);

    const client = makeClient('char-2');
    (gateway as any).gatherSessions.set(client.id, {
      targetId: 'res-1', timer: null, lastX: 100, lastY: 100,
    });

    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).toHaveBeenCalledWith('char-2', 'mining', 5);
  });

  it("n'accorde pas XP si loot.quantity === 0", async () => {
    lootMock.generateLoot.mockReturnValue({ itemId: 'wooden_stick', quantity: 0 });
    const resource = makeResource('dead_tree');
    resourcesMock.findOne.mockResolvedValue(resource);

    const client = makeClient();
    (gateway as any).gatherSessions.set(client.id, {
      targetId: 'res-1', timer: null, lastX: 100, lastY: 100,
    });

    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).not.toHaveBeenCalled();
  });

  it("n'accorde pas XP si addItem échoue", async () => {
    inventoryMock.addItem.mockRejectedValue(new Error('DB error'));
    const resource = makeResource('dead_tree');
    resourcesMock.findOne.mockResolvedValue(resource);

    const client = makeClient();
    (gateway as any).gatherSessions.set(client.id, {
      targetId: 'res-1', timer: null, lastX: 100, lastY: 100,
    });

    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).not.toHaveBeenCalled();
  });

  it("n'accorde pas XP pour un type de ressource sans mapping", async () => {
    const resource = makeResource('unknown_resource');
    const updated = { ...resource, remainingLoots: 2 };
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLoot.mockResolvedValue(updated);

    const client = makeClient();
    (gateway as any).gatherSessions.set(client.id, {
      targetId: 'res-1', timer: null, lastX: 100, lastY: 100,
    });

    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).not.toHaveBeenCalled();
  });

  it('utilise le characterId serveur (client.data.player), pas un champ client', async () => {
    const resource = makeResource('dead_tree');
    const updated = { ...resource, remainingLoots: 2 };
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLoot.mockResolvedValue(updated);

    const client = makeClient('server-char-id');
    (gateway as any).gatherSessions.set(client.id, {
      targetId: 'res-1', timer: null, lastX: 100, lastY: 100,
    });

    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).toHaveBeenCalledWith('server-char-id', expect.any(String), expect.any(Number));
  });
});
