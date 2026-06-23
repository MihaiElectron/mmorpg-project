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

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('ResourcesService', () => {
  let service: ResourcesService;
  let resourceRepo: { findOne: jest.Mock; find: jest.Mock; update: jest.Mock };
  let templateRepo: { findOne: jest.Mock; upsert: jest.Mock };

  beforeEach(async () => {
    resourceRepo  = { findOne: jest.fn(), find: jest.fn(), update: jest.fn() };
    templateRepo  = { findOne: jest.fn(), upsert: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourcesService,
        { provide: getRepositoryToken(Resource),         useValue: resourceRepo },
        { provide: getRepositoryToken(ResourceTemplate), useValue: templateRepo },
      ],
    }).compile();

    service = module.get(ResourcesService);
    await service.onModuleInit(); // seed templates
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
    it("remet state alive et restaure remainingLoots depuis le template", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0 });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      const result = await service.doRespawn('res-1');

      expect(resourceRepo.update).toHaveBeenCalledWith('res-1', {
        state: 'alive',
        remainingLoots: 5,
      });
      expect(result?.state).toBe('alive');
      expect(result?.remainingLoots).toBe(5);
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

    it("appelle onRespawned après le délai avec la resource restaurée", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0 });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      const onRespawned = jest.fn();
      service.scheduleRespawn('res-1', onRespawned, 100);

      expect(onRespawned).not.toHaveBeenCalled();

      await jest.runAllTimersAsync();

      expect(onRespawned).toHaveBeenCalledTimes(1);
      const called = onRespawned.mock.calls[0][0] as Resource;
      expect(called.state).toBe('alive');
      expect(called.remainingLoots).toBe(5);
    });

    it("n'arme qu'un seul timer si scheduleRespawn est appelé deux fois pour le même ID", async () => {
      const resource = makeResource({ state: 'dead', remainingLoots: 0 });
      resourceRepo.findOne.mockResolvedValue(resource);
      templateRepo.findOne.mockResolvedValue(makeTemplate({ defaultRemainingLoots: 5 }));
      resourceRepo.update.mockResolvedValue(undefined);

      const onRespawned = jest.fn();
      service.scheduleRespawn('res-1', onRespawned, 100);
      service.scheduleRespawn('res-1', onRespawned, 100); // doublon ignoré

      await jest.runAllTimersAsync();

      expect(onRespawned).toHaveBeenCalledTimes(1);
    });

    it("exporte RESOURCE_RESPAWN_DELAY_MS à 30 000 ms", () => {
      expect(RESOURCE_RESPAWN_DELAY_MS).toBe(30_000);
    });
  });
});
