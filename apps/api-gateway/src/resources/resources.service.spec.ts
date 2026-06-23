import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ResourcesService, RESOURCE_RESPAWN_DELAY_MS } from './resources.service';
import { Resource } from './entities/resource.entity';
import { ResourceTemplate } from './entities/resource-template.entity';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: 'res-1',
    type: 'dead_tree',
    x: 100,
    y: 100,
    worldX: null,
    worldY: null,
    mapId: null,
    state: 'alive',
    remainingLoots: 5,
    respawnAt: null,
    ...overrides,
  } as Resource;
}

function makeTemplate(overrides: Partial<ResourceTemplate> = {}): ResourceTemplate {
  return {
    id: 'tpl-1',
    type: 'dead_tree',
    defaultRemainingLoots: 5,
    ...overrides,
  } as ResourceTemplate;
}

function makeMockServer() {
  return { emit: jest.fn() };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('ResourcesService', () => {
  let service: ResourcesService;
  let resourceRepo: { findOne: jest.Mock; find: jest.Mock; update: jest.Mock };
  let templateRepo: { findOne: jest.Mock; upsert: jest.Mock };

  beforeEach(async () => {
    resourceRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]), update: jest.fn() };
    templateRepo = { findOne: jest.fn(), upsert: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourcesService,
        { provide: getRepositoryToken(Resource),         useValue: resourceRepo },
        { provide: getRepositoryToken(ResourceTemplate), useValue: templateRepo },
      ],
    }).compile();

    service = module.get(ResourcesService);
    await service.onModuleInit();
  });

  // ── consumeLoot ─────────────────────────────────────────────────────────────

  describe('consumeLoot', () => {
    it("décrémente remainingLoots et conserve state alive", async () => {
      const resource = makeResource({ remainingLoots: 3 });
      resourceRepo.findOne.mockResolvedValue(resource);
      resourceRepo.update.mockResolvedValue(undefined);

      const result = await service.consumeLoot('res-1');

      expect(resourceRepo.update).toHaveBeenCalledWith('res-1', {
        remainingLoots: 2,
        state: 'alive',
      });
      expect(result?.remainingLoots).toBe(2);
      expect(result?.state).toBe('alive');
    });

    it("passe state dead quand remainingLoots atteint 0", async () => {
      const resource = makeResource({ remainingLoots: 1 });
      resourceRepo.findOne.mockResolvedValue(resource);
      resourceRepo.update.mockResolvedValue(undefined);

      const result = await service.consumeLoot('res-1');

      expect(resourceRepo.update).toHaveBeenCalledWith('res-1', {
        remainingLoots: 0,
        state: 'dead',
      });
      expect(result?.remainingLoots).toBe(0);
      expect(result?.state).toBe('dead');
    });

    it("ne modifie pas une resource déjà dead", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0 });
      resourceRepo.findOne.mockResolvedValue(resource);

      const result = await service.consumeLoot('res-1');

      expect(resourceRepo.update).not.toHaveBeenCalled();
      expect(result?.state).toBe('dead');
    });

    it("retourne null si la resource est introuvable", async () => {
      resourceRepo.findOne.mockResolvedValue(null);

      const result = await service.consumeLoot('unknown');

      expect(result).toBeNull();
    });
  });

  // ── doRespawn ────────────────────────────────────────────────────────────────

  describe('doRespawn', () => {
    it("remet state alive, restaure remainingLoots et efface respawnAt", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0, respawnAt: new Date() });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      const result = await service.doRespawn('res-1');

      expect(resourceRepo.update).toHaveBeenCalledWith('res-1', {
        state: 'alive',
        remainingLoots: 5,
        respawnAt: null,
      });
      expect(result?.state).toBe('alive');
      expect(result?.remainingLoots).toBe(5);
      expect(result?.respawnAt).toBeNull();
    });

    it("retourne null si la resource est introuvable", async () => {
      resourceRepo.findOne.mockResolvedValue(null);

      const result = await service.doRespawn('unknown');

      expect(result).toBeNull();
    });
  });

  // ── scheduleRespawn ──────────────────────────────────────────────────────────

  describe('scheduleRespawn', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("persiste respawnAt en DB avant d'armer le timer", async () => {
      resourceRepo.update.mockResolvedValue(undefined);

      await service.scheduleRespawn('res-1', 100);

      expect(resourceRepo.update).toHaveBeenCalledWith('res-1', {
        respawnAt: expect.any(Date),
      });
    });

    it("appelle server.emit après le délai avec la resource restaurée", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0 });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      const mockServer = makeMockServer();
      service.setServer(mockServer as any);

      await service.scheduleRespawn('res-1', 100);

      expect(mockServer.emit).not.toHaveBeenCalled();

      await jest.runAllTimersAsync();

      expect(mockServer.emit).toHaveBeenCalledWith('resource_update', {
        id: 'res-1',
        state: 'alive',
        remainingLoots: 5,
        respawnAt: null,
      });
    });

    it("n'arme qu'un seul timer si scheduleRespawn est appelé deux fois pour le même ID", async () => {
      resourceRepo.update.mockResolvedValue(undefined);

      await service.scheduleRespawn('res-1', 100);
      await service.scheduleRespawn('res-1', 100); // doublon ignoré

      // Un seul update DB pour respawnAt
      expect(resourceRepo.update).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(1);
    });

    it("exporte RESOURCE_RESPAWN_DELAY_MS à 30 000 ms", () => {
      expect(RESOURCE_RESPAWN_DELAY_MS).toBe(30_000);
    });
  });

  // ── reloadPendingRespawns (via onModuleInit) ──────────────────────────────────

  describe('onModuleInit — reloadPendingRespawns', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("replanifie un timer pour une resource dead avec respawnAt dans le futur", async () => {
      const future = new Date(Date.now() + 20_000);
      const resource = makeResource({ state: 'dead', remainingLoots: 0, respawnAt: future });
      resourceRepo.find.mockResolvedValue([resource]);
      resourceRepo.update.mockResolvedValue(undefined);

      // Réinitialiser le service pour déclencher onModuleInit avec les nouveaux mocks
      const module = await Test.createTestingModule({
        providers: [
          ResourcesService,
          { provide: getRepositoryToken(Resource),         useValue: resourceRepo },
          { provide: getRepositoryToken(ResourceTemplate), useValue: templateRepo },
        ],
      }).compile();
      const svc = module.get(ResourcesService);

      await svc.onModuleInit();

      expect(jest.getTimerCount()).toBe(1);
    });

    it("respawn immédiatement une resource dead avec respawnAt dans le passé", async () => {
      const past = new Date(Date.now() - 5_000);
      const resource = makeResource({ state: 'dead', remainingLoots: 0, respawnAt: past });
      resourceRepo.find.mockResolvedValue([resource]);
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      const mockServer = makeMockServer();
      const module = await Test.createTestingModule({
        providers: [
          ResourcesService,
          { provide: getRepositoryToken(Resource),         useValue: resourceRepo },
          { provide: getRepositoryToken(ResourceTemplate), useValue: templateRepo },
        ],
      }).compile();
      const svc = module.get(ResourcesService);
      svc.setServer(mockServer as any);

      await svc.onModuleInit();

      // delayMs = 0 → setTimeout(fn, 0) → se déclenche au runAllTimersAsync
      await jest.runAllTimersAsync();

      expect(resourceRepo.update).toHaveBeenCalledWith('res-1', {
        state: 'alive',
        remainingLoots: 5,
        respawnAt: null,
      });
      expect(mockServer.emit).toHaveBeenCalledWith('resource_update', expect.objectContaining({
        id: 'res-1',
        state: 'alive',
      }));
    });

    it("ignore (skip) une resource dead sans respawnAt même si le mock la retourne", async () => {
      // La query TypeORM (Not(IsNull())) exclut ces rows en production.
      // Le guard dans reloadPendingRespawns couvre le cas défensif.
      const resource = makeResource({ state: 'dead', remainingLoots: 0, respawnAt: null });
      resourceRepo.find.mockResolvedValue([resource]);

      const module = await Test.createTestingModule({
        providers: [
          ResourcesService,
          { provide: getRepositoryToken(Resource),         useValue: resourceRepo },
          { provide: getRepositoryToken(ResourceTemplate), useValue: templateRepo },
        ],
      }).compile();
      const svc = module.get(ResourcesService);
      await svc.onModuleInit();

      // Aucun timer ne doit être armé
      expect(jest.getTimerCount()).toBe(0);
    });

    it("n'arme pas de double timer si la resource est déjà dans pendingRespawns", async () => {
      resourceRepo.update.mockResolvedValue(undefined);

      // Premier schedule via API publique
      await service.scheduleRespawn('res-1', 5_000);

      const future = new Date(Date.now() + 10_000);
      const resource = makeResource({ state: 'dead', remainingLoots: 0, respawnAt: future });
      resourceRepo.find.mockResolvedValue([resource]);

      // onModuleInit appelle reloadPendingRespawns — 'res-1' déjà dans pendingRespawns
      await service.onModuleInit();

      // Toujours un seul timer (le premier)
      expect(jest.getTimerCount()).toBe(1);
    });
  });
});
