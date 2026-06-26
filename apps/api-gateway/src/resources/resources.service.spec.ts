import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ResourcesService, RESOURCE_RESPAWN_DELAY_MS, RESOURCE_TEMPLATES } from './resources.service';
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
    respawnDelayMs: 30_000,
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
  let templateRepo: { findOne: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    resourceRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]), update: jest.fn() };
    const qb = { insert: jest.fn().mockReturnThis(), values: jest.fn().mockReturnThis(), orIgnore: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue(undefined) };
    templateRepo = { findOne: jest.fn(), update: jest.fn().mockResolvedValue(undefined), createQueryBuilder: jest.fn().mockReturnValue(qb) };

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

  // ── resolveRespawnDelay (via scheduleRespawn sans override) ─────────────────

  describe('scheduleRespawn — résolution du délai depuis le template', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("utilise respawnDelayMs du template pour calculer respawnAt", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0 });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ respawnDelayMs: 120_000 } as any));
      resourceRepo.update.mockResolvedValue(undefined);

      const before = Date.now();
      await service.scheduleRespawn('res-1'); // pas d'override → résolution template

      const updateCall = resourceRepo.update.mock.calls[0];
      expect(updateCall[0]).toBe('res-1');
      const respawnAt: Date = updateCall[1].respawnAt;
      expect(respawnAt).toBeInstanceOf(Date);
      expect(respawnAt.getTime()).toBeGreaterThanOrEqual(before + 120_000);
      expect(respawnAt.getTime()).toBeLessThan(before + 120_000 + 500);
    });

    it("fallback vers RESOURCE_RESPAWN_DELAY_MS si template introuvable", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0 });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(null); // template absent
      resourceRepo.update.mockResolvedValue(undefined);

      const before = Date.now();
      await service.scheduleRespawn('res-1');

      const updateCall = resourceRepo.update.mock.calls[0];
      const respawnAt: Date = updateCall[1].respawnAt;
      expect(respawnAt.getTime()).toBeGreaterThanOrEqual(before + RESOURCE_RESPAWN_DELAY_MS);
    });

    it("fallback vers RESOURCE_RESPAWN_DELAY_MS si respawnDelayMs <= 0", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0 });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ respawnDelayMs: 0 } as any));
      resourceRepo.update.mockResolvedValue(undefined);

      const before = Date.now();
      await service.scheduleRespawn('res-1');

      const updateCall = resourceRepo.update.mock.calls[0];
      const respawnAt: Date = updateCall[1].respawnAt;
      expect(respawnAt.getTime()).toBeGreaterThanOrEqual(before + RESOURCE_RESPAWN_DELAY_MS);
    });

    it("fallback vers RESOURCE_RESPAWN_DELAY_MS si resource introuvable", async () => {
      // findOne appelé deux fois : une pour resolveRespawnDelay (resource null),
      // on n'atteint pas l'étape d'armement mais le timer est planifié avec le fallback.
      // Note: scheduleRespawn continue même si findOne retourne null (fallback uniquement).
      resourceRepo.findOne.mockResolvedValue(null);
      resourceRepo.update.mockResolvedValue(undefined);

      const before = Date.now();
      await service.scheduleRespawn('res-1');

      const updateCall = resourceRepo.update.mock.calls[0];
      const respawnAt: Date = updateCall[1].respawnAt;
      expect(respawnAt.getTime()).toBeGreaterThanOrEqual(before + RESOURCE_RESPAWN_DELAY_MS);
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

    it("émet immédiatement avec respawnAt puis de nouveau avec state alive après le délai", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0 });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      const mockServer = makeMockServer();
      service.setServer(mockServer as any);

      await service.scheduleRespawn('res-1', 100);

      // Premier emit : diffuse respawnAt immédiatement après la planification
      expect(mockServer.emit).toHaveBeenCalledTimes(1);
      expect(mockServer.emit).toHaveBeenCalledWith('resource_update', expect.objectContaining({
        id: 'res-1',
        state: 'dead',
        respawnAt: expect.any(Date),
      }));

      await jest.runAllTimersAsync();

      // Deuxième emit : resource restaurée après le timer
      const restorePayload = mockServer.emit.mock.calls[1][1];
      expect(mockServer.emit).toHaveBeenCalledWith('resource_update', expect.objectContaining({
        id: 'res-1',
        type: 'dead_tree',
        state: 'alive',
        remainingLoots: 5,
        respawnAt: null,
      }));
      expect(restorePayload.x).toBeUndefined();
      expect(restorePayload.y).toBeUndefined();
    });

    it("le payload de respawn contient type et position pour le rendu client", async () => {
      const resource = makeResource({
        state: 'dead', remainingLoots: 0,
        x: 400, y: 300,
        worldX: 6560768, worldY: 6529024, mapId: 1,
      });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 4 }));
      resourceRepo.update.mockResolvedValue(undefined);

      const mockServer = makeMockServer();
      service.setServer(mockServer as any);

      await service.scheduleRespawn('res-1', 50);
      await jest.runAllTimersAsync();

      const [event, payload] = mockServer.emit.mock.calls[0];
      expect(event).toBe('resource_update');
      expect(payload.type).toBe('dead_tree');
      expect(payload.worldX).toBe(6560768);
      expect(payload.worldY).toBe(6529024);
      expect(payload.mapId).toBe(1);
      expect(payload.x).toBeUndefined();
      expect(payload.y).toBeUndefined();
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

  // ── forceRespawn ─────────────────────────────────────────────────────────────

  describe('forceRespawn', () => {
    it("retourne null si la resource est introuvable", async () => {
      resourceRepo.findOne.mockResolvedValue(null);
      const result = await service.forceRespawn('unknown-id');
      expect(result).toBeNull();
    });

    it("remet state=alive, remainingLoots depuis template, respawnAt=null", async () => {
      resourceRepo.findOne.mockResolvedValue(makeResource({ state: 'dead', remainingLoots: 0, respawnAt: new Date() }));
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      const result = await service.forceRespawn('res-1');

      expect(result?.state).toBe('alive');
      expect(result?.remainingLoots).toBe(5);
      expect(result?.respawnAt).toBeNull();
    });

    it("appelle repo.update avec les bonnes valeurs", async () => {
      resourceRepo.findOne.mockResolvedValue(makeResource({ state: 'dead', remainingLoots: 0 }));
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 10 }));
      resourceRepo.update.mockResolvedValue(undefined);

      await service.forceRespawn('res-1');

      expect(resourceRepo.update).toHaveBeenCalledWith('res-1', {
        state: 'alive',
        remainingLoots: 10,
        respawnAt: null,
      });
    });

    it("émet resource_update via server socket", async () => {
      const mockServer = makeMockServer();
      service.setServer(mockServer as any);
      resourceRepo.findOne.mockResolvedValue(makeResource({ state: 'dead', remainingLoots: 0 }));
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      await service.forceRespawn('res-1');

      const broadcastPayload = mockServer.emit.mock.calls[0][1];
      expect(mockServer.emit).toHaveBeenCalledWith('resource_update', expect.objectContaining({
        id: 'res-1',
        type: 'dead_tree',
        state: 'alive',
        remainingLoots: 5,
        respawnAt: null,
      }));
      expect(broadcastPayload.x).toBeUndefined();
      expect(broadcastPayload.y).toBeUndefined();
    });

    it("ne crash pas si server socket absent", async () => {
      resourceRepo.findOne.mockResolvedValue(makeResource({ state: 'dead', remainingLoots: 0 }));
      templateRepo.findOne.mockResolvedValue(makeTemplate());
      resourceRepo.update.mockResolvedValue(undefined);
      await expect(service.forceRespawn('res-1')).resolves.not.toThrow();
    });

    it("supprime la resource du pendingRespawns", async () => {
      resourceRepo.findOne.mockResolvedValue(makeResource({ state: 'dead', remainingLoots: 0 }));
      templateRepo.findOne.mockResolvedValue(makeTemplate());
      resourceRepo.update.mockResolvedValue(undefined);
      (service as any).pendingRespawns.add('res-1');

      await service.forceRespawn('res-1');

      expect((service as any).pendingRespawns.has('res-1')).toBe(false);
    });

    it("fonctionne aussi sur une resource déjà alive", async () => {
      resourceRepo.findOne.mockResolvedValue(makeResource({ state: 'alive', remainingLoots: 3 }));
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      const result = await service.forceRespawn('res-1');
      expect(result?.state).toBe('alive');
      expect(result?.remainingLoots).toBe(5);
    });
  });

  // ── Token de génération (sécurité respawn) ───────────────────────────────────

  describe('token de génération', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("un timer planifié se déclenche normalement sans forceRespawn", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0 });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      await service.scheduleRespawn('res-1', 100);
      await jest.runAllTimersAsync();

      expect(resourceRepo.update).toHaveBeenCalledWith('res-1', {
        state: 'alive',
        remainingLoots: 5,
        respawnAt: null,
      });
    });

    it("forceRespawn invalide le token : l'ancien timer devient no-op", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0 });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      await service.scheduleRespawn('res-1', 100);
      // Avant que le timer se déclenche, forceRespawn invalide le token
      await service.forceRespawn('res-1');

      // update appelé une fois pour respawnAt (scheduleRespawn) + une fois pour forceRespawn
      const updateCallsBefore = resourceRepo.update.mock.calls.length;
      resourceRepo.update.mockClear();

      await jest.runAllTimersAsync();

      // Le timer ne doit plus appeler update
      expect(resourceRepo.update).not.toHaveBeenCalled();
      void updateCallsBefore;
    });

    it("un nouveau schedule après forceRespawn reçoit un token distinct et fonctionne", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0 });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      await service.scheduleRespawn('res-1', 100);
      await service.forceRespawn('res-1');
      // Nouveau schedule après forceRespawn
      await service.scheduleRespawn('res-1', 50);

      resourceRepo.update.mockClear();
      await jest.runAllTimersAsync();

      // Le nouveau timer doit avoir exécuté le respawn
      expect(resourceRepo.update).toHaveBeenCalledWith('res-1', {
        state: 'alive',
        remainingLoots: 5,
        respawnAt: null,
      });
    });

    it("forceRespawn supprime le token actif", async () => {
      resourceRepo.findOne.mockResolvedValue(makeResource({ state: 'dead', remainingLoots: 0 }));
      templateRepo.findOne.mockResolvedValue(makeTemplate());
      resourceRepo.update.mockResolvedValue(undefined);

      await service.scheduleRespawn('res-1', 100);
      expect((service as any).pendingRespawnTokens.has('res-1')).toBe(true);

      await service.forceRespawn('res-1');
      expect((service as any).pendingRespawnTokens.has('res-1')).toBe(false);
    });

    it("doRespawn avec mauvais token retourne null sans modifier la DB", async () => {
      resourceRepo.findOne.mockResolvedValue(makeResource({ state: 'dead', remainingLoots: 0 }));
      templateRepo.findOne.mockResolvedValue(makeTemplate());
      resourceRepo.update.mockResolvedValue(undefined);

      (service as any).pendingRespawnTokens.set('res-1', 7);

      const result = await service.doRespawn('res-1', 999); // mauvais token
      expect(result).toBeNull();
      expect(resourceRepo.update).not.toHaveBeenCalled();
    });

    it("doRespawn avec token correct respecte le token et efface l'entrée", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0 });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      (service as any).pendingRespawnTokens.set('res-1', 42);
      (service as any).pendingRespawns.add('res-1');

      const result = await service.doRespawn('res-1', 42);
      expect(result?.state).toBe('alive');
      expect((service as any).pendingRespawnTokens.has('res-1')).toBe(false);
      expect((service as any).pendingRespawns.has('res-1')).toBe(false);
    });

    it("doRespawn sans token bypasse la vérification (compatibilité tests directs)", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0 });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      // Aucun token en attente — doRespawn sans token doit quand même fonctionner
      const result = await service.doRespawn('res-1');
      expect(result?.state).toBe('alive');
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

  // ── resetInstanceFromTemplate ─────────────────────────────────────────────

  describe('resetInstanceFromTemplate', () => {
    it('retourne null si la resource est introuvable', async () => {
      resourceRepo.findOne.mockResolvedValue(null);
      const result = await service.resetInstanceFromTemplate('unknown');
      expect(result).toBeNull();
    });

    it('lève BadRequestException si le template est absent', async () => {
      resourceRepo.findOne.mockResolvedValue(makeResource({ type: 'dead_tree' }));
      templateRepo.findOne.mockResolvedValue(null);
      await expect(service.resetInstanceFromTemplate('res-1')).rejects.toThrow(
        /Template absent/,
      );
    });

    it('remet remainingLoots depuis template.defaultRemainingLoots', async () => {
      resourceRepo.findOne.mockResolvedValue(makeResource({ remainingLoots: 9999 }));
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 4 }));
      resourceRepo.update.mockResolvedValue(undefined);

      const result = await service.resetInstanceFromTemplate('res-1');
      expect(result?.remainingLoots).toBe(4);
    });

    it('remet state à alive', async () => {
      resourceRepo.findOne.mockResolvedValue(makeResource({ state: 'dead' }));
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 4 }));
      resourceRepo.update.mockResolvedValue(undefined);

      const result = await service.resetInstanceFromTemplate('res-1');
      expect(result?.state).toBe('alive');
    });

    it('efface respawnAt', async () => {
      const future = new Date(Date.now() + 60_000);
      resourceRepo.findOne.mockResolvedValue(makeResource({ state: 'dead', respawnAt: future }));
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 4 }));
      resourceRepo.update.mockResolvedValue(undefined);

      const result = await service.resetInstanceFromTemplate('res-1');
      expect(result?.respawnAt).toBeNull();
    });

    it('invalide le timer de respawn en cours', async () => {
      resourceRepo.findOne.mockResolvedValue(makeResource({ state: 'dead' }));
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 4 }));
      resourceRepo.update.mockResolvedValue(undefined);

      // Arme un respawn fictif
      jest.useFakeTimers();
      resourceRepo.update.mockResolvedValue(undefined);
      // Injecte directement un état pending (via scheduleRespawn simplifié)
      await (service as any).pendingRespawns.add('res-1');
      await (service as any).pendingRespawnTokens.set('res-1', 99);

      await service.resetInstanceFromTemplate('res-1');

      expect((service as any).pendingRespawns.has('res-1')).toBe(false);
      expect((service as any).pendingRespawnTokens.has('res-1')).toBe(false);
      jest.useRealTimers();
    });

    it('persiste les nouvelles valeurs en DB', async () => {
      resourceRepo.findOne.mockResolvedValue(makeResource({ remainingLoots: 9999, state: 'dead' }));
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 6 }));
      resourceRepo.update.mockResolvedValue(undefined);

      await service.resetInstanceFromTemplate('res-1');

      expect(resourceRepo.update).toHaveBeenCalledWith(
        'res-1',
        expect.objectContaining({ state: 'alive', remainingLoots: 6, respawnAt: null }),
      );
    });

    it('le broadcast contient type et position pour le rendu client', async () => {
      const resource = makeResource({
        state: 'dead', remainingLoots: 0,
        x: 500, y: 250, worldX: 5000, worldY: 3000, mapId: 1,
      });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 4 }));
      resourceRepo.update.mockResolvedValue(undefined);

      const mockServer = makeMockServer();
      service.setServer(mockServer as any);

      await service.resetInstanceFromTemplate('res-1');

      const resetPayload = mockServer.emit.mock.calls[0][1];
      expect(mockServer.emit).toHaveBeenCalledWith('resource_update', expect.objectContaining({
        id: 'res-1',
        type: 'dead_tree',
        state: 'alive',
        remainingLoots: 4,
        worldX: 5000,
        worldY: 3000,
        mapId: 1,
      }));
      expect(resetPayload.x).toBeUndefined();
      expect(resetPayload.y).toBeUndefined();
    });
  });
});

