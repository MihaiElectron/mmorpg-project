import { ResourcesGateway } from './resources.gateway';
import { ResourcesService } from './resources.service';
import { LootService } from '../world/loot.service';
import { WsAuthService } from '../common/ws-auth.service';
import { MasteriesService } from '../masteries/masteries.service';
import { ItemMaterializationService } from '../item-materialization/item-materialization.service';
import { ProgressionService } from '../progression/progression.service';
import { ResourceTemplate } from './entities/resource-template.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeResource(type: string, remainingLoots = 3) {
  return {
    id: 'res-1',
    type,
    state: 'alive',
    remainingLoots,
    worldX: 1024,
    worldY: 1024,
    mapId: 1,
  };
}

/**
 * Template Phase 2c : plus de masteryKey/gatheringXpReward lus par le runtime.
 * gatherCharacterXpReward pilote la Character XP. On garde les champs legacy
 * dans le stub pour prouver qu'ils sont IGNORÉS.
 */
function makeTemplate(type: string, gatherCharacterXpReward = 0, gatheringDifficulty = 0): Partial<ResourceTemplate> {
  return {
    type,
    lootPool: [{ itemId: 'wooden_stick', minQty: 1, maxQty: 2, probability: 1 }],
    defaultRemainingLoots: 3,
    respawnDelayMs: 30_000,
    gatherCharacterXpReward,
    gatheringDifficulty,
    // legacy — ne doit jamais être lu par la récolte
    masteryKey: 'legacy_should_be_ignored',
    gatheringXpReward: 999,
  } as Partial<ResourceTemplate>;
}

function makeInventoryEntry() {
  return {
    id: 'inv-row-1',
    quantity: 1,
    item: {
      id: 'item-uuid',
      category: 'wooden_stick',
      name: 'Bâton de bois',
      image: '/assets/images/items/wooden_stick.png',
    },
  };
}

