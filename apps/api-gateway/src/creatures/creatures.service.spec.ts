import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreaturesService } from './creatures.service';
import { Creature } from './entities/creature.entity';
import { CreatureTemplate } from './entities/creature-template.entity';
import { CreatureSpawn } from './entities/creature-spawn.entity';
import { Character } from '../characters/entities/character.entity';
import { ProgressionService } from '../progression/progression.service';
import { MasteriesService } from '../masteries/masteries.service';
import { MasteryEffectsService } from '../masteries/mastery-effects.service';
import { WorldService } from '../world/world.service';
import { LootService } from '../world/loot.service';
import { DEFAULT_MAP_ID } from '../common/world-coordinates';
import { RuntimeDebugRegistry } from '../player-runtime/debug-modifier.registry';
import { EquipmentSlot } from '../characters/dto/equip-item.dto';
import { DerivedStatsService } from '../derived-stats/derived-stats.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplate(overrides: Partial<CreatureTemplate> = {}): CreatureTemplate {
  return {
    id: 1,
    key: 'turkey',
    name: 'Turkey',
    textureKey: 'turkey',
    baseHealth: 30,
    baseArmor: 2,
    baseAttack: 5,
    patrolRadius: 200,
    speedMin: 25,
    speedMax: 60,
    pauseMinMs: 2000,
    pauseMaxMs: 12000,
    aggroRadius: 50,
    fleeThresholdPct: 75,
    lootPool: null,
    killCharacterXpReward: 0,
    ...overrides,
  } as CreatureTemplate;
}

function makeSpawn(template: CreatureTemplate, overrides: Partial<CreatureSpawn> = {}): CreatureSpawn {
  return {
    id: 'spawn-1',
    key: 'turkey_spawn_1',
    template,
    respawnDelayMs: 20000,
    worldX: 6080,
    worldY: 12480,
    mapId: DEFAULT_MAP_ID,
    ...overrides,
  } as CreatureSpawn;
}

function makeCreature(overrides: Partial<Creature> = {}): Creature {
  const template = makeTemplate();
  const spawn = makeSpawn(template);
  return {
    id: 'creature-1',
    spawn,
    health: 30,
    state: 'alive',
    ...overrides,
  } as Creature;
}