// ── buildResourceBroadcast — textureKey ──────────────────────────────────────

describe('buildResourceBroadcast — textureKey', () => {
  let service: ResourcesService;
  let resourceRepo: { findOne: jest.Mock; find: jest.Mock; update: jest.Mock };
  let templateRepo: { findOne: jest.Mock; update: jest.Mock; find: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    resourceRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]), update: jest.fn() };
    const qb = { insert: jest.fn().mockReturnThis(), values: jest.fn().mockReturnThis(), orIgnore: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue(undefined) };
    templateRepo = { findOne: jest.fn(), update: jest.fn().mockResolvedValue(undefined), find: jest.fn().mockResolvedValue([]), createQueryBuilder: jest.fn().mockReturnValue(qb) };

    const module = await Test.createTestingModule({
      providers: [
        ResourcesService,
        { provide: getRepositoryToken(Resource),         useValue: resourceRepo },
        { provide: getRepositoryToken(ResourceTemplate), useValue: templateRepo },
      ],
    }).compile();

    service = module.get(ResourcesService);
    await service.onModuleInit();
  });

  it('buildResourceBroadcast inclut textureKey quand fourni', () => {
    const resource = makeResource();
    const result = service.buildResourceBroadcast(resource, 'fire_camp');
    expect(result.textureKey).toBe('fire_camp');
  });

  it('buildResourceBroadcast inclut textureKey null quand absent', () => {
    const resource = makeResource();
    const result = service.buildResourceBroadcast(resource);
    expect(result.textureKey).toBeNull();
  });

  it('buildResourceBroadcast inclut textureKey null quand explicitement null', () => {
    const resource = makeResource();
    const result = service.buildResourceBroadcast(resource, null);
    expect(result.textureKey).toBeNull();
  });

  it('forceRespawn envoie textureKey depuis le template', async () => {
    resourceRepo.findOne.mockResolvedValue(makeResource({ state: 'dead', remainingLoots: 0 }));
    templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 4, textureKey: 'fire_camp' } as any));
    resourceRepo.update.mockResolvedValue(undefined);

    const mockServer = { emit: jest.fn() };
    service.setServer(mockServer as any);

    await service.forceRespawn('res-1');

    const [, payload] = mockServer.emit.mock.calls[0];
    expect(payload.textureKey).toBe('fire_camp');
  });

  it('forceRespawn envoie textureKey null si template absent', async () => {
    resourceRepo.findOne.mockResolvedValue(makeResource({ state: 'dead', remainingLoots: 0 }));
    templateRepo.findOne.mockResolvedValue(null);
    resourceRepo.update.mockResolvedValue(undefined);

    const mockServer = { emit: jest.fn() };
    service.setServer(mockServer as any);

    await service.forceRespawn('res-1');

    const [, payload] = mockServer.emit.mock.calls[0];
    expect(payload.textureKey).toBeNull();
  });

  it('resetInstanceFromTemplate envoie textureKey depuis le template', async () => {
    resourceRepo.findOne.mockResolvedValue(makeResource({ state: 'dead', remainingLoots: 0 }));
    templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 4, textureKey: 'dead_tree' } as any));
    resourceRepo.update.mockResolvedValue(undefined);

    const mockServer = { emit: jest.fn() };
    service.setServer(mockServer as any);

    await service.resetInstanceFromTemplate('res-1');

    const [, payload] = mockServer.emit.mock.calls[0];
    expect(payload.textureKey).toBe('dead_tree');
  });
});

