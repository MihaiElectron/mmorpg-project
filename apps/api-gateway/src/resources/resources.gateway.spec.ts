import { ResourcesGateway } from './resources.gateway';
import { ResourcesService } from './resources.service';
import { LootService } from '../world/loot.service';
import { InventoryService } from '../inventory/inventory.service';
import { WsAuthService } from '../common/ws-auth.service';
import { SkillsService } from '../skills/skills.service';
import { ResourceTemplate } from './entities/resource-template.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function makeTemplate(
  type: string,
  skillKey: string | null,
  gatheringXpReward: number,
): Partial<ResourceTemplate> {
  return { type, skillKey, gatheringXpReward, lootPool: null, defaultRemainingLoots: 3, respawnDelayMs: 30_000 };
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

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ResourcesGateway — runGatherCycle XP data-driven', () => {
  let gateway: ResourcesGateway;
  let resourcesMock: Record<string, jest.Mock>;
  let lootMock: Record<string, jest.Mock>;
  let inventoryMock: Record<string, jest.Mock>;
  let skillsMock: Record<string, jest.Mock>;

  function setupGateway() {
    gateway = new ResourcesGateway(
      resourcesMock as unknown as ResourcesService,
      lootMock as unknown as LootService,
      inventoryMock as unknown as InventoryService,
      {} as unknown as WsAuthService,
      skillsMock as unknown as SkillsService,
    );
    const serverEmit = jest.fn();
    const serverMock = { to: jest.fn().mockReturnValue({ emit: serverEmit }), emit: serverEmit };
    (gateway as any).server = serverMock;
  }

  function setupSession(client: any, targetId = 'res-1') {
    (gateway as any).gatherSessions.set(client.id, {
      targetId, timer: null, lastWorldX: client.data.player.worldX, lastWorldY: client.data.player.worldY,
    });
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
    setupGateway();
  });

  it('accorde XP woodcutting/5 pour dead_tree via template', async () => {
    const resource = makeResource('dead_tree');
    const updated = { ...resource, remainingLoots: 2 };
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLoot.mockResolvedValue(updated);
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 'woodcutting', 5));

    const client = makeClient('char-1');
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).toHaveBeenCalledWith('char-1', 'woodcutting', 5);
  });

  it('accorde XP mining/5 pour ore via template', async () => {
    const resource = makeResource('ore');
    const updated = { ...resource, remainingLoots: 5 };
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLoot.mockResolvedValue(updated);
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('ore', 'mining', 5));

    const client = makeClient('char-2');
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).toHaveBeenCalledWith('char-2', 'mining', 5);
  });

  it("n'accorde pas XP si skillKey est null dans le template", async () => {
    const resource = makeResource('dead_tree');
    const updated = { ...resource, remainingLoots: 2 };
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLoot.mockResolvedValue(updated);
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', null, 5));

    const client = makeClient();
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).not.toHaveBeenCalled();
  });

  it("n'accorde pas XP si gatheringXpReward vaut 0 dans le template", async () => {
    const resource = makeResource('dead_tree');
    const updated = { ...resource, remainingLoots: 2 };
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLoot.mockResolvedValue(updated);
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 'woodcutting', 0));

    const client = makeClient();
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).not.toHaveBeenCalled();
  });

  it("n'accorde pas XP si template est null (type sans template)", async () => {
    const resource = makeResource('unknown_type');
    const updated = { ...resource, remainingLoots: 2 };
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLoot.mockResolvedValue(updated);
    resourcesMock.getTemplate.mockResolvedValue(null);

    const client = makeClient();
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).not.toHaveBeenCalled();
  });

  it("n'accorde pas XP si loot.quantity === 0", async () => {
    lootMock.generateLoot.mockReturnValue({ itemId: 'wooden_stick', quantity: 0 });
    const resource = makeResource('dead_tree');
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 'woodcutting', 5));

    const client = makeClient();
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).not.toHaveBeenCalled();
  });

  it("n'accorde pas XP si addItem échoue (récolte annulée avant XP)", async () => {
    inventoryMock.addItem.mockRejectedValue(new Error('DB error'));
    const resource = makeResource('dead_tree');
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 'woodcutting', 5));

    const client = makeClient();
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).not.toHaveBeenCalled();
  });

  it('continue la récolte si addXp lève une exception', async () => {
    skillsMock.addXp.mockRejectedValue(new Error('Skill DB down'));
    const resource = makeResource('dead_tree');
    const updated = { ...resource, remainingLoots: 2 };
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLoot.mockResolvedValue(updated);
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 'woodcutting', 5));

    const client = makeClient();
    setupSession(client);

    // Ne doit pas lever d'exception
    await expect((gateway as any).runGatherCycle(client, 'res-1')).resolves.not.toThrow();
    // Le cycle suivant est relancé malgré l'erreur XP
    expect(client.emit).toHaveBeenCalledWith('resource_loot', expect.any(Object));
  });

  it('utilise le characterId serveur (client.data.player.characterId), pas un champ client', async () => {
    const resource = makeResource('dead_tree');
    const updated = { ...resource, remainingLoots: 2 };
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLoot.mockResolvedValue(updated);
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 'woodcutting', 5));

    const client = makeClient('server-resolved-char');
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).toHaveBeenCalledWith('server-resolved-char', expect.any(String), expect.any(Number));
  });

  it('utilise le skillKey et xpReward du template, pas des constantes hardcodées', async () => {
    const resource = makeResource('dead_tree');
    const updated = { ...resource, remainingLoots: 2 };
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLoot.mockResolvedValue(updated);
    // Template personnalisé — différent des valeurs seed
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 'custom_skill', 42));

    const client = makeClient();
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(skillsMock.addXp).toHaveBeenCalledWith(expect.any(String), 'custom_skill', 42);
  });
});