function makeClient(characterId = 'char-1'): any {
  return {
    id: 'socket-1',
    connected: true,
    emit: jest.fn(),
    data: {
      player: { characterId, worldX: 1024, worldY: 1024, mapId: 1 },
    },
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ResourcesGateway — runGatherCycle (Phase 2c : Character XP + Mastery XP runtime)', () => {
  let gateway: ResourcesGateway;
  let resourcesMock: Record<string, jest.Mock>;
  let lootMock: Record<string, jest.Mock>;
  let dataSourceMock: { transaction: jest.Mock };
  let materializeMock: Record<string, jest.Mock>;
  let masteriesMock: Record<string, jest.Mock>;
  let progressionMock: Record<string, jest.Mock>;
  let serverEmit: jest.Mock;

  function setupGateway() {
    gateway = new ResourcesGateway(
      resourcesMock as unknown as ResourcesService,
      lootMock as unknown as LootService,
      dataSourceMock as any,
      materializeMock as unknown as ItemMaterializationService,
      {} as unknown as WsAuthService,
      masteriesMock as unknown as MasteriesService,
      progressionMock as unknown as ProgressionService,
    );
    serverEmit = jest.fn();
    (gateway as any).server = {
      to: jest.fn().mockReturnValue({ emit: serverEmit }),
      emit: serverEmit,
    };
  }

  function setupSession(client: any, targetId = 'res-1') {
    (gateway as any).gatherSessions.set(client.id, {
      targetId,
      timer: null,
      lastWorldX: client.data.player.worldX,
      lastWorldY: client.data.player.worldY,
    });
  }

  beforeEach(() => {
    resourcesMock = {
      findOne: jest.fn(),
      getTemplate: jest.fn().mockResolvedValue(null),
      consumeLootInManager: jest.fn(),
      scheduleRespawn: jest.fn().mockResolvedValue(undefined),
      buildResourceBroadcast: jest.fn().mockReturnValue({}),
      setServer: jest.fn(),
    };
    lootMock = {
      generateLoot: jest.fn().mockReturnValue([{ itemId: 'wooden_stick', quantity: 1 }]),
    };
    materializeMock = {
      materialize: jest.fn().mockResolvedValue({
        stacks: [makeInventoryEntry()],
        instances: [],
        worldItems: [],
      }),
    };
    // La transaction exécute le callback avec un manager factice.
    dataSourceMock = {
      transaction: jest.fn().mockImplementation(async (fn) => fn({})),
    };
    masteriesMock = {
      applyMasteryXpInTx: jest.fn().mockResolvedValue({
        masteryDefinitionKey: 'woodcutting', key: 'woodcutting', name: 'Woodcutting',
        category: 'gathering', enabled: true, level: 1, xp: 10, nextLevelXp: 100, leveledUp: false,
      }),
    };
    progressionMock = {
      applyCharacterXpInTx: jest.fn().mockResolvedValue({
        level: 1, experience: 5, nextLevelXp: 100, leveledUp: false,
      }),
    };
    setupGateway();
  });

  // ── Character XP + Mastery XP ──────────────────────────────────────────────────

  it('dead_tree → Character XP (template) + Mastery XP woodcutting (runtime)', async () => {
    const resource = makeResource('dead_tree');
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLootInManager.mockResolvedValue({ ...resource, remainingLoots: 2 });
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 7));

    const client = makeClient('char-1');
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(progressionMock.applyCharacterXpInTx).toHaveBeenCalledWith('char-1', 7, 'RESOURCE', expect.anything());
    expect(masteriesMock.applyMasteryXpInTx).toHaveBeenCalledWith('char-1', 'woodcutting', expect.any(Number), expect.anything());
    expect(client.emit).toHaveBeenCalledWith('character_xp_update', expect.objectContaining({ level: 1 }));
    expect(client.emit).toHaveBeenCalledWith('mastery_update', expect.objectContaining({ key: 'woodcutting' }));
  });

  it('ore → Character XP (template) + Mastery XP mining (runtime)', async () => {
    const resource = makeResource('ore');
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLootInManager.mockResolvedValue({ ...resource, remainingLoots: 2 });
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('ore', 4));

    const client = makeClient('char-2');
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(progressionMock.applyCharacterXpInTx).toHaveBeenCalledWith('char-2', 4, 'RESOURCE', expect.anything());
    expect(masteriesMock.applyMasteryXpInTx).toHaveBeenCalledWith('char-2', 'mining', expect.any(Number), expect.anything());
  });

  it('difficulty 0 → Mastery XP = 10 (base)', async () => {
    const resource = makeResource('dead_tree');
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLootInManager.mockResolvedValue({ ...resource, remainingLoots: 2 });
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 0, 0));

    const client = makeClient('char-1');
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(masteriesMock.applyMasteryXpInTx).toHaveBeenCalledWith('char-1', 'woodcutting', 10, expect.anything());
  });

  it('difficulty 20 → Mastery XP = 12 (10 + floor(20/10))', async () => {
    const resource = makeResource('dead_tree');
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLootInManager.mockResolvedValue({ ...resource, remainingLoots: 2 });
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 0, 20));

    const client = makeClient('char-1');
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(masteriesMock.applyMasteryXpInTx).toHaveBeenCalledWith('char-1', 'woodcutting', 12, expect.anything());
  });

  it('difficulty 100 → Mastery XP = 20 (10 + floor(100/10))', async () => {
    const resource = makeResource('ore');
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLootInManager.mockResolvedValue({ ...resource, remainingLoots: 2 });
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('ore', 0, 100));

    const client = makeClient('char-1');
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(masteriesMock.applyMasteryXpInTx).toHaveBeenCalledWith('char-1', 'mining', 20, expect.anything());
  });

  it('gatherCharacterXpReward = 0 → pas de character_xp_update', async () => {
    const resource = makeResource('dead_tree');
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLootInManager.mockResolvedValue({ ...resource, remainingLoots: 2 });
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 0));

    const client = makeClient();
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(progressionMock.applyCharacterXpInTx).not.toHaveBeenCalled();
    expect(client.emit).not.toHaveBeenCalledWith('character_xp_update', expect.anything());
    // Mastery XP toujours accordé (runtime), indépendant de la Character XP
    expect(masteriesMock.applyMasteryXpInTx).toHaveBeenCalled();
  });

  it('type non mappé → Character XP possible, mais pas de Mastery XP', async () => {
    const resource = makeResource('mystery_plant');
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLootInManager.mockResolvedValue({ ...resource, remainingLoots: 2 });
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('mystery_plant', 3));

    const client = makeClient();
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(progressionMock.applyCharacterXpInTx).toHaveBeenCalledWith('char-1', 3, 'RESOURCE', expect.anything());
    expect(masteriesMock.applyMasteryXpInTx).not.toHaveBeenCalled();
    expect(client.emit).not.toHaveBeenCalledWith('mastery_update', expect.anything());
  });

  it('ignore masteryKey / gatheringXpReward legacy du template', async () => {
    const resource = makeResource('dead_tree');
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLootInManager.mockResolvedValue({ ...resource, remainingLoots: 2 });
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 1));

    const client = makeClient();
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    // Mastery résolu par le runtime (dead_tree → woodcutting), jamais 'legacy_should_be_ignored'
    expect(masteriesMock.applyMasteryXpInTx).toHaveBeenCalledWith('char-1', 'woodcutting', expect.any(Number), expect.anything());
    expect(masteriesMock.applyMasteryXpInTx).not.toHaveBeenCalledWith('char-1', 'legacy_should_be_ignored', expect.anything(), expect.anything());
  });

  // ── Rollback ──────────────────────────────────────────────────────────────────

  it('rollback transaction → pas de loot émis, pas de décrément, pas d\'XP', async () => {
    const resource = makeResource('dead_tree');
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 5));
    // La transaction échoue (rollback) : rien ne doit être émis ni décrémenté.
    dataSourceMock.transaction.mockRejectedValue(new Error('DB rollback'));

    const client = makeClient();
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(client.emit).not.toHaveBeenCalledWith('resource_loot', expect.anything());
    expect(client.emit).not.toHaveBeenCalledWith('character_xp_update', expect.anything());
    expect(client.emit).not.toHaveBeenCalledWith('mastery_update', expect.anything());
    expect(serverEmit).not.toHaveBeenCalledWith('resource_update', expect.anything());
    expect(client.emit).toHaveBeenCalledWith('gather_cancelled', expect.objectContaining({ reason: 'error' }));
  });

  // ── Non-régression loot / consume / respawn / broadcast ──────────────────────

  it('non-régression : generateLoot appelé avec le lootPool du template', async () => {
    const resource = makeResource('dead_tree');
    const template = makeTemplate('dead_tree', 0);
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLootInManager.mockResolvedValue({ ...resource, remainingLoots: 2 });
    resourcesMock.getTemplate.mockResolvedValue(template);

    const client = makeClient();
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(lootMock.generateLoot).toHaveBeenCalledWith('dead_tree', template.lootPool);
    expect(materializeMock.materialize).toHaveBeenCalledWith(
      expect.anything(),
      [{ itemId: 'wooden_stick', quantity: 1 }],
      expect.objectContaining({ source: 'LOOT', destination: expect.objectContaining({ type: 'INVENTORY', characterId: 'char-1' }) }),
    );
    expect(client.emit).toHaveBeenCalledWith(
      'resource_loot',
      expect.objectContaining({
        lootItemId: 'wooden_stick',
        item: expect.objectContaining({ name: 'Bâton de bois', image: '/assets/images/items/wooden_stick.png' }),
      }),
    );
  });

  it('non-régression : remainingLoots décrémenté via consumeLootInManager + resource_update émis', async () => {
    const resource = makeResource('dead_tree', 3);
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLootInManager.mockResolvedValue({ ...resource, remainingLoots: 2, state: 'alive' });
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 0));

    const client = makeClient();
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(resourcesMock.consumeLootInManager).toHaveBeenCalledWith(expect.anything(), 'res-1');
    expect(serverEmit).toHaveBeenCalledWith('resource_update', expect.anything());
    expect(resourcesMock.scheduleRespawn).not.toHaveBeenCalled();
  });

  it('non-régression : passage dead → scheduleRespawn + gather_cancelled(depleted)', async () => {
    const resource = makeResource('dead_tree', 1);
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLootInManager.mockResolvedValue({ ...resource, remainingLoots: 0, state: 'dead' });
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 0));

    const client = makeClient();
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(serverEmit).toHaveBeenCalledWith('resource_update', expect.anything());
    expect(resourcesMock.scheduleRespawn).toHaveBeenCalledWith('res-1');
    expect(client.emit).toHaveBeenCalledWith('gather_cancelled', expect.objectContaining({ reason: 'depleted' }));
  });

  it('non-régression : loot vide → récolte annulée, aucune XP', async () => {
    lootMock.generateLoot.mockReturnValue([]);
    const resource = makeResource('dead_tree');
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 5));

    const client = makeClient();
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(dataSourceMock.transaction).not.toHaveBeenCalled();
    expect(progressionMock.applyCharacterXpInTx).not.toHaveBeenCalled();
    expect(masteriesMock.applyMasteryXpInTx).not.toHaveBeenCalled();
  });

  it('loot INSTANCE (arme) : pas de rollback, character:reload émis, XP appliquée', async () => {
    // basic_sword est objectMode INSTANCE → materialize remplit instances, pas stacks.
    materializeMock.materialize.mockResolvedValue({
      stacks: [],
      instances: [{ id: 'inst-1', itemId: 'item-sword' }],
      worldItems: [],
    });
    const resource = makeResource('grey_rock');
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLootInManager.mockResolvedValue({ ...resource, remainingLoots: 2 });
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('grey_rock', 3));

    const client = makeClient('char-1');
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    // Pas d'annulation (pas de rollback).
    expect(client.emit).not.toHaveBeenCalledWith('gather_cancelled', expect.objectContaining({ reason: 'error' }));
    // Refresh autoritatif de l'inventaire pour le loot instance.
    expect(client.emit).toHaveBeenCalledWith('character:reload');
    // Décrément + XP appliqués.
    expect(resourcesMock.consumeLootInManager).toHaveBeenCalledWith(expect.anything(), 'res-1');
    expect(progressionMock.applyCharacterXpInTx).toHaveBeenCalledWith('char-1', 3, 'RESOURCE', expect.anything());
  });

  it('utilise le characterId serveur (client.data.player), jamais un champ client', async () => {
    const resource = makeResource('dead_tree');
    resourcesMock.findOne.mockResolvedValue(resource);
    resourcesMock.consumeLootInManager.mockResolvedValue({ ...resource, remainingLoots: 2 });
    resourcesMock.getTemplate.mockResolvedValue(makeTemplate('dead_tree', 5));

    const client = makeClient('server-resolved-char');
    setupSession(client);
    await (gateway as any).runGatherCycle(client, 'res-1');

    expect(materializeMock.materialize).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      expect.objectContaining({ destination: expect.objectContaining({ characterId: 'server-resolved-char' }) }),
    );
    expect(progressionMock.applyCharacterXpInTx).toHaveBeenCalledWith('server-resolved-char', 5, 'RESOURCE', expect.anything());
  });
});