// ── findAllWithTextureKey ─────────────────────────────────────────────────────

describe('findAllWithTextureKey', () => {
  let service: ResourcesService;
  let resourceRepo: { findOne: jest.Mock; find: jest.Mock; update: jest.Mock };
  let templateRepo: { findOne: jest.Mock; update: jest.Mock; find: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    resourceRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]), update: jest.fn() };
    const qb = { insert: jest.fn().mockReturnThis(), values: jest.fn().mockReturnThis(), orIgnore: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue(undefined) };
    templateRepo = { findOne: jest.fn(), update: jest.fn().mockResolvedValue(undefined), find: jest.fn().mockResolvedValue([]), createQueryBuilder: jest.fn().mockReturnValue(qb) };

    const module = await Test.createTestingModule({
      providers: [
        ResourcesService,
        { provide: getRepositoryToken(Resource),         useValue: resourceRepo },
        { provide: getRepositoryToken(ResourceTemplate), useValue: templateRepo },
      ],
    }).compile();

    service = module.get(ResourcesService);
    await service.onModuleInit();
  });

  it('retourne [] si aucune resource en base', async () => {
    resourceRepo.find.mockResolvedValue([]);
    const result = await service.findAllWithTextureKey();
    expect(result).toEqual([]);
  });

  it('enrichit chaque resource avec textureKey depuis le template', async () => {
    resourceRepo.find.mockResolvedValue([
      makeResource({ id: 'r1', type: 'dead_tree' }),
      makeResource({ id: 'r2', type: 'fire_camp' }),
    ]);
    templateRepo.find.mockResolvedValue([
      makeTemplate({ type: 'dead_tree', textureKey: 'dead_tree' } as any),
      makeTemplate({ type: 'fire_camp', textureKey: 'fire_camp' } as any),
    ]);

    const result = await service.findAllWithTextureKey();

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.id === 'r1')?.textureKey).toBe('dead_tree');
    expect(result.find((r) => r.id === 'r2')?.textureKey).toBe('fire_camp');
  });

  it('textureKey null si le template est absent pour un type', async () => {
    resourceRepo.find.mockResolvedValue([makeResource({ id: 'r1', type: 'unknown_ore' })]);
    templateRepo.find.mockResolvedValue([]);

    const result = await service.findAllWithTextureKey();

    expect(result[0].textureKey).toBeNull();
  });

  it('conserve toutes les propriétés d\'origine de la resource', async () => {
    const resource = makeResource({ id: 'r1', type: 'dead_tree', worldX: 1024, worldY: 2048, mapId: 1 });
    resourceRepo.find.mockResolvedValue([resource]);
    templateRepo.find.mockResolvedValue([makeTemplate({ type: 'dead_tree', textureKey: 'dead_tree' } as any)]);

    const result = await service.findAllWithTextureKey();

    expect(result[0]).toMatchObject({
      id: 'r1',
      type: 'dead_tree',
      worldX: 1024,
      worldY: 2048,
      mapId: 1,
      textureKey: 'dead_tree',
    });
  });

  it('ne fait qu\'un seul fetch de templates pour plusieurs resources du même type', async () => {
    resourceRepo.find.mockResolvedValue([
      makeResource({ id: 'r1', type: 'dead_tree' }),
      makeResource({ id: 'r2', type: 'dead_tree' }),
    ]);
    templateRepo.find.mockResolvedValue([makeTemplate({ type: 'dead_tree', textureKey: 'dead_tree' } as any)]);

    await service.findAllWithTextureKey();

    expect(templateRepo.find).toHaveBeenCalledTimes(1);
  });
});

