import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AdminService } from './admin.service';
import { CreatureTemplate } from '../creatures/entities/creature-template.entity';
import { CreatureSpawn } from '../creatures/entities/creature-spawn.entity';
import { Creature } from '../creatures/entities/creature.entity';
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
import { InventoryProjectionService } from '../inventory/projection/inventory-projection.service';
import { SkillsService } from '../skills/skills.service';
import { EconomyService } from '../economy/economy.service';
import { GameConfigService } from '../game-config/game-config.service';

const BASE_EMPTY_REPO = () => ({ count: jest.fn(), find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null), save: jest.fn().mockImplementation((v: any) => Promise.resolve(v)), create: jest.fn().mockImplementation((v: any) => v), delete: jest.fn() });

// Fake DataSource dont `.transaction()` exécute réellement le callback avec un
// manager minimal (`update` mocké) — suffisant pour tester recalculateCharacterProgression
// sans DB réelle.
const makeFakeDataSource = () => ({
  transaction: jest.fn().mockImplementation(async (cb: (manager: any) => Promise<any>) => {
    const manager = { update: jest.fn().mockResolvedValue({}) };
    return cb(manager);
  }),
});

describe('AdminService resources', () => {
  let service: AdminService;
  let resourceRepo: Record<string, jest.Mock>;
  let resourceTemplateRepo: Record<string, jest.Mock>;
  let creatureTemplateRepo: Record<string, jest.Mock>;
  let skillDefinitionRepo: Record<string, jest.Mock>;
  let playerSkillRepo: Record<string, jest.Mock>;
  let itemRepo: Record<string, jest.Mock>;
  let characterRepo: Record<string, jest.Mock>;
  let worldService: Record<string, jest.Mock>;

  beforeEach(async () => {
    characterRepo = BASE_EMPTY_REPO();
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
    creatureTemplateRepo = {
      findOne: jest.fn().mockResolvedValue({ key: 'turkey', name: 'Turkey', lootPool: null }),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((tpl) => Promise.resolve(tpl)),
      create: jest.fn().mockImplementation((tpl) => tpl),
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
    itemRepo = {
      ...BASE_EMPTY_REPO(),
      find: jest.fn().mockResolvedValue([
        { id: 'item-wooden-stick', category: 'wooden_stick' },
        { id: 'item-iron-ore', category: 'iron_ore' },
      ]),
    };
    worldService = {
      getConnectedCount: jest.fn().mockReturnValue(0),
      getConnectedPlayerByCharacterId: jest.fn().mockReturnValue(null),
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
        { provide: InventoryProjectionService, useValue: { project: jest.fn().mockResolvedValue([]) } },
        { provide: SkillsService, useValue: { getCharacterSkills: jest.fn().mockResolvedValue([]) } },
        { provide: EconomyService, useValue: { readBalanceBronze: jest.fn().mockResolvedValue(0n) } },
        { provide: GameConfigService, useValue: { getConfig: jest.fn(), updateConfig: jest.fn() } },
        { provide: DataSource, useValue: makeFakeDataSource() },
        { provide: getRepositoryToken(CreatureTemplate), useValue: creatureTemplateRepo },
        { provide: getRepositoryToken(CreatureSpawn), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Creature), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Character), useValue: characterRepo },
        { provide: getRepositoryToken(Resource), useValue: resourceRepo },
        { provide: getRepositoryToken(ResourceTemplate), useValue: resourceTemplateRepo },
        { provide: getRepositoryToken(SkillDefinition), useValue: skillDefinitionRepo },
        { provide: getRepositoryToken(PlayerSkill), useValue: playerSkillRepo },
        { provide: getRepositoryToken(CraftingRecipe), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingIngredient), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingResult), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingStationTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingStation), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
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

  // ── Character stats V1 ───────────────────────────────────────────────────────

  function makeCharacterRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'char-1',
      name: 'Héros',
      level: 3,
      experience: 40,
      health: 80,
      maxHealth: 100,
      attack: 12,
      defense: 6,
      baseStrength: 5,
      baseVitality: 4,
      baseEndurance: 2,
      baseAgility: 0,
      baseDexterity: 0,
      baseIntelligence: 0,
      baseWisdom: 0,
      baseCritical: 0,
      unspentStatPoints: 10,
      ...overrides,
    };
  }

  it('getCharacters enrichit chaque personnage avec stats.derived', async () => {
    characterRepo.find.mockResolvedValue([makeCharacterRow()]);

    const result = await service.getCharacters();

    expect(result[0].stats).toBeDefined();
    // derived : maxHealth 100 + vitality(4)*10, physicalAttack 12 + strength(5)*2
    expect(result[0].stats.derived.maxHealth).toBe(140);
    expect(result[0].stats.derived.physicalAttack).toBe(22);
    expect(result[0].stats.base.strength).toBe(5);
  });

  it('updateCharacter applique les champs et retourne stats recalculées', async () => {
    const row = makeCharacterRow({ baseStrength: 0 });
    characterRepo.findOne.mockResolvedValue(row);

    const result = await service.updateCharacter('char-1', { baseStrength: 7, unspentStatPoints: 3 });

    expect(result).not.toBeNull();
    expect(result!.baseStrength).toBe(7);
    expect(result!.unspentStatPoints).toBe(3);
    // physicalAttack = attack(12) + strength(7)*2 = 26
    expect(result!.stats.derived.physicalAttack).toBe(26);
  });

  it('updateCharacter retourne null si le personnage est introuvable', async () => {
    characterRepo.findOne.mockResolvedValue(null);
    const result = await service.updateCharacter('absent', { level: 5 });
    expect(result).toBeNull();
  });

  // ── getCharacterDetails (Player Inspector read-only) ──────────────────────────

  it('getCharacterDetails retourne un snapshot inventaire/équipement/skills/stats', async () => {
    characterRepo.findOne.mockResolvedValue(
      makeCharacterRow({
        equipment: [
          { slot: 'right-hand', itemInstanceId: 'inst-1', item: { id: 'sword', name: 'Épée', image: null, type: 'weapon' } },
        ],
      }),
    );

    const result = await service.getCharacterDetails('char-1');

    expect(result).not.toBeNull();
    expect(result!.character.id).toBe('char-1');
    expect(result!.character.connected).toBe(false); // worldService mock → non connecté
    // stats dérivées calculées serveur (lecture seule)
    expect(result!.character.stats.derived.physicalAttack).toBe(22); // attack 12 + strength(5)*2
    expect(typeof result!.character.combat.attackRangeWU).toBe('number');
    // équipement mappé compact par slot
    expect(result!.equipment).toEqual([
      { slot: 'right-hand', itemInstanceId: 'inst-1', itemId: 'sword', name: 'Épée', image: null, type: 'weapon', equipSlot: null, objectMode: null },
    ]);
    // inventaire/skills via services délégués (mocks → tableaux vides)
    expect(result!.inventory).toEqual([]);
    expect(result!.skills).toEqual([]);
    // wallet lecture seule (mock readBalanceBronze → 0n)
    expect(result!.character.wallet).toEqual({ gold: 0, silver: 0, bronze: 0 });
  });

  it('getCharacterDetails retourne null si le personnage est introuvable', async () => {
    characterRepo.findOne.mockResolvedValue(null);
    const result = await service.getCharacterDetails('absent');
    expect(result).toBeNull();
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

    it('met à jour le lootPool ressource avec des entrées valides', async () => {
      const lootPool = [
        { itemId: 'wooden_stick', minQty: 1, maxQty: 3, probability: 0.75 },
        { itemId: 'item-iron-ore', minQty: 2, maxQty: 2, probability: 1 },
      ];

      const updated = await service.updateResourceTemplate('wood', { lootPool });

      expect(itemRepo.find).toHaveBeenCalled();
      expect(resourceTemplateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ lootPool }),
      );
      expect(updated?.lootPool).toEqual(lootPool);
    });

    it('rejette un lootPool ressource avec probabilité zéro', async () => {
      await expect(
        service.updateResourceTemplate('wood', {
          lootPool: [{ itemId: 'wooden_stick', minQty: 1, maxQty: 1, probability: 0 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(resourceTemplateRepo.save).not.toHaveBeenCalled();
    });

    it('rejette un lootPool ressource dont maxQty est inférieur à minQty', async () => {
      await expect(
        service.updateResourceTemplate('wood', {
          lootPool: [{ itemId: 'wooden_stick', minQty: 3, maxQty: 2, probability: 0.5 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(resourceTemplateRepo.save).not.toHaveBeenCalled();
    });

    it('rejette un lootPool ressource avec item inconnu', async () => {
      await expect(
        service.updateResourceTemplate('wood', {
          lootPool: [{ itemId: 'unknown_item', minQty: 1, maxQty: 1, probability: 1 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(resourceTemplateRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('updateTemplate lootPool', () => {
    it('met à jour le lootPool créature avec des entrées valides', async () => {
      const lootPool = [{ itemId: 'wooden_stick', minQty: 1, maxQty: 1, probability: 0.4 }];

      const updated = await service.updateTemplate('turkey', { lootPool });

      expect(itemRepo.find).toHaveBeenCalled();
      expect(creatureTemplateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ lootPool }),
      );
      expect(updated?.lootPool).toEqual(lootPool);
    });

    it('retourne null si le template créature est introuvable', async () => {
      creatureTemplateRepo.findOne.mockResolvedValue(null);

      const result = await service.updateTemplate('unknown', {
        lootPool: [{ itemId: 'wooden_stick', minQty: 1, maxQty: 1, probability: 1 }],
      });

      expect(result).toBeNull();
      expect(itemRepo.find).not.toHaveBeenCalled();
      expect(creatureTemplateRepo.save).not.toHaveBeenCalled();
    });
  });

  it('createResource WU-only : écrit worldX/worldY/mapId sans cache pixel', async () => {
    const resource = await service.createResource('wood', 1600, 8000);

    expect(resourceRepo.create).toHaveBeenCalledWith({
      type: 'wood',
      worldX: 1600,
      worldY: 8000,
      mapId: 1,
      remainingLoots: 7,
    });
    expect(resource).toMatchObject({ worldX: 1600, worldY: 8000, mapId: 1 });
  });

  it('updateResource met à jour worldX/worldY/mapId sans cache pixel', async () => {
    const resource = { id: 'resource-1', type: 'wood', worldX: 1600, worldY: 8000, mapId: 1, state: 'dead', remainingLoots: 0 } as Resource;
    resourceRepo.findOne.mockResolvedValue(resource);

    const updated = await service.updateResource('resource-1', { worldX: 2400, worldY: 7200 });

    expect(resourceRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      worldX: 2400,
      worldY: 7200,
      mapId: 1,
      state: 'alive',
      remainingLoots: 5,
    }));
    expect(updated).toMatchObject({ worldX: 2400, worldY: 7200, mapId: 1 });
  });

  it('updateResource refuse une coordonnée non finie', async () => {
    const resource = { id: 'resource-1', type: 'wood', worldX: 1600, worldY: 8000, mapId: 1, state: 'alive', remainingLoots: 5 } as Resource;
    resourceRepo.findOne.mockResolvedValue(resource);

    await expect(service.updateResource('resource-1', { worldX: Infinity })).rejects.toBeInstanceOf(BadRequestException);
    expect(resourceRepo.save).not.toHaveBeenCalled();
  });

  it('getResourceWorldObjects retourne les WorldObjects adaptés', async () => {
    const resources: Resource[] = [
      { id: 'r-1', type: 'dead_tree', worldX: 1024, worldY: 2048, mapId: 1, state: 'alive', remainingLoots: 3 } as Resource,
      { id: 'r-2', type: 'ore',       worldX: null, worldY: null, mapId: null, state: 'dead',  remainingLoots: 0 } as Resource,
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
        { provide: InventoryProjectionService, useValue: { project: jest.fn().mockResolvedValue([]) } },
        { provide: SkillsService, useValue: { getCharacterSkills: jest.fn().mockResolvedValue([]) } },
        { provide: EconomyService, useValue: { readBalanceBronze: jest.fn().mockResolvedValue(0n) } },
        { provide: GameConfigService, useValue: { getConfig: jest.fn(), updateConfig: jest.fn() } },
        { provide: DataSource, useValue: makeFakeDataSource() },
        { provide: getRepositoryToken(CreatureTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CreatureSpawn), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Creature), useValue: BASE_EMPTY_REPO() },
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
        { provide: InventoryProjectionService, useValue: { project: jest.fn().mockResolvedValue([]) } },
        { provide: SkillsService, useValue: { getCharacterSkills: jest.fn().mockResolvedValue([]) } },
        { provide: EconomyService, useValue: { readBalanceBronze: jest.fn().mockResolvedValue(0n) } },
        { provide: GameConfigService, useValue: { getConfig: jest.fn(), updateConfig: jest.fn() } },
        { provide: DataSource, useValue: makeFakeDataSource() },
        { provide: getRepositoryToken(CreatureTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CreatureSpawn), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Creature), useValue: BASE_EMPTY_REPO() },
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
      { provide: InventoryProjectionService, useValue: { project: jest.fn().mockResolvedValue([]) } },
      { provide: SkillsService, useValue: { getCharacterSkills: jest.fn().mockResolvedValue([]) } },
      { provide: EconomyService, useValue: { readBalanceBronze: jest.fn().mockResolvedValue(0n) } },
      { provide: GameConfigService, useValue: { getConfig: jest.fn(), updateConfig: jest.fn() } },
      { provide: DataSource, useValue: makeFakeDataSource() },
      { provide: getRepositoryToken(CreatureTemplate), useValue: BASE_EMPTY_REPO() },
      { provide: getRepositoryToken(CreatureSpawn), useValue: BASE_EMPTY_REPO() },
      { provide: getRepositoryToken(Creature), useValue: BASE_EMPTY_REPO() },
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

  it('applique les valeurs par défaut (durée = 3000 ms mini)', async () => {
    await service.createCraftingRecipe({ key: 'test_recipe', name: 'Test' });
    const created = recipeRepo.create.mock.calls[0][0];
    expect(created.enabled).toBe(true);
    expect(created.xpReward).toBe(10);
    expect(created.stationType).toBe('none');
    expect(created.craftTimeMs).toBe(3000); // aucune recette instantanée
  });

  it('rejette une durée < 3000 ms (create)', async () => {
    for (const craftTimeMs of [0, 500, 1000, 2000]) {
      await expect(service.createCraftingRecipe({ key: 'test_r', name: 'Test', craftTimeMs }))
        .rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('accepte une durée >= 3000 ms (create)', async () => {
    const r = await service.createCraftingRecipe({ key: 'test_r', name: 'Test', craftTimeMs: 3000 });
    expect(r).toBeDefined();
    expect(recipeRepo.save).toHaveBeenCalled();
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

  it('addIngredient rejette un doublon item dans la même recette', async () => {
    ingredientRepo.findOne.mockResolvedValue({ id: 'ing-existing', itemId: 'item-1' });
    await expect(service.addIngredient('rec-1', 'item-1', 3))
      .rejects.toBeInstanceOf(BadRequestException);
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

  it('addResult rejette un doublon item dans la même recette', async () => {
    resultRepo.findOne.mockResolvedValue({ id: 'res-existing', itemId: 'item-1' });
    await expect(service.addResult('rec-1', 'item-1', 1, 1.0))
      .rejects.toBeInstanceOf(BadRequestException);
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

  it('replaceCraftingIngredients remplace la liste avec quantités valides', async () => {
    recipeRepo.findOne
      .mockResolvedValueOnce({ id: 'rec-1', key: 'r', ingredients: [], results: [] })
      .mockResolvedValueOnce({
        id: 'rec-1',
        key: 'r',
        ingredients: [{ recipeId: 'rec-1', itemId: 'item-1', requiredQuantity: 4 }],
        results: [],
      });
    itemRepo.find.mockResolvedValue([{ id: 'item-1' }]);

    const updated = await service.replaceCraftingIngredients('rec-1', [
      { itemId: 'item-1', requiredQuantity: 4 },
    ]);

    expect(ingredientRepo.delete).toHaveBeenCalledWith({ recipeId: 'rec-1' });
    expect(ingredientRepo.save).toHaveBeenCalledWith([
      { recipeId: 'rec-1', itemId: 'item-1', requiredQuantity: 4 },
    ]);
    expect(updated?.ingredients).toEqual([
      { recipeId: 'rec-1', itemId: 'item-1', requiredQuantity: 4 },
    ]);
  });

  it('replaceCraftingIngredients rejette les doublons item', async () => {
    await expect(
      service.replaceCraftingIngredients('rec-1', [
        { itemId: 'item-1', requiredQuantity: 1 },
        { itemId: 'item-1', requiredQuantity: 2 },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ingredientRepo.delete).not.toHaveBeenCalled();
  });

  it('replaceCraftingIngredients rejette une liste vide', async () => {
    await expect(service.replaceCraftingIngredients('rec-1', []))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(ingredientRepo.delete).not.toHaveBeenCalled();
  });

  it('replaceCraftingResults remplace la liste et impose au moins un résultat', async () => {
    recipeRepo.findOne
      .mockResolvedValueOnce({ id: 'rec-1', key: 'r', ingredients: [], results: [] })
      .mockResolvedValueOnce({
        id: 'rec-1',
        key: 'r',
        ingredients: [],
        results: [{ recipeId: 'rec-1', itemId: 'item-1', producedQuantity: 1, chance: 0.5 }],
      });
    itemRepo.find.mockResolvedValue([{ id: 'item-1' }]);

    const updated = await service.replaceCraftingResults('rec-1', [
      { itemId: 'item-1', producedQuantity: 1, chance: 0.5 },
    ]);

    expect(resultRepo.delete).toHaveBeenCalledWith({ recipeId: 'rec-1' });
    expect(resultRepo.save).toHaveBeenCalledWith([
      { recipeId: 'rec-1', itemId: 'item-1', producedQuantity: 1, chance: 0.5 },
    ]);
    expect(updated?.results).toEqual([
      { recipeId: 'rec-1', itemId: 'item-1', producedQuantity: 1, chance: 0.5 },
    ]);
  });

  it('replaceCraftingResults rejette une liste vide', async () => {
    await expect(service.replaceCraftingResults('rec-1', []))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(resultRepo.delete).not.toHaveBeenCalled();
  });

  it('replaceCraftingResults rejette un item inexistant', async () => {
    itemRepo.find.mockResolvedValue([]);
    await expect(
      service.replaceCraftingResults('rec-1', [
        { itemId: 'missing-item', producedQuantity: 1, chance: 1 },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(resultRepo.delete).not.toHaveBeenCalled();
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
      craftTimeMs: 3000,
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

  it('erreur si durée < 3 secondes', async () => {
    recipeRepo.findOne.mockResolvedValue({ ...makeFullRecipe(), craftTimeMs: 2000 });
    const result = await service.validateCraftingRecipe('rec-1');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /3 secondes/i.test(e))).toBe(true);
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

describe('createCreatureTemplate', () => {
  let service: AdminService;
  let templateRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    templateRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((v: any) => Promise.resolve(v)),
      create: jest.fn().mockImplementation((v: any) => v),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: InventoryProjectionService, useValue: { project: jest.fn().mockResolvedValue([]) } },
        { provide: SkillsService, useValue: { getCharacterSkills: jest.fn().mockResolvedValue([]) } },
        { provide: EconomyService, useValue: { readBalanceBronze: jest.fn().mockResolvedValue(0n) } },
        { provide: GameConfigService, useValue: { getConfig: jest.fn(), updateConfig: jest.fn() } },
        { provide: DataSource, useValue: makeFakeDataSource() },
        { provide: getRepositoryToken(CreatureTemplate), useValue: templateRepo },
        { provide: getRepositoryToken(CreatureSpawn), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Creature), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Character), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Resource), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(ResourceTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(SkillDefinition), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(PlayerSkill), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingRecipe), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingIngredient), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingResult), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingStationTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingStation), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Item), useValue: BASE_EMPTY_REPO() },
        { provide: WorldService, useValue: { getMovementMetrics: jest.fn(), resetMovementMetrics: jest.fn(), getConnectedCount: jest.fn().mockReturnValue(0) } },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('crée une créature avec les valeurs par défaut', async () => {
    const result = await service.createCreatureTemplate({ key: 'test_mob', name: 'Test Mob' });
    expect(result.key).toBe('test_mob');
    expect(result.name).toBe('Test Mob');
    expect(result.textureKey).toBe('turkey');
    expect(result.baseHealth).toBe(30);
    expect(result.baseAttack).toBe(3);
    expect(result.respawnDelayMs).toBe(20_000);
    expect(templateRepo.save).toHaveBeenCalled();
  });

  it('crée avec textureKey fourni', async () => {
    const result = await service.createCreatureTemplate({ key: 'goblin', name: 'Goblin', textureKey: 'goblin_sprite' });
    expect(result.textureKey).toBe('goblin_sprite');
  });

  it('refuse une key non snake_case', async () => {
    await expect(service.createCreatureTemplate({ key: 'Bad Key', name: 'x' })).rejects.toThrow(BadRequestException);
  });

  it('refuse une key dupliquée', async () => {
    templateRepo.findOne.mockResolvedValue({ key: 'turkey' });
    await expect(service.createCreatureTemplate({ key: 'turkey', name: 'Turkey' })).rejects.toThrow(BadRequestException);
  });

  it('refuse un name vide', async () => {
    await expect(service.createCreatureTemplate({ key: 'new_mob', name: '' })).rejects.toThrow(BadRequestException);
  });

  it('refuse un textureKey vide', async () => {
    await expect(service.createCreatureTemplate({ key: 'new_mob', name: 'Mob', textureKey: '' })).rejects.toThrow(BadRequestException);
  });
});

describe('createResourceTemplate', () => {
  let service: AdminService;
  let resourceTemplateRepo: Record<string, jest.Mock>;
  let skillDefinitionRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    resourceTemplateRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((v: any) => Promise.resolve(v)),
      create: jest.fn().mockImplementation((v: any) => v),
    };
    skillDefinitionRepo = {
      findOne: jest.fn().mockResolvedValue({ key: 'woodcutting' }),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((v: any) => v),
      save: jest.fn().mockImplementation((v: any) => Promise.resolve(v)),
      count: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: InventoryProjectionService, useValue: { project: jest.fn().mockResolvedValue([]) } },
        { provide: SkillsService, useValue: { getCharacterSkills: jest.fn().mockResolvedValue([]) } },
        { provide: EconomyService, useValue: { readBalanceBronze: jest.fn().mockResolvedValue(0n) } },
        { provide: GameConfigService, useValue: { getConfig: jest.fn(), updateConfig: jest.fn() } },
        { provide: DataSource, useValue: makeFakeDataSource() },
        { provide: getRepositoryToken(CreatureTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CreatureSpawn), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Creature), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Character), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Resource), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(ResourceTemplate), useValue: resourceTemplateRepo },
        { provide: getRepositoryToken(SkillDefinition), useValue: skillDefinitionRepo },
        { provide: getRepositoryToken(PlayerSkill), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingRecipe), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingIngredient), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingResult), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingStationTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CraftingStation), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Item), useValue: BASE_EMPTY_REPO() },
        { provide: WorldService, useValue: { getMovementMetrics: jest.fn(), resetMovementMetrics: jest.fn(), getConnectedCount: jest.fn().mockReturnValue(0) } },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('crée un template ressource avec les valeurs par défaut', async () => {
    const result = await service.createResourceTemplate({ type: 'oak_tree' });
    expect(result.type).toBe('oak_tree');
    expect(result.textureKey).toBe('dead_tree');
    expect(result.defaultRemainingLoots).toBe(4);
    expect(result.respawnDelayMs).toBe(30_000);
    expect(result.gatheringXpReward).toBe(0);
    expect(result.lootPool).toBeNull();
    expect(resourceTemplateRepo.save).toHaveBeenCalled();
  });

  it('crée avec textureKey fourni', async () => {
    const result = await service.createResourceTemplate({ type: 'fire_pit', textureKey: 'fire_camp' });
    expect(result.textureKey).toBe('fire_camp');
  });

  it('crée avec skillKey valide', async () => {
    const result = await service.createResourceTemplate({ type: 'birch', skillKey: 'woodcutting' });
    expect(result.skillKey).toBe('woodcutting');
  });

  it('skillKey vide est converti en null', async () => {
    const result = await service.createResourceTemplate({ type: 'stone', skillKey: '' });
    expect(result.skillKey).toBeNull();
  });

  it('refuse un type non snake_case', async () => {
    await expect(service.createResourceTemplate({ type: 'Bad Type' })).rejects.toThrow(BadRequestException);
  });

  it('refuse un type dupliqué', async () => {
    resourceTemplateRepo.findOne.mockResolvedValue({ type: 'dead_tree' });
    await expect(service.createResourceTemplate({ type: 'dead_tree' })).rejects.toThrow(BadRequestException);
  });

  it('crée avec gatherCharacterXpReward et gatheringDifficulty (défaut 0)', async () => {
    const result = await service.createResourceTemplate({ type: 'oak_tree' });
    expect(result.gatherCharacterXpReward).toBe(0);
    expect(result.gatheringDifficulty).toBe(0);
  });

  it('persiste gatherCharacterXpReward et gatheringDifficulty fournis', async () => {
    const result = await service.createResourceTemplate({
      type: 'oak_tree',
      gatherCharacterXpReward: 5,
      gatheringDifficulty: 20,
    });
    expect(result.gatherCharacterXpReward).toBe(5);
    expect(result.gatheringDifficulty).toBe(20);
  });

  it('refuse gatheringDifficulty hors bornes (> 100)', async () => {
    await expect(
      service.createResourceTemplate({ type: 'oak_tree', gatheringDifficulty: 150 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('crée avec un lootPool vide (aucune entrée)', async () => {
    const result = await service.createResourceTemplate({ type: 'oak_tree', lootPool: [] });
    expect(result.lootPool).toEqual([]);
  });

  it('refuse un textureKey vide', async () => {
    await expect(service.createResourceTemplate({ type: 'my_rock', textureKey: '' })).rejects.toThrow(BadRequestException);
  });

  it('refuse un skillKey inexistant dans SkillDefinition', async () => {
    skillDefinitionRepo.findOne.mockResolvedValue(null);
    await expect(service.createResourceTemplate({ type: 'my_node', skillKey: 'unknown_skill' })).rejects.toThrow(BadRequestException);
  });

  // ── getCharacters — position live ─────────────────────────────────────────────

  describe('getCharacters — enrichissement position ConnectedPlayer', () => {
    const makeChar = (id: string, x: number, y: number, m: number) =>
      ({ id, name: `char-${id}`, worldX: x, worldY: y, mapId: m } as any);

    beforeEach(() => {
      (service as any).characterRepo = {
        find: jest.fn().mockResolvedValue([
          makeChar("char-online",  1024, 2048, 1),
          makeChar("char-offline", 3072, 4096, 1),
        ]),
      };
      (service as any).worldService = {
        getConnectedPlayerByCharacterId: jest.fn().mockReturnValue(null),
      };
    });

    it("joueur connecté — utilise la position live ConnectedPlayer", async () => {
      (service as any).worldService.getConnectedPlayerByCharacterId.mockImplementation((id: string) => {
        if (id === "char-online") return { worldX: 9999, worldY: 8888, mapId: 2 };
        return null;
      });

      const result = await service.getCharacters();
      const online = result.find((c: any) => c.id === "char-online")!;

      expect(online.worldX).toBe(9999);
      expect(online.worldY).toBe(8888);
      expect(online.mapId).toBe(2);
    });

    it("joueur hors ligne — conserve la position DB", async () => {
      const result = await service.getCharacters();
      const offline = result.find((c: any) => c.id === "char-offline")!;

      expect(offline.worldX).toBe(3072);
      expect(offline.worldY).toBe(4096);
      expect(offline.mapId).toBe(1);
    });

    it("format de réponse inchangé — les autres champs restent intacts", async () => {
      (service as any).worldService.getConnectedPlayerByCharacterId.mockImplementation((id: string) => {
        if (id === "char-online") return { worldX: 100, worldY: 200, mapId: 1 };
        return null;
      });

      const result = await service.getCharacters();
      const online = result.find((c: any) => c.id === "char-online")!;

      expect(online.id).toBe("char-online");
      expect(online.name).toBe("char-char-online");
    });

    it("appelle getConnectedPlayerByCharacterId pour chaque personnage", async () => {
      await service.getCharacters();

      const ws = (service as any).worldService;
      expect(ws.getConnectedPlayerByCharacterId).toHaveBeenCalledWith("char-online");
      expect(ws.getConnectedPlayerByCharacterId).toHaveBeenCalledWith("char-offline");
    });
  });
});

describe('AdminService — recalculateCharacterProgression', () => {
  let service: AdminService;
  let characterRepo: Record<string, jest.Mock>;
  let gameConfigService: { getConfig: jest.Mock };
  let fakeDataSource: ReturnType<typeof makeFakeDataSource>;
  let worldService: {
    getConnectedPlayerByCharacterId: jest.Mock;
    emitCharacterReload: jest.Mock;
  };

  // Courbe simple et ronde pour des seuils faciles à vérifier à la main :
  // tranche 1-10, multiplicateur 2 -> 1->2=100, 2->3=200, 3->4=400, 4->5=800.
  // cumulativeXpToLevel(5) = 100+200+400+800 = 1500.
  function makeConfig(overrides: Record<string, unknown> = {}) {
    return {
      startingXp: 100,
      xpMultiplierLevel1To10: 2,
      xpMultiplierLevel11To30: 1.5,
      xpMultiplierLevel31To60: 1.25,
      xpMultiplierLevel61To120: 1.1,
      characterMaxLevel: 120,
      characterCurrentLevelCap: 60,
      statPointsAtLevelOne: 3,
      statPointsPerLevel: 3,
      ...overrides,
    };
  }

  function makeCharacter(overrides: Record<string, unknown> = {}) {
    return {
      id: 'char-1',
      level: 5,
      experience: 50,
      cumulativeExperience: 0,
      health: 100,
      maxHealth: 100,
      baseStrength: 3,
      baseVitality: 2,
      baseEndurance: 1,
      baseAgility: 0,
      baseDexterity: 0,
      baseIntelligence: 0,
      baseWisdom: 0,
      baseCritical: 0,
      unspentStatPoints: 4,
      ...overrides,
    };
  }

  beforeEach(async () => {
    characterRepo = { ...BASE_EMPTY_REPO(), find: jest.fn().mockResolvedValue([makeCharacter()]) };
    gameConfigService = {
      getConfig: jest.fn().mockResolvedValue(makeConfig()),
    };
    fakeDataSource = makeFakeDataSource();
    worldService = {
      getConnectedPlayerByCharacterId: jest.fn().mockReturnValue(null),
      emitCharacterReload: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: InventoryProjectionService, useValue: {} },
        { provide: SkillsService, useValue: {} },
        { provide: EconomyService, useValue: {} },
        { provide: GameConfigService, useValue: gameConfigService },
        { provide: DataSource, useValue: fakeDataSource },
        { provide: getRepositoryToken(CreatureTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(CreatureSpawn), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Creature), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(Character), useValue: characterRepo },
        { provide: getRepositoryToken(Resource), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(ResourceTemplate), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(SkillDefinition), useValue: BASE_EMPTY_REPO() },
        { provide: getRepositoryToken(PlayerSkill), useValue: BASE_EMPTY_REPO() },
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

  it("rejette sans confirm: true", async () => {
    await expect(
      service.recalculateCharacterProgression({ confirm: false } as any),
    ).rejects.toThrow(BadRequestException);
    expect(fakeDataSource.transaction).not.toHaveBeenCalled();
  });

  it("rejette un payload sans confirm", async () => {
    await expect(
      service.recalculateCharacterProgression({} as any),
    ).rejects.toThrow(BadRequestException);
  });

  it("backfill l'XP cumulee (cumulativeExperience=0) et reste stable si la courbe est inchangee", async () => {
    // level=5, experience=50, cumulativeExperience=0 -> backfill =
    // cumulativeXpToLevel(5)=1500 + 50 = 1550. Avec la MEME courbe, le niveau
    // recalcule doit rester 5 et experience doit revenir a 50 (round-trip).
    const report = await service.recalculateCharacterProgression({ confirm: true });

    expect(report.processedCharacterCount).toBe(1);
    expect(report.levelsChangedCount).toBe(0);
    expect(report.totalCumulativeExperienceUsed).toBe(1550);
    // niveau 5 inchange : 3 + (5-1)*3 = 15
    expect(report.newAvailableTotal).toBe(15);
  });

  it("ne re-derive pas cumulativeExperience si elle est deja > 0 (jamais ecrasee)", async () => {
    const updateSpy = jest.fn().mockResolvedValue({});
    (service as any).dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (m: any) => Promise<any>) => cb({ update: updateSpy })),
    };
    characterRepo.find.mockResolvedValue([
      makeCharacter({ cumulativeExperience: 999, level: 1, experience: 0 }),
    ]);

    await service.recalculateCharacterProgression({ confirm: true });

    expect(updateSpy).toHaveBeenCalledWith(
      Character,
      'char-1',
      expect.objectContaining({ cumulativeExperience: 999 }),
    );
  });

  it("recalcule le niveau depuis l'XP cumulee existante sous la nouvelle courbe (peut descendre)", async () => {
    // Courbe plus raide : 1->2=100, 2->3=300, 3->4=900, 4->5=2700, 5->6=8100.
    // cumulativeXpToLevel(5)=1300+2700=4000 ; (6)=4000+8100=12100.
    gameConfigService.getConfig.mockResolvedValue(makeConfig({ xpMultiplierLevel1To10: 3 }));
    characterRepo.find.mockResolvedValue([
      makeCharacter({ level: 8, experience: 10, cumulativeExperience: 5000 }),
    ]);

    const report = await service.recalculateCharacterProgression({ confirm: true });

    expect(report.levelsChangedCount).toBe(1);
    // level attendu = 5 (cumulativeXpToLevel(5)=4000<=5000 < cumulativeXpToLevel(6)=12100)
    // niveau 5 : 3 + 4*3 = 15
    expect(report.newAvailableTotal).toBe(15);
  });

  it("met a jour level/experience/cumulativeExperience dans le meme manager.update que le reset", async () => {
    const updateSpy = jest.fn().mockResolvedValue({});
    (service as any).dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (m: any) => Promise<any>) => cb({ update: updateSpy })),
    };
    characterRepo.find.mockResolvedValue([
      makeCharacter({ level: 8, experience: 10, cumulativeExperience: 5000 }),
    ]);
    gameConfigService.getConfig.mockResolvedValue(makeConfig({ xpMultiplierLevel1To10: 3 }));

    await service.recalculateCharacterProgression({ confirm: true });

    expect(updateSpy).toHaveBeenCalledWith(
      Character,
      'char-1',
      expect.objectContaining({
        level: 5,
        experience: 1000, // 5000 - cumulativeXpToLevel(5)=4000
        cumulativeExperience: 5000,
        baseStrength: 0,
        baseVitality: 0,
        baseEndurance: 0,
        baseAgility: 0,
        baseDexterity: 0,
        baseIntelligence: 0,
        baseWisdom: 0,
        baseCritical: 0,
        unspentStatPoints: 15,
      }),
    );
  });

  it("clampe health a maxHealth si health depasse maxHealth apres reset", async () => {
    const updateSpy = jest.fn().mockResolvedValue({});
    (service as any).dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (m: any) => Promise<any>) => cb({ update: updateSpy })),
    };
    characterRepo.find.mockResolvedValue([
      makeCharacter({ health: 150, maxHealth: 100 }),
    ]);

    await service.recalculateCharacterProgression({ confirm: true });

    expect(updateSpy).toHaveBeenCalledWith(
      Character,
      'char-1',
      expect.objectContaining({ health: 100 }),
    );
  });

  it("ne touche pas health si elle est deja <= maxHealth", async () => {
    const updateSpy = jest.fn().mockResolvedValue({});
    (service as any).dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (m: any) => Promise<any>) => cb({ update: updateSpy })),
    };
    characterRepo.find.mockResolvedValue([
      makeCharacter({ health: 80, maxHealth: 100 }),
    ]);

    await service.recalculateCharacterProgression({ confirm: true });

    const [, , patch] = updateSpy.mock.calls[0];
    expect(patch).not.toHaveProperty('health');
  });

  it("traite plusieurs personnages et cumule les totaux", async () => {
    characterRepo.find.mockResolvedValue([
      makeCharacter({ id: 'char-1', level: 5, experience: 50, unspentStatPoints: 4 }),
      makeCharacter({ id: 'char-2', level: 10, experience: 0, baseStrength: 10, unspentStatPoints: 0 }),
    ]);

    const report = await service.recalculateCharacterProgression({ confirm: true });

    expect(report.processedCharacterCount).toBe(2);
    // char-1 reste niveau 5 (15 pts) ; char-2 niveau 10 inchange (3 + 9*3 = 30 pts)
    expect(report.newAvailableTotal).toBe(15 + 30);
  });

  it("continue et rapporte une erreur si manager.update echoue pour un personnage", async () => {
    fakeDataSource.transaction = jest.fn().mockImplementation(async (cb: (m: any) => Promise<any>) => {
      const manager = { update: jest.fn().mockRejectedValue(new Error('DB down')) };
      return cb(manager);
    });
    (service as any).dataSource = fakeDataSource;

    const report = await service.recalculateCharacterProgression({ confirm: true });

    expect(report.processedCharacterCount).toBe(0);
    expect(report.errors).toEqual([{ characterId: 'char-1', message: 'DB down' }]);
  });

  it("notifie character:reload pour chaque personnage traite (connecte ou non)", async () => {
    characterRepo.find.mockResolvedValue([
      makeCharacter({ id: 'char-1' }),
      makeCharacter({ id: 'char-2' }),
    ]);

    await service.recalculateCharacterProgression({ confirm: true });

    expect(worldService.emitCharacterReload).toHaveBeenCalledWith('char-1');
    expect(worldService.emitCharacterReload).toHaveBeenCalledWith('char-2');
    expect(worldService.emitCharacterReload).toHaveBeenCalledTimes(2);
  });

  it("compte uniquement les personnages reellement connectes dans le rapport", async () => {
    characterRepo.find.mockResolvedValue([
      makeCharacter({ id: 'char-1' }),
      makeCharacter({ id: 'char-2' }),
    ]);
    worldService.getConnectedPlayerByCharacterId.mockImplementation((id: string) =>
      id === 'char-1' ? { characterId: 'char-1', socketId: 'sock-1' } : null,
    );

    const report = await service.recalculateCharacterProgression({ confirm: true });

    expect(report.notifiedConnectedCharacterCount).toBe(1);
  });

  it("n'emet character:reload que pour les personnages effectivement traites (erreur exclue)", async () => {
    characterRepo.find.mockResolvedValue([
      makeCharacter({ id: 'char-1' }),
      makeCharacter({ id: 'char-2' }),
    ]);
    fakeDataSource.transaction = jest.fn().mockImplementation(async (cb: (m: any) => Promise<any>) => {
      const manager = {
        update: jest.fn().mockImplementation((_entity: unknown, id: string) => {
          if (id === 'char-2') return Promise.reject(new Error('DB down'));
          return Promise.resolve({});
        }),
      };
      return cb(manager);
    });
    (service as any).dataSource = fakeDataSource;

    const report = await service.recalculateCharacterProgression({ confirm: true });

    expect(report.errors).toEqual([{ characterId: 'char-2', message: 'DB down' }]);
    expect(worldService.emitCharacterReload).toHaveBeenCalledWith('char-1');
    expect(worldService.emitCharacterReload).not.toHaveBeenCalledWith('char-2');
    expect(worldService.emitCharacterReload).toHaveBeenCalledTimes(1);
  });
});
