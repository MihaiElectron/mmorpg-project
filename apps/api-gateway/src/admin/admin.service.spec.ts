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
import { SkillDefinition } from '../skills/entities/skill-definition.entity';
import { PlayerSkill } from '../skills/entities/player-skill.entity';
import { CraftingRecipe } from '../crafting/entities/crafting-recipe.entity';
import { CraftingIngredient } from '../crafting/entities/crafting-ingredient.entity';
import { CraftingResult } from '../crafting/entities/crafting-result.entity';
import { CraftingStationTemplate } from '../crafting/entities/crafting-station-template.entity';
import { CraftingStation } from '../crafting/entities/crafting-station.entity';
import { Item } from '../items/entities/item.entity';
import { WorldService } from '../world/world.service';

const BASE_EMPTY_REPO = () => ({ count: jest.fn(), find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null), save: jest.fn().mockImplementation((v: any) => Promise.resolve(v)), create: jest.fn().mockImplementation((v: any) => v), delete: jest.fn() });

describe('AdminService resources', () => {
  let service: AdminService;
  let resourceRepo: Record<string, jest.Mock>;
  let resourceTemplateRepo: Record<string, jest.Mock>;
  let skillDefinitionRepo: Record<string, jest.Mock>;
  let playerSkillRepo: Record<string, jest.Mock>;
  let worldService: Record<string, jest.Mock>;

  beforeEach(async () => {
    resourceRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((resource) => Promise.resolve(resource)),
      create: jest.fn().mockImplementation((resource) => resource),
    };
    resourceTemplateRepo = {
      findOne: jest.fn().mockResolvedValue({ type: 'wood', defaultRemainingLoots: 7, respawnDelayMs: 30_000, lootPool: null, skillKey: null, gatheringXpReward: 0 }),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((tpl) => Promise.resolve(tpl)),
    };
    skillDefinitionRepo = {
      findOne: jest.fn().mockResolvedValue({ key: 'woodcutting' }),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
    };
    playerSkillRepo = {
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    worldService = {
      getConnectedCount: jest.fn().mockReturnValue(0),
      getMovementMetrics: jest.fn().mockReturnValue({
        totalMoves: 12,
        suspectTeleports: 1,
        suspectSpeed: 2,
        invalidCoordinates: 3,
        mapMismatch: 4,
      }),
      resetMovementMetrics: jest.fn().mockReturnValue({
        totalMoves: 0,
        suspectTeleports: 0,
        suspectSpeed: 0,
        invalidCoordinates: 0,
        mapMismatch: 0,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(CreatureTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CreatureSpawn), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Animal), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Character), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Resource), useValue: resourceRepo },
        { provide: getRepositoryToken(ResourceTemplate), useValue: resourceTemplateRepo },
        { provide: getRepositoryToken(SkillDefinition), useValue: skillDefinitionRepo },
        { provide: getRepositoryToken(PlayerSkill), useValue: playerSkillRepo },
        { provide: getRepositoryToken(CraftingRecipe), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingIngredient), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingResult), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingStationTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingStation), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Item), useValue: BASE_EMPTY_REPO() },
        { provide: WorldService, useValue: worldService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  // ── Movement metrics ─────────────────────────────────────────────────────────

  it('getMovementMetrics retourne les compteurs du WorldService', () => {
    const result = service.getMovementMetrics();

    expect(worldService.getMovementMetrics).toHaveBeenCalled();
    expect(result).toEqual({
      totalMoves: 12,
      suspectTeleports: 1,
      suspectSpeed: 2,
      invalidCoordinates: 3,
      mapMismatch: 4,
    });
  });

  it('resetMovementMetrics remet les compteurs via WorldService', () => {
    const result = service.resetMovementMetrics();

    expect(worldService.resetMovementMetrics).toHaveBeenCalled();
    expect(result).toEqual({
      totalMoves: 0,
      suspectTeleports: 0,
      suspectSpeed: 0,
      invalidCoordinates: 0,
      mapMismatch: 0,
    });
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

    it('met à jour defaultRemainingLoots si valeur valide', async () => {
      const updated = await service.updateResourceTemplate('wood', { defaultRemainingLoots: 50 });
      expect(resourceTemplateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ defaultRemainingLoots: 50 }),
      );
      expect(updated?.defaultRemainingLoots).toBe(50);
    });

    it('rejette defaultRemainingLoots < 1', async () => {
      await expect(service.updateResourceTemplate('wood', { defaultRemainingLoots: 0 }))
        .rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updateResourceTemplate('wood', { defaultRemainingLoots: -5 }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejette defaultRemainingLoots > 999_999', async () => {
      await expect(service.updateResourceTemplate('wood', { defaultRemainingLoots: 1_000_000 }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejette defaultRemainingLoots décimal', async () => {
      await expect(service.updateResourceTemplate('wood', { defaultRemainingLoots: 5.5 }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejette defaultRemainingLoots NaN', async () => {
      await expect(service.updateResourceTemplate('wood', { defaultRemainingLoots: NaN }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('met à jour les deux champs simultanément si les deux sont valides', async () => {
      const updated = await service.updateResourceTemplate('wood', {
        respawnDelayMs: 45_000,
        defaultRemainingLoots: 10,
      });
      expect(resourceTemplateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ respawnDelayMs: 45_000, defaultRemainingLoots: 10 }),
      );
      expect(updated?.respawnDelayMs).toBe(45_000);
      expect(updated?.defaultRemainingLoots).toBe(10);
    });

    it('met à jour gatheringXpReward si valeur valide', async () => {
      const updated = await service.updateResourceTemplate('wood', { gatheringXpReward: 10 });
      expect(resourceTemplateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ gatheringXpReward: 10 }),
      );
      expect(updated?.gatheringXpReward).toBe(10);
    });

    it('accepte gatheringXpReward = 0 (désactivation XP)', async () => {
      const updated = await service.updateResourceTemplate('wood', { gatheringXpReward: 0 });
      expect(updated?.gatheringXpReward).toBe(0);
    });

    it('rejette gatheringXpReward < 0', async () => {
      await expect(service.updateResourceTemplate('wood', { gatheringXpReward: -1 }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejette gatheringXpReward décimal', async () => {
      await expect(service.updateResourceTemplate('wood', { gatheringXpReward: 2.5 }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('met à jour skillKey si skill connu', async () => {
      skillDefinitionRepo.findOne.mockResolvedValue({ key: 'woodcutting' });
      const updated = await service.updateResourceTemplate('wood', { skillKey: 'woodcutting' });
      expect(resourceTemplateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ skillKey: 'woodcutting' }),
      );
      expect(updated?.skillKey).toBe('woodcutting');
    });

    it('accepte skillKey = null (suppression du skill)', async () => {
      const updated = await service.updateResourceTemplate('wood', { skillKey: null });
      expect(resourceTemplateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ skillKey: null }),
      );
      expect(updated?.skillKey).toBeNull();
    });

    it('rejette skillKey inexistant dans SkillDefinition', async () => {
      skillDefinitionRepo.findOne.mockResolvedValue(null);
      await expect(service.updateResourceTemplate('wood', { skillKey: 'unknown_skill' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejette skillKey chaîne vide", async () => {
      await expect(service.updateResourceTemplate('wood', { skillKey: '' as any }))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('createResource WU-only : calcule pixel cache et écrit worldX/worldY/mapId', async () => {
    // worldX=1600, worldY=8000 → screenX=600, screenY=300
    const resource = await service.createResource('wood', 1600, 8000);

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

  it('updateResource recalcule x/y pixel cache depuis worldX/worldY', async () => {
    const resource = { id: 'resource-1', type: 'wood', x: 600, y: 300, worldX: 1600, worldY: 8000, mapId: 1, state: 'dead', remainingLoots: 0 } as Resource;
    resourceRepo.findOne.mockResolvedValue(resource);

    // worldX=2400, worldY=7200 → screenX=700, screenY=300
    const updated = await service.updateResource('resource-1', { worldX: 2400, worldY: 7200 });

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

    await expect(service.updateResource('resource-1', { worldX: Infinity })).rejects.toBeInstanceOf(BadRequestException);
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

// ─── AdminService — SkillDefinitions ─────────────────────────────────────────

describe('AdminService — createSkillDefinition', () => {
  let service: AdminService;
  let skillDefinitionRepo: Record<string, jest.Mock>;
  let playerSkillRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    skillDefinitionRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => Promise.resolve({ ...v, id: 'new-uuid', createdAt: new Date(), updatedAt: new Date() })),
    };
    playerSkillRepo = { count: jest.fn().mockResolvedValue(0), findOne: jest.fn(), save: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(CreatureTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CreatureSpawn), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Animal), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Character), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Resource), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(ResourceTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(SkillDefinition), useValue: skillDefinitionRepo },
        { provide: getRepositoryToken(PlayerSkill), useValue: playerSkillRepo },
        { provide: getRepositoryToken(CraftingRecipe), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingIngredient), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingResult), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingStationTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingStation), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Item), useValue: BASE_EMPTY_REPO() },
        { provide: WorldService, useValue: { getConnectedCount: jest.fn() } },
      ],
    }).compile();
    service = module.get<AdminService>(AdminService);
  });

  it('crée un skill avec les champs valides', async () => {
    const sd = await service.createSkillDefinition({ key: 'fishing', name: 'Fishing', category: 'gathering' });
    expect(skillDefinitionRepo.save).toHaveBeenCalled();
    expect(sd.key).toBe('fishing');
    expect(sd.name).toBe('Fishing');
  });

  it('applique les valeurs par défaut si champs optionnels absents', async () => {
    await service.createSkillDefinition({ key: 'skinning', name: 'Skinning' });
    const created = skillDefinitionRepo.create.mock.calls[0][0];
    expect(created.category).toBe('general');
    expect(created.maxLevel).toBe(100);
    expect(created.baseXpPerLevel).toBe(100);
    expect(created.xpCurveExponent).toBe(1.5);
    expect(created.enabled).toBe(true);
  });

  it('rejette une key dupliquée', async () => {
    skillDefinitionRepo.findOne.mockResolvedValue({ key: 'woodcutting' });
    await expect(service.createSkillDefinition({ key: 'woodcutting', name: 'Woodcutting' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette une key en CamelCase (pas snake_case)', async () => {
    await expect(service.createSkillDefinition({ key: 'FishingSkill', name: 'Fishing' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette une key trop courte (1 caractère)', async () => {
    await expect(service.createSkillDefinition({ key: 'f', name: 'Fishing' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette une key avec tiret', async () => {
    await expect(service.createSkillDefinition({ key: 'fish-ing', name: 'Fishing' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette un name vide', async () => {
    await expect(service.createSkillDefinition({ key: 'fishing', name: '' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette une category invalide', async () => {
    await expect(service.createSkillDefinition({ key: 'fishing', name: 'Fishing', category: 'My Category' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette maxLevel < 2', async () => {
    await expect(service.createSkillDefinition({ key: 'fishing', name: 'Fishing', maxLevel: 1 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette xpCurveExponent hors bornes 1.0–3.0', async () => {
    await expect(service.createSkillDefinition({ key: 'fishing', name: 'Fishing', xpCurveExponent: 0.5 }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createSkillDefinition({ key: 'fishing', name: 'Fishing', xpCurveExponent: 3.1 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AdminService — updateSkillDefinition', () => {
  let service: AdminService;
  let skillDefinitionRepo: Record<string, jest.Mock>;
  let playerSkillRepo: Record<string, jest.Mock>;

  function makeSd(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { id: 'sd-1', key: 'woodcutting', name: 'Woodcutting', category: 'gathering', maxLevel: 100, baseXpPerLevel: 100, xpCurveExponent: 1.5, enabled: true, ...overrides };
  }

  beforeEach(async () => {
    skillDefinitionRepo = {
      findOne: jest.fn().mockResolvedValue(makeSd()),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
    };
    playerSkillRepo = { count: jest.fn().mockResolvedValue(0), findOne: jest.fn(), save: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(CreatureTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CreatureSpawn), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Animal), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Character), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Resource), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(ResourceTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(SkillDefinition), useValue: skillDefinitionRepo },
        { provide: getRepositoryToken(PlayerSkill), useValue: playerSkillRepo },
        { provide: getRepositoryToken(CraftingRecipe), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingIngredient), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingResult), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingStationTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingStation), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Item), useValue: BASE_EMPTY_REPO() },
        { provide: WorldService, useValue: { getConnectedCount: jest.fn() } },
      ],
    }).compile();
    service = module.get<AdminService>(AdminService);
  });

  it('met à jour les champs autorisés', async () => {
    const updated = await service.updateSkillDefinition('sd-1', { name: 'Bûcheronnage', maxLevel: 50, enabled: false });
    expect(updated?.name).toBe('Bûcheronnage');
    expect(updated?.maxLevel).toBe(50);
    expect(updated?.enabled).toBe(false);
  });

  it('retourne null si id introuvable', async () => {
    skillDefinitionRepo.findOne.mockResolvedValue(null);
    const result = await service.updateSkillDefinition('unknown', { name: 'X' });
    expect(result).toBeNull();
  });

  it('rejette xpCurveExponent > 3.0', async () => {
    await expect(service.updateSkillDefinition('sd-1', { xpCurveExponent: 4.0 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette xpCurveExponent < 1.0', async () => {
    await expect(service.updateSkillDefinition('sd-1', { xpCurveExponent: 0.9 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejette maxLevel sous le niveau d'un PlayerSkill existant", async () => {
    playerSkillRepo.count.mockResolvedValue(1);
    await expect(service.updateSkillDefinition('sd-1', { maxLevel: 5 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepte maxLevel réduit si aucun joueur n'est au-dessus", async () => {
    playerSkillRepo.count.mockResolvedValue(0);
    const updated = await service.updateSkillDefinition('sd-1', { maxLevel: 50 });
    expect(updated?.maxLevel).toBe(50);
  });

  it('rejette category invalide', async () => {
    await expect(service.updateSkillDefinition('sd-1', { category: 'my-category' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette name vide', async () => {
    await expect(service.updateSkillDefinition('sd-1', { name: '' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── AdminService — CraftingRecipes ───────────────────────────────────────────

function makeCraftingTestModule(recipeRepo: any, ingredientRepo: any, resultRepo: any, itemRepo: any, sdRepo: any) {
  return Test.createTestingModule({
    providers: [
      AdminService,
      { provide: getRepositoryToken(CreatureTemplate), useValue: BASE_EMPTY_REPO() },
      { provide: getRepositoryToken(CreatureSpawn), useValue: BASE_EMPTY_REPO() },
      { provide: getRepositoryToken(Animal), useValue: BASE_EMPTY_REPO() },
      { provide: getRepositoryToken(Character), useValue: BASE_EMPTY_REPO() },
      { provide: getRepositoryToken(Resource), useValue: BASE_EMPTY_REPO() },
      { provide: getRepositoryToken(ResourceTemplate), useValue: BASE_EMPTY_REPO() },
      { provide: getRepositoryToken(SkillDefinition), useValue: sdRepo },
      { provide: getRepositoryToken(PlayerSkill), useValue: BASE_EMPTY_REPO() },
      { provide: getRepositoryToken(CraftingRecipe), useValue: recipeRepo },
      { provide: getRepositoryToken(CraftingIngredient), useValue: ingredientRepo },
      { provide: getRepositoryToken(CraftingResult), useValue: resultRepo },
      { provide: getRepositoryToken(CraftingStationTemplate), useValue: BASE_EMPTY_REPO() },
      { provide: getRepositoryToken(CraftingStation), useValue: BASE_EMPTY_REPO() },
      { provide: getRepositoryToken(Item), useValue: itemRepo },
      { provide: WorldService, useValue: { getConnectedCount: jest.fn() } },
    ],
  }).compile();
}

describe('AdminService — createCraftingRecipe', () => {
  let service: AdminService;
  let recipeRepo: Record<string, jest.Mock>;
  let sdRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    recipeRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => Promise.resolve({ ...v, id: 'rec-new' })),
    };
    sdRepo = { findOne: jest.fn().mockResolvedValue({ key: 'smithing' }), find: jest.fn().mockResolvedValue([]) };
    const module = await makeCraftingTestModule(recipeRepo, BASE_EMPTY_REPO(), BASE_EMPTY_REPO(), BASE_EMPTY_REPO(), sdRepo);
    service = module.get<AdminService>(AdminService);
  });

  it('crée une recette avec les champs valides', async () => {
    const r = await service.createCraftingRecipe({ key: 'test_recipe', name: 'Test', requiredSkillKey: 'smithing' });
    expect(recipeRepo.save).toHaveBeenCalled();
    expect(r.key).toBe('test_recipe');
  });

  it('applique les valeurs par défaut', async () => {
    await service.createCraftingRecipe({ key: 'test_recipe', name: 'Test' });
    const created = recipeRepo.create.mock.calls[0][0];
    expect(created.enabled).toBe(true);
    expect(created.xpReward).toBe(10);
    expect(created.stationType).toBe('none');
  });

  it('rejette une key dupliquée', async () => {
    recipeRepo.findOne.mockResolvedValue({ key: 'test_recipe' });
    await expect(service.createCraftingRecipe({ key: 'test_recipe', name: 'Test' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette une key en CamelCase', async () => {
    await expect(service.createCraftingRecipe({ key: 'TestRecipe', name: 'Test' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette requiredSkillKey inexistant', async () => {
    sdRepo.findOne.mockResolvedValue(null);
    await expect(service.createCraftingRecipe({ key: 'test_r', name: 'Test', requiredSkillKey: 'unknown' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette baseSuccessRate > 1', async () => {
    await expect(service.createCraftingRecipe({ key: 'test_r', name: 'Test', baseSuccessRate: 1.5 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette minSuccessRate > maxSuccessRate', async () => {
    await expect(service.createCraftingRecipe({ key: 'test_r', name: 'Test', minSuccessRate: 0.8, maxSuccessRate: 0.5 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette xpReward négatif', async () => {
    await expect(service.createCraftingRecipe({ key: 'test_r', name: 'Test', xpReward: -1 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AdminService — addIngredient / addResult', () => {
  let service: AdminService;
  let recipeRepo: Record<string, jest.Mock>;
  let ingredientRepo: Record<string, jest.Mock>;
  let resultRepo: Record<string, jest.Mock>;
  let itemRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    recipeRepo = { findOne: jest.fn().mockResolvedValue({ id: 'rec-1', key: 'r' }), find: jest.fn().mockResolvedValue([]), create: jest.fn().mockImplementation((v) => v), save: jest.fn().mockImplementation((v) => Promise.resolve(v)) };
    ingredientRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation((v) => v), save: jest.fn().mockImplementation((v) => Promise.resolve(v)), delete: jest.fn() };
    resultRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation((v) => v), save: jest.fn().mockImplementation((v) => Promise.resolve(v)), delete: jest.fn() };
    itemRepo = { findOne: jest.fn().mockResolvedValue({ id: 'item-1', name: 'Iron Ore' }), find: jest.fn().mockResolvedValue([]) };
    const module = await makeCraftingTestModule(recipeRepo, ingredientRepo, resultRepo, itemRepo, BASE_EMPTY_REPO());
    service = module.get<AdminService>(AdminService);
  });

  it('addIngredient crée un ingrédient valide', async () => {
    const ing = await service.addIngredient('rec-1', 'item-1', 3);
    expect(ingredientRepo.save).toHaveBeenCalled();
    expect(ing.requiredQuantity).toBe(3);
  });

  it('addIngredient rejette item inexistant', async () => {
    itemRepo.findOne.mockResolvedValue(null);
    await expect(service.addIngredient('rec-1', 'bad-item', 1))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('addIngredient rejette quantity < 1', async () => {
    await expect(service.addIngredient('rec-1', 'item-1', 0))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('addResult crée un résultat valide', async () => {
    const res = await service.addResult('rec-1', 'item-1', 1, 0.8);
    expect(resultRepo.save).toHaveBeenCalled();
    expect(res.chance).toBe(0.8);
  });

  it('addResult rejette item inexistant', async () => {
    itemRepo.findOne.mockResolvedValue(null);
    await expect(service.addResult('rec-1', 'bad-item', 1, 1.0))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('addResult rejette chance > 1', async () => {
    await expect(service.addResult('rec-1', 'item-1', 1, 1.5))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('removeIngredient retourne null si introuvable', async () => {
    const result = await service.removeIngredient('unknown');
    expect(result).toBeNull();
  });

  it('removeIngredient supprime et retourne', async () => {
    const existing = { id: 'ing-1', itemId: 'item-1', requiredQuantity: 2 };
    ingredientRepo.findOne.mockResolvedValue(existing);
    const removed = await service.removeIngredient('ing-1');
    expect(ingredientRepo.delete).toHaveBeenCalledWith('ing-1');
    expect(removed).toEqual(existing);
  });
});

describe('AdminService — validateCraftingRecipe', () => {
  let service: AdminService;
  let recipeRepo: Record<string, jest.Mock>;
  let sdRepo: Record<string, jest.Mock>;
  let itemRepo: Record<string, jest.Mock>;

  function makeFullRecipe(): any {
    return {
      id: 'rec-1',
      key: 'iron_bar_from_ore',
      name: 'Lingot de fer',
      enabled: true,
      requiredSkillKey: 'smithing',
      baseSuccessRate: 1.0,
      minSuccessRate: 0.05,
      maxSuccessRate: 1.0,
      xpReward: 10,
      ingredients: [{ id: 'ing-1', itemId: 'item-1', requiredQuantity: 3 }],
      results: [{ id: 'res-1', itemId: 'item-2', producedQuantity: 1, chance: 1.0 }],
    };
  }

  beforeEach(async () => {
    recipeRepo = { findOne: jest.fn().mockResolvedValue(makeFullRecipe()), find: jest.fn().mockResolvedValue([]), create: jest.fn().mockImplementation((v) => v), save: jest.fn().mockImplementation((v) => Promise.resolve(v)) };
    sdRepo = { findOne: jest.fn().mockResolvedValue({ key: 'smithing' }), find: jest.fn().mockResolvedValue([]) };
    itemRepo = { findOne: jest.fn().mockResolvedValue({ id: 'item-1' }), find: jest.fn().mockResolvedValue([]) };
    const module = await makeCraftingTestModule(recipeRepo, BASE_EMPTY_REPO(), BASE_EMPTY_REPO(), itemRepo, sdRepo);
    service = module.get<AdminService>(AdminService);
  });

  it('retourne valid=true pour une recette complète', async () => {
    const result = await service.validateCraftingRecipe('rec-1');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('erreur si aucun ingrédient', async () => {
    recipeRepo.findOne.mockResolvedValue({ ...makeFullRecipe(), ingredients: [] });
    const result = await service.validateCraftingRecipe('rec-1');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /ingrédient/i.test(e))).toBe(true);
  });

  it('erreur si skill inexistant', async () => {
    sdRepo.findOne.mockResolvedValue(null);
    const result = await service.validateCraftingRecipe('rec-1');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /skill/i.test(e))).toBe(true);
  });

  it('avertissement si recette désactivée', async () => {
    recipeRepo.findOne.mockResolvedValue({ ...makeFullRecipe(), enabled: false });
    const result = await service.validateCraftingRecipe('rec-1');
    expect(result.warnings.some((w) => /désactivée/i.test(w))).toBe(true);
  });

  it('avertissement si xpReward = 0', async () => {
    recipeRepo.findOne.mockResolvedValue({ ...makeFullRecipe(), xpReward: 0 });
    const result = await service.validateCraftingRecipe('rec-1');
    expect(result.warnings.some((w) => /xpReward/i.test(w))).toBe(true);
  });

  it('retourne valid=false si recette introuvable', async () => {
    recipeRepo.findOne.mockResolvedValue(null);
    const result = await service.validateCraftingRecipe('unknown');
    expect(result.valid).toBe(false);
  });
});