// ── RESOURCE_TEMPLATES — équilibrage ──────────────────────────────────────────

describe('RESOURCE_TEMPLATES', () => {
  const deadTree = RESOURCE_TEMPLATES.find((t) => t.type === 'dead_tree')!;
  const ore      = RESOURCE_TEMPLATES.find((t) => t.type === 'ore')!;

  it('dead_tree existe dans les templates', () => {
    expect(deadTree).toBeDefined();
  });

  it('dead_tree.defaultRemainingLoots est faible (≤ 10)', () => {
    expect(deadTree.defaultRemainingLoots).toBeGreaterThanOrEqual(1);
    expect(deadTree.defaultRemainingLoots).toBeLessThanOrEqual(10);
  });

  it('dead_tree.respawnDelayMs vaut 60 000 ms', () => {
    expect(deadTree.respawnDelayMs).toBe(60_000);
  });

  it('dead_tree.lootPool contient wooden_stick', () => {
    const ids = (deadTree.lootPool ?? []).map((e: any) => e.itemId);
    expect(ids).toContain('wooden_stick');
  });

  it('dead_tree.lootPool maxQty ≥ minQty', () => {
    for (const entry of deadTree.lootPool ?? []) {
      expect((entry as any).maxQty).toBeGreaterThanOrEqual((entry as any).minQty);
    }
  });

  it('ore existe dans les templates', () => {
    expect(ore).toBeDefined();
  });

  it('ore.defaultRemainingLoots est faible/moyen (≤ 10)', () => {
    expect(ore.defaultRemainingLoots).toBeGreaterThanOrEqual(1);
    expect(ore.defaultRemainingLoots).toBeLessThanOrEqual(10);
  });

  it('ore.respawnDelayMs est plus long que dead_tree', () => {
    expect(ore.respawnDelayMs).toBeGreaterThan(deadTree.respawnDelayMs);
  });

  it('ore.lootPool contient iron_ore', () => {
    const ids = (ore.lootPool ?? []).map((e: any) => e.itemId);
    expect(ids).toContain('iron_ore');
  });

  it('tous les templates ont un lootPool non vide', () => {
    for (const tpl of RESOURCE_TEMPLATES) {
      expect(tpl.lootPool).not.toBeNull();
      expect((tpl.lootPool ?? []).length).toBeGreaterThan(0);
    }
  });
});
