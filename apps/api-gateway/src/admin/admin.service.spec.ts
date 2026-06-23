import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { CreatureTemplate } from '../animals/entities/creature-template.entity';
import { CreatureSpawn } from '../animals/entities/creature-spawn.entity';
import { Animal } from '../animals/entities/animal.entity';
import { Character } from '../characters/entities/character.entity';
import { Resource } from '../resources/entities/resource.entity';
import { ResourceTemplate } from '../resources/entities/resource-template.entity';
import { WorldService } from '../world/world.service';

describe('AdminService resources', () => {
  let service: AdminService;
  let resourceRepo: Record<string, jest.Mock>;
  let resourceTemplateRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    resourceRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((resource) => Promise.resolve(resource)),
      create: jest.fn().mockImplementation((resource) => resource),
    };
    resourceTemplateRepo = {
      findOne: jest.fn().mockResolvedValue({ type: 'wood', defaultRemainingLoots: 7, respawnDelayMs: 30_000, lootPool: null }),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((tpl) => Promise.resolve(tpl)),
    };

    const emptyRepo = {
      count: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(CreatureTemplate), useValue: emptyRepo },
        { provide: getRepositoryToken(CreatureSpawn), useValue: emptyRepo },
        { provide: getRepositoryToken(Animal), useValue: emptyRepo },
        { provide: getRepositoryToken(Character), useValue: emptyRepo },
        { provide: getRepositoryToken(Resource), useValue: resourceRepo },
        { provide: getRepositoryToken(ResourceTemplate), useValue: resourceTemplateRepo },
        { provide: WorldService, useValue: { getConnectedCount: jest.fn() } },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  // ── updateResourceTemplate ───────────────────────────────────────────────────

  describe('updateResourceTemplate', () => {
    it('met à jour respawnDelayMs si valeur valide', async () => {
      const updated = await service.updateResourceTemplate('wood', { respawnDelayMs: 60_000 });
      expect(resourceTemplateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ respawnDelayMs: 60_000 }),
      );
      expect(updated?.respawnDelayMs).toBe(60_000);
    });

    it('met à jour defaultRemainingLoots sans toucher respawnDelayMs', async () => {
      const updated = await service.updateResourceTemplate('wood', { defaultRemainingLoots: 10 });
      expect(resourceTemplateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ defaultRemainingLoots: 10 }),
      );
      expect(updated?.defaultRemainingLoots).toBe(10);
    });

    it('retourne null si type introuvable', async () => {
      resourceTemplateRepo.findOne.mockResolvedValue(null);
      const result = await service.updateResourceTemplate('unknown', { respawnDelayMs: 60_000 });
      expect(result).toBeNull();
      expect(resourceTemplateRepo.save).not.toHaveBeenCalled();
    });

    it('rejette respawnDelayMs <= 0', async () => {
      await expect(service.updateResourceTemplate('wood', { respawnDelayMs: 0 }))
        .rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updateResourceTemplate('wood', { respawnDelayMs: -1000 }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejette respawnDelayMs > 86_400_000 (24h)', async () => {
      await expect(service.updateResourceTemplate('wood', { respawnDelayMs: 86_400_001 }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejette respawnDelayMs non entier', async () => {
      await expect(service.updateResourceTemplate('wood', { respawnDelayMs: 1000.5 }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejette respawnDelayMs NaN / Infinity', async () => {
      await expect(service.updateResourceTemplate('wood', { respawnDelayMs: NaN }))
        .rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updateResourceTemplate('wood', { respawnDelayMs: Infinity }))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('createResource écrit x/y pixels et worldX/worldY/mapId', async () => {
    const resource = await service.createResource('wood', 600.4, 300.2);

    expect(resourceRepo.create).toHaveBeenCalledWith({
      type: 'wood',
      x: 600,
      y: 300,
      worldX: 1600,
      worldY: 8000,
      mapId: 1,
      remainingLoots: 7,
    });
    expect(resource).toMatchObject({ x: 600, y: 300, worldX: 1600, worldY: 8000, mapId: 1 });
  });

  it('updateResource recalcule worldX/worldY/mapId quand x change', async () => {
    const resource = { id: 'resource-1', type: 'wood', x: 600, y: 300, worldX: 1600, worldY: 8000, mapId: 1, state: 'dead', remainingLoots: 0 } as Resource;
    resourceRepo.findOne.mockResolvedValue(resource);

    const updated = await service.updateResource('resource-1', { x: 700 });

    expect(resourceRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      x: 700,
      y: 300,
      worldX: 2400,
      worldY: 7200,
      mapId: 1,
      state: 'alive',
      remainingLoots: 5,
    }));
    expect(updated).toMatchObject({ worldX: 2400, worldY: 7200, mapId: 1 });
  });

  it('updateResource refuse une coordonnée non finie', async () => {
    const resource = { id: 'resource-1', type: 'wood', x: 600, y: 300, worldX: 1600, worldY: 8000, mapId: 1, state: 'alive', remainingLoots: 5 } as Resource;
    resourceRepo.findOne.mockResolvedValue(resource);

    await expect(service.updateResource('resource-1', { x: Infinity })).rejects.toBeInstanceOf(BadRequestException);
    expect(resourceRepo.save).not.toHaveBeenCalled();
  });

  it('getResourceWorldObjects retourne les WorldObjects adaptés', async () => {
    const resources: Resource[] = [
      { id: 'r-1', type: 'dead_tree', x: 400, y: 300, worldX: 1024, worldY: 2048, mapId: 1, state: 'alive', remainingLoots: 3 } as Resource,
      { id: 'r-2', type: 'ore',       x: 600, y: 400, worldX: null, worldY: null, mapId: null, state: 'dead',  remainingLoots: 0 } as Resource,
    ];
    resourceRepo.find.mockResolvedValue(resources);

    const result = await service.getResourceWorldObjects();

    expect(result).toHaveLength(2);

    expect(result[0]).toMatchObject({
      kind: 'entity',
      category: 'resource',
      id: 'r-1',
      type: 'dead_tree',
      mapId: 1,
      position: { worldX: 1024, worldY: 2048 },
      state: 'alive',
      remainingLoots: 3,
    });
    expect(result[0].capabilities).toContain('transform');
    expect(result[0].capabilities).toContain('harvestable');

    expect(result[1].position).toBeNull();
    expect(result[1].state).toBe('dead');
  });
});