function makeCharacter(overrides: Partial<Character> = {}): Partial<Character> {
  return {
    id: 'char-1',
    health: 100,
    attack: 10,
    defense: 3,
    equipment: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('CreaturesService', () => {
  let service: CreaturesService;
  let debugRegistry: RuntimeDebugRegistry;
  let creatureRepository: Record<string, jest.Mock>;
  let characterRepository: Record<string, jest.Mock>;
  let templateRepository: Record<string, jest.Mock>;
  let spawnRepository: Record<string, jest.Mock>;
  let progressionService: Record<string, jest.Mock>;
  let masteriesService: Record<string, jest.Mock>;
  let masteryEffectsService: Record<string, jest.Mock>;
  let mockDataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    creatureRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((a) => Promise.resolve(a)),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((a) => a),
      createQueryBuilder: jest.fn().mockReturnValue({
        delete: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      }),
    };
    characterRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    };
    templateRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    };
    spawnRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((a) => a),
    };
    progressionService = {
      applyCharacterXpInTx: jest.fn().mockResolvedValue({ level: 1, experience: 10, nextLevelXp: 100, leveledUp: false }),
    };
    masteriesService = {
      applyMasteryXpInTx: jest.fn().mockResolvedValue({ masteryDefinitionKey: "bow", key: "bow", name: "Bow", category: "combat", enabled: true, level: 1, xp: 5, nextLevelXp: 100, leveledUp: false }),
    };
    // Par défaut : aucun effet de maîtrise (dégâts inchangés) — les tests
    // V1-D-B surchargent ce mock.
    masteryEffectsService = {
      getMasteryBonuses: jest.fn().mockResolvedValue({ statModifiers: { percent: {}, flat: {} }, combat: { damagePercent: 0, damageFlat: 0 } }),
      getPermanentStatModifiers: jest.fn().mockResolvedValue({ percent: {}, flat: {} }),
    };
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (fn: (manager: any) => any) => fn({})),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreaturesService,
        { provide: DerivedStatsService, useValue: { getDefinitions: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Creature), useValue: creatureRepository },
        { provide: getRepositoryToken(CreatureTemplate), useValue: templateRepository },
        { provide: getRepositoryToken(CreatureSpawn), useValue: spawnRepository },
        { provide: getRepositoryToken(Character), useValue: characterRepository },
        { provide: WorldService, useValue: { getAllConnectedPlayers: jest.fn().mockReturnValue([]) } },
        { provide: ProgressionService, useValue: progressionService },
        { provide: MasteriesService, useValue: masteriesService },
        { provide: MasteryEffectsService, useValue: masteryEffectsService },
        { provide: DataSource, useValue: mockDataSource },
        RuntimeDebugRegistry,
        LootService,
      ],
    }).compile();

    service = module.get<CreaturesService>(CreaturesService);
    debugRegistry = module.get<RuntimeDebugRegistry>(RuntimeDebugRegistry);
  });

  // -------------------------------------------------------------------------
  describe('findAll', () => {
    it('retourne les DTOs de tous les animaux en mémoire', () => {
      const creature = makeCreature();
      (service as any).liveCreatures.set(creature.id, creature);

      const result = service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'creature-1', health: 30, state: 'alive' });
    });

    it('retourne un tableau vide si aucun creature en mémoire', () => {
      expect(service.findAll()).toEqual([]);
    });

    it('DTO expose textureKey depuis le template', () => {
      const creature = makeCreature();
      (service as any).liveCreatures.set(creature.id, creature);

      const result = service.findAll();

      expect(result[0].textureKey).toBe('turkey');
    });

    it('DTO textureKey correspond à template.textureKey', () => {
      const template = makeTemplate({ textureKey: 'custom_sprite' });
      const creature = makeCreature({ spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);

      const result = service.findAll();

      expect(result[0].textureKey).toBe('custom_sprite');
    });

    it('DTO type et textureKey sont identiques en Phase 1', () => {
      const creature = makeCreature();
      (service as any).liveCreatures.set(creature.id, creature);

      const result = service.findAll();

      expect(result[0].type).toBe(result[0].textureKey);
    });

    it('DTO expose worldX/worldY/mapId depuis l\'creature', () => {
      const creature = makeCreature({ worldX: 65536, worldY: 32768, mapId: 1 } as any);
      (service as any).liveCreatures.set(creature.id, creature);

      const result = service.findAll();

      expect(result[0].worldX).toBe(65536);
      expect(result[0].worldY).toBe(32768);
      expect(result[0].mapId).toBe(1);
    });

    it('DTO worldX/worldY/mapId sont null si absents de l\'creature', () => {
      const creature = makeCreature();
      (service as any).liveCreatures.set(creature.id, creature);

      const result = service.findAll();

      expect(result[0].worldX).toBeNull();
      expect(result[0].worldY).toBeNull();
      expect(result[0].mapId).toBeNull();
    });

    it('DTO expose worldX/worldY WU (P7-C : x/y pixel retirés du DTO)', () => {
      const creature = makeCreature({ worldX: 65536, worldY: 32768, mapId: 1 });
      (service as any).liveCreatures.set(creature.id, creature);

      const result = service.findAll();

      expect(result[0].worldX).toBe(65536);
      expect(result[0].worldY).toBe(32768);
      expect((result[0] as any).x).toBeUndefined();
      expect((result[0] as any).y).toBeUndefined();
    });

    it('DTO expose runtimeStats calculées depuis le template (sans modifiers)', () => {
      // template: baseHealth=30, baseArmor=2, baseAttack=5, speedMax=60
      const creature = makeCreature();
      (service as any).liveCreatures.set(creature.id, creature);

      const result = service.findAll();

      expect(result[0].runtimeStats).toBeDefined();
      expect(result[0].runtimeStats?.maxHp).toBe(30);
      expect(result[0].runtimeStats?.defenseTotal).toBe(2);
      expect(result[0].runtimeStats?.attackPower).toBe(5);
    });

    it('runtimeStats reflète un debug modifier appliqué', () => {
      // baseArmor=2, debug +8 flat → defenseTotal=10
      const creature = makeCreature();
      (service as any).liveCreatures.set(creature.id, creature);
      debugRegistry.addModifier(creature.id, { targetStat: 'defenseTotal', operation: 'flat', value: 8 });

      const result = service.findAll();

      expect(result[0].runtimeStats?.defenseTotal).toBe(10);
      expect(result[0].armor).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  describe('attack', () => {
    it("rejette si l'creature est introuvable", async () => {
      const result = await service.attack('unknown', 'char-1', { worldX: 0, worldY: 0, mapId: 1 });
      expect(result).toEqual({ success: false, error: 'Creature not found' });
    });

    it("rejette si l'creature est déjà mort", async () => {
      const creature = makeCreature({ state: 'dead' });
      (service as any).liveCreatures.set(creature.id, creature);

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result).toEqual({ success: false, error: 'Creature already dead' });
    });

    it('rejette si le personnage est introuvable', async () => {
      const creature = makeCreature();
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(null);

      const result = await service.attack(creature.id, 'char-missing', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result).toEqual({ success: false, error: 'Character not found' });
    });

    it('rejette si la cible est hors de portée', async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter());

      const result = await service.attack(creature.id, 'char-1', { worldX: -8000, worldY: 8000, mapId: 1 });

      expect(result).toEqual({ success: false, error: 'Target out of range' });
    });

    it('rejette si le personnage est mort', async () => {
      const creature = makeCreature();
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ health: 0 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result).toEqual({ success: false, error: 'Character is dead' });
    });

    // ── Portée mêlée (MELEE_RANGE_WU = 1280, distance Chebyshev) ──────────────
    // Les cas historiques attaquent au MÊME WU que la créature (distance 0) et
    // ne couvrent donc pas la portée réelle. On ajoute des distances explicites,
    // dont la tuile adjacente (1024 WU) qui était refusée avant le correctif.
    describe('portée mêlée (Chebyshev WU)', () => {
      // Créature de référence : (6080, 12480), mapId 1.
      const CREATURE_WU = { worldX: 6080, worldY: 12480, mapId: 1 };
      const MELEE_RANGE_WU = 1280; // doit rester synchronisé avec le service
      const TILE_SIZE_WU = 1024;

      function armCreature(overrides: Partial<Creature> = {}) {
        const creature = makeCreature({ ...CREATURE_WU, health: 30, ...overrides });
        (service as any).liveCreatures.set(creature.id, creature);
        characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));
        return creature;
      }

      it('accepte à distance 0 WU (même case)', async () => {
        const creature = armCreature();
        const result = await service.attack(creature.id, 'char-1', { ...CREATURE_WU });
        expect(result.success).toBe(true);
      });

      it('accepte sur une tuile adjacente (1024 WU) — non-régression principale', async () => {
        const creature = armCreature();
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + TILE_SIZE_WU, // cheb = 1024
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result.success).toBe(true);
      });

      it('accepte à la distance exacte MELEE_RANGE_WU (1280)', async () => {
        const creature = armCreature();
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + MELEE_RANGE_WU, // cheb = 1280
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result.success).toBe(true);
      });

      it('refuse à MELEE_RANGE_WU + 1 (1281) et ne modifie pas les PV', async () => {
        const creature = armCreature({ health: 30 });
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + MELEE_RANGE_WU + 1, // cheb = 1281
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result).toEqual({ success: false, error: 'Target out of range' });
        expect(creature.health).toBe(30); // PV inchangés → aucun creature_hit émis par la gateway
      });

      it('refuse si le mapId diffère, même à distance 0 WU', async () => {
        const creature = armCreature();
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX,
          worldY: CREATURE_WU.worldY,
          mapId: 2, // créature sur mapId 1
        });
        expect(result).toEqual({ success: false, error: 'Target out of range' });
        expect(creature.health).toBe(30);
      });

      it('à portée : calcule les dégâts, diminue les PV et retourne le succès', async () => {
        const creature = armCreature({ health: 30 });
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + TILE_SIZE_WU, // adjacent, à portée
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.damage).toBe(8); // max(max(10,5) - 2, 1)
          expect(result.dto.health).toBe(22);
        }
        expect(creature.health).toBe(22);
      });
    });

    // ── Portée d'arme équipée : fallback sécurisé (range <= 0 / null / NaN) ────
    // resolveAttackRange ne doit JAMAIS produire une portée effective 0.
    describe("portée d'arme équipée (fallback sécurisé)", () => {
      const CREATURE_WU = { worldX: 6080, worldY: 12480, mapId: 1 };
      const MELEE_RANGE_WU = 1280;
      const TILE_SIZE_WU = 1024;
      const ADJACENT = { worldX: CREATURE_WU.worldX + TILE_SIZE_WU, worldY: CREATURE_WU.worldY, mapId: 1 }; // cheb 1024

      function armWith(range: number | null | undefined, slot = EquipmentSlot.RIGHT_HAND) {
        const item = { id: 'w', type: 'weapon', weaponType: null, range } as any;
        const equipment = [{ slot, item }] as any;
        const creature = makeCreature({ ...CREATURE_WU, health: 30 });
        (service as any).liveCreatures.set(creature.id, creature);
        characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3, equipment }));
        return creature;
      }

      it('mêlée range = 0 → fallback MELEE_RANGE_WU (tuile adjacente acceptée)', async () => {
        const creature = armWith(0);
        const result = await service.attack(creature.id, 'char-1', ADJACENT);
        expect(result.success).toBe(true);
      });

      it('mêlée range = null → fallback MELEE_RANGE_WU', async () => {
        const creature = armWith(null);
        const result = await service.attack(creature.id, 'char-1', ADJACENT);
        expect(result.success).toBe(true);
      });

      it('mêlée range négatif → fallback MELEE_RANGE_WU', async () => {
        const creature = armWith(-10);
        const result = await service.attack(creature.id, 'char-1', ADJACENT);
        expect(result.success).toBe(true);
      });

      it('mêlée range = NaN → fallback MELEE_RANGE_WU', async () => {
        const creature = armWith(NaN);
        const result = await service.attack(creature.id, 'char-1', ADJACENT);
        expect(result.success).toBe(true);
      });

      it('mêlée range = 46 → 736 WU : trop court, tuile adjacente (1024) refusée', async () => {
        const creature = armWith(46); // 46 × 16 = 736 WU < 1024
        const result = await service.attack(creature.id, 'char-1', ADJACENT);
        expect(result).toEqual({ success: false, error: 'Target out of range' });
        expect(creature.health).toBe(30);
      });

      it('mêlée range = 80 → 1280 WU : tuile adjacente acceptée', async () => {
        const creature = armWith(80); // 80 × 16 = 1280 WU
        const result = await service.attack(creature.id, 'char-1', ADJACENT);
        expect(result.success).toBe(true);
      });

      it('distance range = 0 → fallback RANGED_RANGE_DEFAULT (attaque lointaine acceptée)', async () => {
        const creature = armWith(0, EquipmentSlot.RANGED_WEAPON);
        // RANGED_RANGE_DEFAULT = 300 px → 4800 WU. Attaque à 2000 WU acceptée.
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + 2000,
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result.success).toBe(true);
      });
    });

    // ── Effets de maîtrise (Masteries V1-D-B) : damagePercent sur l'auto-attaque ─
    describe('effets de maîtrise (V1-D-B)', () => {
      const CREATURE_WU = { worldX: 6080, worldY: 12480, mapId: 1 };

      function armedCharacter(weaponType: string | null, attack = 100) {
        const equipment = weaponType
          ? [{ slot: EquipmentSlot.RIGHT_HAND, item: { id: 'w', type: 'weapon', weaponType, range: null } }]
          : [];
        return makeCharacter({ attack, defense: 3, equipment: equipment as any });
      }

      it('sans arme → contexte weaponType null et dégâts inchangés', async () => {
        const creature = makeCreature({ ...CREATURE_WU, health: 300 });
        (service as any).liveCreatures.set(creature.id, creature);
        characterRepository.findOne.mockResolvedValue(armedCharacter(null));

        const result = await service.attack(creature.id, 'char-1', { ...CREATURE_WU });

        expect(masteryEffectsService.getMasteryBonuses).toHaveBeenCalledWith(
          'char-1',
          { weaponType: null },
        );
        // physicalAttack 100, défense créature 2 → 98 (aucun bonus).
        expect(result.success).toBe(true);
        if (result.success) expect(result.damage).toBe(98);
      });

      it("transmet le weaponType de l'arme équipée au service d'effets", async () => {
        const creature = makeCreature({ ...CREATURE_WU, health: 300 });
        (service as any).liveCreatures.set(creature.id, creature);
        characterRepository.findOne.mockResolvedValue(armedCharacter('dagger'));

        await service.attack(creature.id, 'char-1', { ...CREATURE_WU });

        expect(masteryEffectsService.getMasteryBonuses).toHaveBeenCalledWith(
          'char-1',
          { weaponType: 'dagger' },
        );
      });

      it('damagePercent 0 (mastery level 1, sans effects, mismatch…) → dégâts inchangés', async () => {
        masteryEffectsService.getMasteryBonuses.mockResolvedValue({ statModifiers: { percent: {}, flat: {} }, combat: { damagePercent: 0, damageFlat: 0 } });
        const creature = makeCreature({ ...CREATURE_WU, health: 300 });
        (service as any).liveCreatures.set(creature.id, creature);
        characterRepository.findOne.mockResolvedValue(armedCharacter('dagger'));

        const result = await service.attack(creature.id, 'char-1', { ...CREATURE_WU });

        expect(result.success).toBe(true);
        if (result.success) expect(result.damage).toBe(98);
      });

      it('damagePercent 2 (dagger level 5 × 0.5) → attaque effective 102, dégâts 100', async () => {
        masteryEffectsService.getMasteryBonuses.mockResolvedValue({ statModifiers: { percent: {}, flat: {} }, combat: { damagePercent: 2, damageFlat: 0 } });
        const creature = makeCreature({ ...CREATURE_WU, health: 300 });
        (service as any).liveCreatures.set(creature.id, creature);
        characterRepository.findOne.mockResolvedValue(armedCharacter('dagger'));

        const result = await service.attack(creature.id, 'char-1', { ...CREATURE_WU });

        // 100 × 1.02 = 102 → calculateCombatDamage : 102 − 2 = 100.
        expect(result.success).toBe(true);
        if (result.success) expect(result.damage).toBe(100);
        expect(creature.health).toBe(200);
      });

      it('bonus clampé (50 %) → attaque effective 150, dégâts 148', async () => {
        masteryEffectsService.getMasteryBonuses.mockResolvedValue({ statModifiers: { percent: {}, flat: {} }, combat: { damagePercent: 50, damageFlat: 0 } });
        const creature = makeCreature({ ...CREATURE_WU, health: 300 });
        (service as any).liveCreatures.set(creature.id, creature);
        characterRepository.findOne.mockResolvedValue(armedCharacter('dagger'));

        const result = await service.attack(creature.id, 'char-1', { ...CREATURE_WU });

        expect(result.success).toBe(true);
        if (result.success) expect(result.damage).toBe(148);
      });

      it("arrondit l'attaque effective (10 × 1.02 = 10.2 → 10, dégâts entiers inchangés)", async () => {
        masteryEffectsService.getMasteryBonuses.mockResolvedValue({ statModifiers: { percent: {}, flat: {} }, combat: { damagePercent: 2, damageFlat: 0 } });
        const creature = makeCreature({ ...CREATURE_WU, health: 30 });
        (service as any).liveCreatures.set(creature.id, creature);
        characterRepository.findOne.mockResolvedValue(armedCharacter('dagger', 10));

        const result = await service.attack(creature.id, 'char-1', { ...CREATURE_WU });

        // round(10.2) = 10 → max(10, 5) − 2 = 8 : identique au chemin sans bonus.
        expect(result.success).toBe(true);
        if (result.success) expect(result.damage).toBe(8);
      });

      it("n'empêche pas l'XP mastery existante (bow → applyMasteryXpInTx)", async () => {
        masteryEffectsService.getMasteryBonuses.mockResolvedValue({ statModifiers: { percent: {}, flat: {} }, combat: { damagePercent: 0, damageFlat: 0 } });
        const creature = makeCreature({ ...CREATURE_WU, health: 300 });
        (service as any).liveCreatures.set(creature.id, creature);
        const equipment = [{ slot: EquipmentSlot.RANGED_WEAPON, item: { id: 'b', type: 'weapon', weaponType: 'bow', range: null } }];
        characterRepository.findOne.mockResolvedValue(
          makeCharacter({ attack: 100, defense: 3, equipment: equipment as any }),
        );

        const result = await service.attack(creature.id, 'char-1', { ...CREATURE_WU });

        expect(result.success).toBe(true);
        expect(masteriesService.applyMasteryXpInTx).toHaveBeenCalledWith(
          'char-1',
          'bow',
          expect.any(Number),
          expect.anything(),
        );
      });
    });

    it('applique les dégâts et retourne un succès', async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      // damage = max(max(10,5) - 2, 1) = 8
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.damage).toBe(8);
        expect(result.dto.health).toBe(22);
        expect(result.dto.state).toBe('alive');
      }
      expect(creature.health).toBe(22);
      expect(creature.state).toBe('alive');
    });

    it('Force augmente les dégâts via stats.derived.physicalAttack', async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      // physicalAttack = attack(10) + strength(5)*2 = 20 ; defenseTotal creature = 2
      characterRepository.findOne.mockResolvedValue(
        makeCharacter({ attack: 10, defense: 3, baseStrength: 5 }),
      );

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) expect(result.damage).toBe(18);
      expect(creature.health).toBe(12);
    });

    it('Endurance réduit les dégâts reçus (riposte) via stats.derived.defense', async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30, state: 'fighting' });
      (service as any).liveCreatures.set(creature.id, creature);
      // riposte = max(creatureAttackPower(5) - defenseDérivée, 1)
      // sans endurance : defense = 3 → riposte 2
      characterRepository.findOne.mockResolvedValue(
        makeCharacter({ attack: 7, defense: 3, baseEndurance: 0 }),
      );
      const noEndurance = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });
      expect(noEndurance.success && noEndurance.riposte?.damage).toBe(2);

      // avec endurance 10 : defense = 13 → riposte plancher 1
      const creature2 = makeCreature({ id: 'creature-2', worldX: 6080, worldY: 12480, mapId: 1, health: 30, state: 'fighting' });
      (service as any).liveCreatures.set(creature2.id, creature2);
      characterRepository.findOne.mockResolvedValue(
        makeCharacter({ id: 'char-2', attack: 7, defense: 3, baseEndurance: 10 }),
      );
      const withEndurance = await service.attack(creature2.id, 'char-2', { worldX: 6080, worldY: 12480, mapId: 1 });
      expect(withEndurance.success && withEndurance.riposte?.damage).toBe(1);
    });

    it('Critique / Agilité / Dextérité ne sont pas branchés au combat V1', async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      // Ces stats ne doivent pas modifier les dégâts (même valeur que sans elles).
      characterRepository.findOne.mockResolvedValue(
        makeCharacter({ attack: 10, defense: 3, baseCritical: 50, baseAgility: 50, baseDexterity: 50 }),
      );

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      // damage identique au test de base (physicalAttack = attack seul = 10 → 8)
      expect(result.success && result.damage).toBe(8);
    });

    it('conserve le minimum de dégâts (1) même avec une attaque faible', async () => {
      const template = makeTemplate({ baseArmor: 100 });
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 1, defense: 0 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success && result.damage).toBe(1);
    });

    it("tue l'creature, programme un respawn et efface l'état de patrouille", async () => {
      jest.useFakeTimers();
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 5 });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).patrolStates.set(creature.id, {});
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, defense: 0 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      expect(creature.state).toBe('dead');
      expect(creature.health).toBe(0);
      expect((service as any).patrolStates.has(creature.id)).toBe(false);
      expect(jest.getTimerCount()).toBe(1);

      jest.useRealTimers();
    });

    it('préserve l\'état fighting si l\'creature survit', async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30, state: 'fighting' });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 7, defense: 3 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      expect(creature.state).toBe('fighting');
    });

    it('rejette si le cooldown d\'attaque est actif', async () => {
      const creature = makeCreature();
      (service as any).liveCreatures.set(creature.id, creature);
      // Simuler un attack récent
      (service as any).lastAttackAt.set('char-1', Date.now());

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result).toEqual({ success: false, error: 'Attack on cooldown' });
    });

    it("accorde XP personnage au kill si killCharacterXpReward > 0", async () => {
      jest.useFakeTimers();
      const template = makeTemplate({ killCharacterXpReward: 20 });
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 5, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, equipment: [] }));

      await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(progressionService.applyCharacterXpInTx).toHaveBeenCalledWith("char-1", 20, "COMBAT", expect.any(Object));
      jest.useRealTimers();
    });

    it("n'accorde pas XP si killCharacterXpReward = 0", async () => {
      jest.useFakeTimers();
      const template = makeTemplate({ killCharacterXpReward: 0 });
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 5, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, equipment: [] }));

      await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(progressionService.applyCharacterXpInTx).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it("n'accorde pas XP personnage si l'creature survit", async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(makeTemplate({ killCharacterXpReward: 20 })) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(progressionService.applyCharacterXpInTx).not.toHaveBeenCalled();
    });

    it("n'accorde pas XP personnage si l'creature est déjà mort", async () => {
      const creature = makeCreature({ state: 'dead' });
      (service as any).liveCreatures.set(creature.id, creature);

      await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(progressionService.applyCharacterXpInTx).not.toHaveBeenCalled();
    });

    // ── Loot ──────────────────────────────────────────────────────────────────

    it('génère un loot au kill si lootPool défini (probability=1, qty fixe)', async () => {
      jest.useFakeTimers();
      const template = makeTemplate({
        lootPool: [{ itemId: 'wooden_stick', minQty: 2, maxQty: 2, probability: 1.0 }],
      });
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 5, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, defense: 0 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) expect(result.loot).toEqual([{ itemId: 'wooden_stick', quantity: 2 }]);
      jest.useRealTimers();
    });

    it("ne génère pas de loot si l'creature survit", async () => {
      const template = makeTemplate({
        lootPool: [{ itemId: 'wooden_stick', minQty: 1, maxQty: 1, probability: 1.0 }],
      });
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 7, defense: 0 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) expect(result.loot).toBeUndefined();
    });

    it('ne génère pas de loot si lootPool est null et le type ne correspond à aucun fallback', async () => {
      jest.useFakeTimers();
      const template = makeTemplate({ lootPool: null });
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 5, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, defense: 0 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) expect(result.loot).toBeUndefined();
      jest.useRealTimers();
    });

    it('ne génère pas de loot si lootPool est vide', async () => {
      jest.useFakeTimers();
      const template = makeTemplate({ lootPool: [] });
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 5, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, defense: 0 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) expect(result.loot).toBeUndefined();
      jest.useRealTimers();
    });

    // ── Mastery XP ──────────────────────────────────────────────────────────────

    it("accorde mastery XP au hit si le personnage porte une arme de type 'bow'", async () => {
      const bowItem = { id: "item-bow", weaponType: "bow", type: "weapon", range: 300 } as any;
      const equipment = [{ slot: EquipmentSlot.RANGED_WEAPON, item: bowItem }] as any;
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3, equipment }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      expect(masteriesService.applyMasteryXpInTx).toHaveBeenCalledWith("char-1", "bow", expect.any(Number), expect.any(Object));
    });

    it("accorde mastery XP au hit si le personnage porte une arme de type 'crossbow'", async () => {
      const xbowItem = { id: "item-xbow", weaponType: "crossbow", type: "weapon", range: 300 } as any;
      const equipment = [{ slot: EquipmentSlot.RANGED_WEAPON, item: xbowItem }] as any;
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3, equipment }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      expect(masteriesService.applyMasteryXpInTx).toHaveBeenCalledWith("char-1", "crossbow", expect.any(Number), expect.any(Object));
    });

    it("accorde mastery XP two_handed si l'arme en main droite est two_handed_sword", async () => {
      const sword = { id: "item-sword", weaponType: "two_handed_sword", type: "weapon", range: 60 } as any;
      const equipment = [{ slot: EquipmentSlot.RIGHT_HAND, item: sword }] as any;
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3, equipment }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      expect(masteriesService.applyMasteryXpInTx).toHaveBeenCalledWith("char-1", "two_handed", expect.any(Number), expect.any(Object));
    });

    it("ne pas accorder mastery XP si le personnage n'a pas d'arme", async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3, equipment: [] }));

      await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(masteriesService.applyMasteryXpInTx).not.toHaveBeenCalled();
    });

    it("ne pas accorder mastery XP si l'arme equipee a un weaponType null", async () => {
      const plainWeapon = { id: "item-club", weaponType: null, type: "weapon", range: 60 } as any;
      const equipment = [{ slot: EquipmentSlot.RIGHT_HAND, item: plainWeapon }] as any;
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3, equipment }));

      await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(masteriesService.applyMasteryXpInTx).not.toHaveBeenCalled();
    });

    it("ne pas accorder mastery XP si l'arme n'a pas de weaponType dans COMBAT_WEAPON_MASTERY_MAP", async () => {
      const unknownWeapon = { id: "item-staff", weaponType: "staff", type: "weapon", range: 60 } as any;
      const equipment = [{ slot: EquipmentSlot.RIGHT_HAND, item: unknownWeapon }] as any;
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3, equipment }));

      await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(masteriesService.applyMasteryXpInTx).not.toHaveBeenCalled();
    });

    it("retourne masteryUpdate dans AttackSuccess si mastery XP accordé", async () => {
      const bowItem = { id: "item-bow", weaponType: "bow", type: "weapon", range: 300 } as any;
      const equipment = [{ slot: EquipmentSlot.RANGED_WEAPON, item: bowItem }] as any;
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3, equipment }));
      masteriesService.applyMasteryXpInTx.mockResolvedValue({ masteryDefinitionKey: "bow", key: "bow", name: "Bow", category: "combat", enabled: true, level: 1, xp: 5, nextLevelXp: 100, leveledUp: false });

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.masteryUpdate).toEqual({ masteryDefinitionKey: "bow", key: "bow", name: "Bow", category: "combat", enabled: true, level: 1, xp: 5, nextLevelXp: 100, leveledUp: false });
      }
    });

    it("masteryUpdate est undefined si pas d'arme mastery", async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3, equipment: [] }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) expect(result.masteryUpdate).toBeUndefined();
    });

    it("utilise le characterId serveur (parametre), pas une donnee client", async () => {
      jest.useFakeTimers();
      const template = makeTemplate({ killCharacterXpReward: 10 });
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 1, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, equipment: [] }));

      await service.attack(creature.id, 'server-resolved-char-id', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(progressionService.applyCharacterXpInTx).toHaveBeenCalledWith("server-resolved-char-id", expect.any(Number), expect.any(String), expect.any(Object));
      jest.useRealTimers();
    });

    // ── Runtime compute — non-régression et debug modifiers ─────────────────

    it('sans debug modifiers : damage identique au comportement direct (non-régression)', async () => {
      // template.baseArmor=2, char.attack=10 → damage = max(max(10,5)-2, 1) = 8
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) expect(result.damage).toBe(8);
    });

    it('debug modifier flat sur defenseTotal réduit les dégâts infligés', async () => {
      // baseArmor=2, debug +10 flat → defenseTotal=12
      // char.attack=10 → damage = max(max(10,5)-12, 1) = max(-2,1) = 1
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      debugRegistry.addModifier(creature.id, { targetStat: 'defenseTotal', operation: 'flat', value: 10 });
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) expect(result.damage).toBe(1);
    });

    it('debug modifier flat sur attackPower augmente la riposte', async () => {
      // baseAttack=5, debug +10 flat → attackPower=15
      // char.defense=3 → riposteDamage = max(15-3, 1) = 12
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30, state: 'fighting' });
      (service as any).liveCreatures.set(creature.id, creature);
      debugRegistry.addModifier(creature.id, { targetStat: 'attackPower', operation: 'flat', value: 10 });
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3, health: 100 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) expect(result.riposte?.damage).toBe(12);
    });
  });

  // -------------------------------------------------------------------------
  describe('respawnCreature', () => {
    it("remet l'creature en vie à son point de spawn avec vie pleine", async () => {
      const creature = makeCreature({ state: 'dead', health: 0 });
      (service as any).liveCreatures.set(creature.id, creature);
      const emitFn = jest.fn();
      const mockServer = { to: jest.fn().mockReturnValue({ emit: emitFn }), emit: emitFn };
      (service as any).server = mockServer;

      await (service as any).respawnCreature(creature.id);

      expect(creature.state).toBe('alive');
      expect(creature.health).toBe(30);
      expect(creatureRepository.update).toHaveBeenCalledWith(
        creature.id,
        expect.objectContaining({ state: 'alive', health: 30 }),
      );
      expect(mockServer.emit).toHaveBeenCalledWith(
        'creature_update',
        expect.objectContaining({ id: creature.id, state: 'alive', health: 30 }),
      );
    });

    it("ignore les animaux non morts", async () => {
      const creature = makeCreature({ state: 'alive' });
      (service as any).liveCreatures.set(creature.id, creature);

      await (service as any).respawnCreature(creature.id);

      expect(creatureRepository.update).not.toHaveBeenCalled();
    });

    it("ignore les ids inconnus", async () => {
      await (service as any).respawnCreature('ghost-id');
      expect(creatureRepository.update).not.toHaveBeenCalled();
    });

    it("n'émet pas si le serveur n'est pas initialisé", async () => {
      const creature = makeCreature({ state: 'dead', health: 0 });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).server = null;

      await expect((service as any).respawnCreature(creature.id)).resolves.not.toThrow();
      expect(creatureRepository.update).toHaveBeenCalled();
    });

    it('écrit worldX/worldY/mapId en DB lors du respawn', async () => {
      // spawn pixel(600, 580) → worldX=6080, worldY=12480
      const creature = makeCreature({ state: 'dead', health: 0 });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).server = null;

      await (service as any).respawnCreature(creature.id);

      expect(creatureRepository.update).toHaveBeenCalledWith(
        creature.id,
        expect.objectContaining({ worldX: 6080, worldY: 12480, mapId: 1 }),
      );
      expect(creature.worldX).toBe(6080);
      expect(creature.worldY).toBe(12480);
      expect(creature.mapId).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('double-écriture WU', () => {
    it('attack() conserve worldX/worldY/mapId lors du save', async () => {
      // creature WU(6080,12480) fourni dès le départ — plus besoin de conversion pixel→WU (A7)
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(creature.worldX).toBe(6080);
      expect(creature.worldY).toBe(12480);
      expect(creature.mapId).toBe(1);
      expect(creatureRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ worldX: 6080, worldY: 12480, mapId: 1 }),
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('synchronisation WU mémoire IA (A2→A4)', () => {
    it('doPatrolMovement synchronise worldX/worldY après déplacement', () => {
      // creature pixel(600,580) → WU(6080,12480), déplacement dirX=1 dirY=0
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1 });
      const state = { dirX: 1, dirY: 0, speed: 60, moveUntil: Infinity, pauseUntil: 0 };

      (service as any).doPatrolMovement(creature, state, makeTemplate(), Date.now());

      expect(Number.isFinite(creature.worldX)).toBe(true);
      expect(Number.isFinite(creature.worldY)).toBe(true);
      expect(creature.mapId).toBe(1);
    });

    it('doFighting synchronise worldX/worldY lors de la poursuite', async () => {
      // creature pixel(700,580) → WU(6880,11680), joueur WU(0,9600) — dist > MELEE_RANGE_WU
      const creature = makeCreature({ worldX: 6880, worldY: 11680, mapId: 1 });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 400, y: 300, worldX: 0, worldY: 9600, mapId: 1,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0, targetCharacterId: 'char-1' };
      const mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };

      await (service as any).doFighting(creature, state, makeTemplate(), [player], Date.now(), mockServer);

      expect(Number.isFinite(creature.worldX)).toBe(true);
      expect(Number.isFinite(creature.worldY)).toBe(true);
      expect(creature.mapId).toBe(1);
    });

    it('doEscaping synchronise worldX/worldY lors de la fuite', async () => {
      // creature pixel(600,580) → WU(6080,12480), joueur pixel(600,560) → WU(5760,12160)
      // chebyshev=320 WU < patrolRadius(200px)=3200 WU → creature reste en fuite
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1 });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 600, y: 560, worldX: 5760, worldY: 12160, mapId: 1,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };

      await (service as any).doEscaping(creature, state, makeTemplate(), [player], Date.now());

      expect(Number.isFinite(creature.worldX)).toBe(true);
      expect(Number.isFinite(creature.worldY)).toBe(true);
      expect(creature.mapId).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('findNearestPlayer WU (A3)', () => {
    it('retourne null si creature n\'a pas de worldX/worldY → doEscaping passe en alive', async () => {
      // creature sans WU → findNearestPlayer retourne null immédiatement
      const creature = makeCreature({ state: 'escaping' });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 600, y: 560, worldX: 5760, worldY: 12160, mapId: 1,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };

      await (service as any).doEscaping(creature, state, makeTemplate(), [player], Date.now());

      expect(creature.state).toBe('alive');
    });

    it('exclut les joueurs sur une carte différente (mapId filter)', async () => {
      // creature mapId=1, seul joueur mapId=2 → nearest=null → retour en alive
      const creature = makeCreature({ state: 'escaping', worldX: 6080, worldY: 12480, mapId: 1 });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 600, y: 560, worldX: 5760, worldY: 12160, mapId: 2,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };

      await (service as any).doEscaping(creature, state, makeTemplate(), [player], Date.now());

      expect(creature.state).toBe('alive');
    });

    it('sélectionne le joueur le plus proche par WU', async () => {
      // creature WU(6080,12480) — près: WU(5760,12160) chebyshev=320 — loin: WU(-4160,12160) chebyshev=10240
      // patrolRadius(200px)=3200 WU : le joueur proche (320≤3200) maintient la fuite
      const creature = makeCreature({ state: 'escaping', worldX: 6080, worldY: 12480, mapId: 1 });
      const near = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 600, y: 560, worldX: 5760, worldY: 12160, mapId: 1, name: 'Near', direction: 'down',
      };
      const far = {
        characterId: 'char-2', socketId: 'sock-2',
        x: 100, y: 560, worldX: -4160, worldY: 12160, mapId: 1, name: 'Far', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };

      await (service as any).doEscaping(creature, state, makeTemplate(), [near, far], Date.now());

      // Le plus proche (near) est dans le patrolRadius → l'creature continue à fuir
      expect(creature.state).toBe('escaping');
    });
  });

  // -------------------------------------------------------------------------
  describe('moteur de déplacement WU (A4)', () => {
    it('doPatrolMovement — worldX/worldY mis à jour après déplacement', () => {
      // creature WU(6080,12480), dirX=1 dirY=0, speed=60, dt=0.2s
      // stepWU=192 → newWX=6272, newWY=12480 < patrolRadius(3200WU) → else
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1 });
      const state = { dirX: 1, dirY: 0, speed: 60, moveUntil: Infinity, pauseUntil: 0 };

      (service as any).doPatrolMovement(creature, state, makeTemplate(), Date.now());

      expect(creature.worldX).toBe(6272);
      expect(creature.worldY).toBe(12480);
    });

    it('doFighting — worldX/worldY mis à jour après poursuite', async () => {
      // creature WU(6880,11680), joueur WU(0,9600) — dist>MELEE_RANGE_WU → mouvement
      const creature = makeCreature({ worldX: 6880, worldY: 11680, mapId: 1 });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        worldX: 0, worldY: 9600, mapId: 1,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0, targetCharacterId: 'char-1' };
      const mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };

      await (service as any).doFighting(creature, state, makeTemplate(), [player], Date.now(), mockServer);

      expect(Number.isFinite(creature.worldX)).toBe(true);
    });

    it('doEscaping — worldX/worldY mis à jour lors de la fuite', async () => {
      // creature WU(6080,12480), joueur WU(5760,12160) — dist(320WU) < patrolRadius(3200WU)
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1 });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        worldX: 5760, worldY: 12160, mapId: 1,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };

      await (service as any).doEscaping(creature, state, makeTemplate(), [player], Date.now());

      expect(Number.isFinite(creature.worldX)).toBe(true);
    });

    it('doPatrolMovement — guard : retourne sans modifier si worldX est null', () => {
      const creature = makeCreature({});
      const state = { dirX: 1, dirY: 0, speed: 60, moveUntil: Infinity, pauseUntil: 0 };

      (service as any).doPatrolMovement(creature, state, makeTemplate(), Date.now());

      expect(creature.worldX).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  describe('IA speed runtime (Phase 6)', () => {
    // template: speedMax=60, dt=0.2s → stepWU = legacyRadiusToWU(60*0.2) = round(12*16) = 192
    // creature WU(6880,11680), joueur WU(0,9600), dist>MELEE_RANGE_WU

    function makePlayer(worldX: number, worldY: number) {
      return {
        characterId: 'char-1', socketId: 'sock-1',
        x: 400, y: 300, worldX, worldY, mapId: 1,
        name: 'Test', direction: 'down',
      };
    }

    it('doFighting — non-régression : vitesse identique sans modifier (speedMax=60)', async () => {
      const creature = makeCreature({ worldX: 6880, worldY: 11680, mapId: 1 });
      const player = makePlayer(0, 9600);
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0, targetCharacterId: 'char-1' };
      const mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
      const initialX = creature.worldX;

      await (service as any).doFighting(creature, state, makeTemplate(), [player], Date.now(), mockServer);

      // stepWU=192, dx/dist component moves creature toward player
      const dx = 0 - 6880;
      const dist = Math.hypot(dx, 9600 - 11680);
      const expectedX = Math.round(6880 + (dx / dist) * 192);
      expect(creature.worldX).toBe(expectedX);
      expect(creature.worldX).toBeLessThan(initialX); // s'approche du joueur
    });

    it('doFighting — debug flat +60 augmente la vitesse de poursuite', async () => {
      const creature = makeCreature({ worldX: 6880, worldY: 11680, mapId: 1 });
      const player = makePlayer(0, 9600);
      const mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };

      // 1. Baseline sans modifier
      const state1 = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0, targetCharacterId: 'char-1' };
      await (service as any).doFighting(creature, state1, makeTemplate(), [player], Date.now(), mockServer);
      const xBaseline = creature.worldX!;

      // 2. Reset + modifier flat +60 → speed=120, step=384 > step=192 (baseline)
      creature.worldX = 6880; creature.worldY = 11680;
      debugRegistry.addModifier(creature.id, { targetStat: 'speed', operation: 'flat', value: 60 });

      const state2 = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0, targetCharacterId: 'char-1' };
      await (service as any).doFighting(creature, state2, makeTemplate(), [player], Date.now(), mockServer);

      expect(creature.worldX).toBeLessThan(xBaseline); // plus proche du joueur avec modifier
    });

    it('doFighting — speed ≤ 0 (flat -100) : pas de mouvement, pas de crash', async () => {
      const creature = makeCreature({ worldX: 6880, worldY: 11680, mapId: 1 });
      const player = makePlayer(0, 9600);
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0, targetCharacterId: 'char-1' };
      const mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
      debugRegistry.addModifier(creature.id, { targetStat: 'speed', operation: 'flat', value: -100 });
      const initialX = creature.worldX;

      await expect(
        (service as any).doFighting(creature, state, makeTemplate(), [player], Date.now(), mockServer),
      ).resolves.not.toThrow();
      expect(creature.worldX).toBe(initialX); // stepWU=0 → pas de mouvement
    });

    it('doEscaping — debug flat +60 augmente la vitesse de fuite', async () => {
      // creature WU(6080,12480) fuit joueur WU(5760,12160) — dans le patrolRadius
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1 });
      const player = makePlayer(5760, 12160);

      // 1. Baseline sans modifier
      const state1 = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };
      await (service as any).doEscaping(creature, state1, makeTemplate(), [player], Date.now());
      const xBaseline = creature.worldX!;

      // 2. Reset + modifier flat +60 → step plus grand → fuit plus loin
      creature.worldX = 6080; creature.worldY = 12480;
      debugRegistry.addModifier(creature.id, { targetStat: 'speed', operation: 'flat', value: 60 });

      const state2 = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };
      await (service as any).doEscaping(creature, state2, makeTemplate(), [player], Date.now());

      expect(creature.worldX).toBeGreaterThan(xBaseline); // fuit plus loin avec modifier
    });

    it('doPatrolMovement — speed ≤ 0 (flat -100) : state.speed=0 à la nouvelle direction', () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1 });
      // moveUntil=0 → déclenchement du bloc nouvelle-direction
      const state = { dirX: 0, dirY: 0, speed: 50, moveUntil: 0, pauseUntil: 0 };
      debugRegistry.addModifier(creature.id, { targetStat: 'speed', operation: 'flat', value: -100 });

      (service as any).doPatrolMovement(creature, state, makeTemplate(), Date.now());

      expect(state.speed).toBe(0); // rand(0, 0) = 0
    });
  });
});

// ─── P7-A — Garanties WU à la création ───────────────────────────────────────

describe('CreaturesService — P7-A : création sécurisée (WU comme source de vérité)', () => {
  let service: CreaturesService;
  let spawnRepository: Record<string, jest.Mock>;
  let creatureRepository: Record<string, jest.Mock>;
  let templateRepository: Record<string, jest.Mock>;
  let spawnCreated: Record<string, unknown>[];

  beforeEach(async () => {
    spawnCreated = [];
    spawnRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((a) => Promise.resolve({ ...a, id: 'spawn-new' })),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((a) => { spawnCreated.push(a); return a; }),
    };
    creatureRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((a) => Promise.resolve({ ...a, id: 'creature-new' })),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((a) => a),
      createQueryBuilder: jest.fn().mockReturnValue({
        delete: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      }),
    };
    templateRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreaturesService,
        { provide: DerivedStatsService, useValue: { getDefinitions: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Creature), useValue: creatureRepository },
        { provide: getRepositoryToken(CreatureTemplate), useValue: templateRepository },
        { provide: getRepositoryToken(CreatureSpawn), useValue: spawnRepository },
        { provide: getRepositoryToken(Character), useValue: { findOne: jest.fn().mockResolvedValue(null), update: jest.fn() } },
        { provide: WorldService, useValue: { getAllConnectedPlayers: jest.fn().mockReturnValue([]) } },
        { provide: ProgressionService, useValue: { applyCharacterXpInTx: jest.fn() } },
        { provide: MasteriesService, useValue: { applyMasteryXpInTx: jest.fn() } },
        { provide: MasteryEffectsService, useValue: { getMasteryBonuses: jest.fn().mockResolvedValue({ statModifiers: { percent: {}, flat: {} }, combat: { damagePercent: 0, damageFlat: 0 } }), getPermanentStatModifiers: jest.fn().mockResolvedValue({ percent: {}, flat: {} }) } },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        RuntimeDebugRegistry,
        LootService,
      ],
    }).compile();

    service = module.get<CreaturesService>(CreaturesService);
  });

  describe('createAdminSpawn — spawn créé avec mapId', () => {
    it('inclut mapId=DEFAULT_MAP_ID dans le spawn créé', async () => {
      templateRepository.findOne.mockResolvedValue(makeTemplate());
      creatureRepository.findOne.mockResolvedValue(makeCreature());
      await service.createAdminSpawn('turkey', 6080, 12480);
      expect(spawnCreated[0]).toHaveProperty('mapId', DEFAULT_MAP_ID);
    });

    it('inclut worldX et worldY dans le spawn créé', async () => {
      templateRepository.findOne.mockResolvedValue(makeTemplate());
      creatureRepository.findOne.mockResolvedValue(makeCreature());
      await service.createAdminSpawn('turkey', 6080, 12480);
      expect(spawnCreated[0]).toHaveProperty('worldX', 6080);
      expect(spawnCreated[0]).toHaveProperty('worldY', 12480);
    });
  });

  describe('seedSpawns — spawn turkey_spawn_1 créé avec WU', () => {
    it('inclut worldX dans le spawn créé', async () => {
      templateRepository.findOne.mockResolvedValue(makeTemplate());
      await (service as any).seedSpawns();
      expect(spawnCreated[0]).toHaveProperty('worldX');
      expect(typeof spawnCreated[0].worldX).toBe('number');
    });

    it('inclut worldY dans le spawn créé', async () => {
      templateRepository.findOne.mockResolvedValue(makeTemplate());
      await (service as any).seedSpawns();
      expect(spawnCreated[0]).toHaveProperty('worldY');
      expect(typeof spawnCreated[0].worldY).toBe('number');
    });

    it('inclut mapId dans le spawn créé', async () => {
      templateRepository.findOne.mockResolvedValue(makeTemplate());
      await (service as any).seedSpawns();
      expect(spawnCreated[0]).toHaveProperty('mapId', DEFAULT_MAP_ID);
    });

    it('ne crée pas de spawn si turkey_spawn_1 existe déjà', async () => {
      templateRepository.findOne.mockResolvedValue(makeTemplate());
      spawnRepository.findOne.mockResolvedValue(makeSpawn(makeTemplate()));
      await (service as any).seedSpawns();
      expect(spawnCreated).toHaveLength(0);
    });
  });

  describe('seedInstances — préfère spawn.worldX/Y quand défini', () => {
    it('utilise spawn.worldX/Y si non-null (pas de pixelToWUSafe)', async () => {
      const template = makeTemplate();
      const spawn = makeSpawn(template, { worldX: 9999, worldY: 8888, mapId: DEFAULT_MAP_ID });
      spawnRepository.find.mockResolvedValue([spawn]);
      const creatureCreated: Record<string, unknown>[] = [];
      creatureRepository.create.mockImplementation((a) => { creatureCreated.push(a); return a; });

      await (service as any).seedInstances();

      expect(creatureCreated[0]).toHaveProperty('worldX', 9999);
      expect(creatureCreated[0]).toHaveProperty('worldY', 8888);
    });

    it('ne crée pas de créature si spawn.worldX est null (guard P7-B)', async () => {
      const template = makeTemplate();
      const spawn = makeSpawn(template, { worldX: null as any, worldY: null as any, mapId: null as any });
      spawnRepository.find.mockResolvedValue([spawn]);
      const creatureCreated: Record<string, unknown>[] = [];
      creatureRepository.create.mockImplementation((a) => { creatureCreated.push(a); return a; });

      await (service as any).seedInstances();

      expect(creatureCreated).toHaveLength(0);
    });

    it('ne crée pas de créature si une instance existe déjà pour ce spawn', async () => {
      const template = makeTemplate();
      const spawn = makeSpawn(template);
      spawnRepository.find.mockResolvedValue([spawn]);
      creatureRepository.findOne.mockResolvedValue(makeCreature());
      const creatureCreated: Record<string, unknown>[] = [];
      creatureRepository.create.mockImplementation((a) => { creatureCreated.push(a); return a; });

      await (service as any).seedInstances();

      expect(creatureCreated).toHaveLength(0);
    });
  });

  describe('respawnCreature — utilise spawn.worldX/Y (P7-B)', () => {
    it('utilise spawn.worldX/Y (non-régression WU au respawn)', async () => {
      const creature = makeCreature({ id: 'c-1', state: 'dead', worldX: 0, worldY: 0, mapId: 1 });
      creature.spawn = makeSpawn(makeTemplate(), { worldX: 7777, worldY: 6666, mapId: DEFAULT_MAP_ID });
      (service as any).liveCreatures.set('c-1', creature);

      await (service as any).respawnCreature('c-1');

      expect(creature.worldX).toBe(7777);
      expect(creature.worldY).toBe(6666);
    });

    it('retourne tôt si spawn.worldX est null (guard P7-B)', async () => {
      const creature = makeCreature({ id: 'c-2', state: 'dead', worldX: 99, worldY: 99 });
      creature.spawn = makeSpawn(makeTemplate(), { worldX: null as any, worldY: null as any, mapId: null as any });
      (service as any).liveCreatures.set('c-2', creature);

      await (service as any).respawnCreature('c-2');

      expect(creature.worldX).toBe(99);
      expect(creature.worldY).toBe(99);
    });
  });
});

// ─── P7-B : guards spawn WU dans l'IA ────────────────────────────────────────

describe('CreaturesService — P7-B : guards spawn WU dans l\'IA', () => {
  let service: CreaturesService;
  let creatureRepository: Record<string, jest.Mock>;

  beforeEach(async () => {
    creatureRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((a) => Promise.resolve(a)),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((a) => a),
      createQueryBuilder: jest.fn().mockReturnValue({
        delete: jest.fn().mockReturnThis(), update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      }),
    };
    const module = await Test.createTestingModule({
      providers: [
        CreaturesService,
        { provide: DerivedStatsService, useValue: { getDefinitions: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Creature), useValue: creatureRepository },
        { provide: getRepositoryToken(CreatureTemplate), useValue: { findOne: jest.fn().mockResolvedValue(null), upsert: jest.fn() } },
        { provide: getRepositoryToken(CreatureSpawn), useValue: { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]), save: jest.fn(), update: jest.fn(), create: jest.fn().mockImplementation((a) => a) } },
        { provide: getRepositoryToken(Character), useValue: { findOne: jest.fn().mockResolvedValue(null), update: jest.fn() } },
        { provide: WorldService, useValue: { getAllConnectedPlayers: jest.fn().mockReturnValue([]) } },
        { provide: ProgressionService, useValue: { applyCharacterXpInTx: jest.fn() } },
        { provide: MasteriesService, useValue: { applyMasteryXpInTx: jest.fn() } },
        { provide: MasteryEffectsService, useValue: { getMasteryBonuses: jest.fn().mockResolvedValue({ statModifiers: { percent: {}, flat: {} }, combat: { damagePercent: 0, damageFlat: 0 } }), getPermanentStatModifiers: jest.fn().mockResolvedValue({ percent: {}, flat: {} }) } },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        RuntimeDebugRegistry,
        LootService,
      ],
    }).compile();
    service = module.get<CreaturesService>(CreaturesService);
  });

  it('doPatrolMovement — retourne sans modifier worldX si spawn.worldX est null', () => {
    const creature = makeCreature({ worldX: 5000, worldY: 5000, mapId: 1 });
    creature.spawn = makeSpawn(makeTemplate(), { worldX: null as any, worldY: null as any });
    const state = { dirX: 1, dirY: 0, speed: 60, moveUntil: Date.now() + 10000, pauseUntil: 0 };

    (service as any).doPatrolMovement(creature, state, makeTemplate(), Date.now());

    expect(creature.worldX).toBe(5000);
    expect(creature.worldY).toBe(5000);
  });

  it('doFighting — retourne sans modifier worldX si spawn.worldX est null', async () => {
    const creature = makeCreature({ worldX: 5000, worldY: 5000, mapId: 1 });
    creature.spawn = makeSpawn(makeTemplate(), { worldX: null as any, worldY: null as any });
    const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0, targetCharacterId: 'char-1' };
    const player = { characterId: 'char-1', socketId: 's-1', name: 'P', worldX: 4800, worldY: 5000, mapId: 1, x: 0, y: 0 };
    const server = { to: jest.fn().mockReturnValue({ emit: jest.fn() }), emit: jest.fn() } as any;

    await (service as any).doFighting(creature, state, makeTemplate(), [player], Date.now(), server);

    expect(creature.worldX).toBe(5000);
  });

  it('doEscaping — retourne sans modifier worldX si spawn.worldX est null', async () => {
    const creature = makeCreature({ worldX: 5000, worldY: 5000, mapId: 1 });
    creature.spawn = makeSpawn(makeTemplate(), { worldX: null as any, worldY: null as any });
    const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };
    const player = { characterId: 'char-1', socketId: 's-1', name: 'P', worldX: 5100, worldY: 5000, mapId: 1, x: 0, y: 0 };

    await (service as any).doEscaping(creature, state, makeTemplate(), [player], Date.now());

    expect(creature.worldX).toBe(5000);
  });

  it('forceRespawnAll — ignore les créatures sans spawn.worldX (guard P7-B)', async () => {
    const creature = makeCreature({ id: 'c-1', state: 'alive', worldX: 1000, worldY: 2000 });
    creature.spawn = makeSpawn(makeTemplate(), { worldX: null as any, worldY: null as any, mapId: null as any });
    (service as any).liveCreatures.set('c-1', creature);

    await service.forceRespawnAll('turkey');

    expect(creature.worldX).toBe(1000);
    expect(creatureRepository.update).not.toHaveBeenCalled();
  });

  it('forceRespawnAll — utilise spawn.worldX/Y pour reset position', async () => {
    const creature = makeCreature({ id: 'c-2', state: 'alive', worldX: 1000, worldY: 2000, mapId: 1 });
    creature.spawn = makeSpawn(makeTemplate(), { worldX: 9000, worldY: 8000, mapId: DEFAULT_MAP_ID });
    (service as any).liveCreatures.set('c-2', creature);

    await service.forceRespawnAll('turkey');

    expect(creature.worldX).toBe(9000);
    expect(creature.worldY).toBe(8000);
    expect(creatureRepository.update).toHaveBeenCalledWith(
      'c-2',
      expect.objectContaining({ worldX: 9000, worldY: 8000, mapId: DEFAULT_MAP_ID }),
    );
  });

  // -------------------------------------------------------------------------
  describe("doFighting — reset après kill cible", () => {
    function makePlayer(worldX: number, worldY: number): any {
      return {
        characterId: "char-1",
        socketId: "sock-1",
        worldX,
        worldY,
        mapId: 1,
        name: "Test",
        direction: "down",
      };
    }

    it("combat normal → état fighting maintenu, cible non réinitialisée", async () => {
      // creature et joueur à 2000 WU de distance → déplacement, pas d'auto-attaque
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      const state = {
        dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0,
        targetCharacterId: "char-1",
      };
      const player = makePlayer(6080 + 2000, 12480);
      const mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };

      await (service as any).doFighting(creature, state, makeTemplate(), [player], Date.now(), mockServer);

      expect(creature.state).toBe("fighting");
      expect(state.targetCharacterId).toBe("char-1");
    });

    it("auto-attack → combat:event utilise la position RUNTIME du joueur, pas la DB (respawn/stale)", async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      const state = {
        dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0,
        targetCharacterId: "char-1",
      };
      // Position runtime live du joueur = même case que la créature.
      const player = makePlayer(6080, 12480);
      // Position DB (persistée = respawn) volontairement différente.
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0, worldX: 999, worldY: 888, mapId: 1 }),
        update: jest.fn().mockResolvedValue({}),
      };
      const emits: { event: string; payload: any }[] = [];
      const mockServer = { to: () => ({ emit: (event: string, payload: any) => emits.push({ event, payload }) }) };

      await (service as any).doFighting(creature, state, makeTemplate(), [player], Date.now(), mockServer);

      const combatEvents = emits.filter((e) => e.event === "combat:event");
      expect(combatEvents).toHaveLength(1);
      expect(combatEvents[0].payload).toMatchObject({
        type: "damage",
        targetType: "player",
        targetId: "char-1",
        worldX: 6080, // position runtime (target), pas 999 (DB)
        worldY: 12480,
      });
      // Ancien event conservé
      expect(emits.some((e) => e.event === "character_damaged")).toBe(true);
    });

    it("auto-attack tue le joueur → état alive, targetCharacterId undefined, respawnCharacter appelé", async () => {
      // creature et joueur au même point → dist=0 ≤ MELEE_RANGE_WU → auto-attack
      // char defense=0, template baseAttack=5 → dmg=5 > char.health=1 → kill
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      const state = {
        dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0,
        targetCharacterId: "char-1",
      };
      const player = makePlayer(6080, 12480);
      const respawnCharacter = jest.fn().mockResolvedValue(undefined);
      (service as any).worldService = {
        getAllConnectedPlayers: jest.fn().mockReturnValue([]),
        respawnCharacter,
      };
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 1, defense: 0 }),
        update: jest.fn().mockResolvedValue({}),
      };
      const mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };

      await (service as any).doFighting(creature, state, makeTemplate(), [player], Date.now(), mockServer);

      expect(respawnCharacter).toHaveBeenCalledWith("char-1", mockServer);
      expect(creature.state).toBe("alive");
      expect(state.targetCharacterId).toBeUndefined();
    });

  });
});
