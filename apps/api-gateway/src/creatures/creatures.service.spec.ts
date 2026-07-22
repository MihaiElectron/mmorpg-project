import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreaturesService } from './creatures.service';
import { Creature } from './entities/creature.entity';
import { CreatureTemplate } from './entities/creature-template.entity';
import { CreatureSpawn } from './entities/creature-spawn.entity';
import { CreatureTemplateSkill } from './entities/creature-template-skill.entity';
import { SkillDefinition } from '../active-skills/entities/skill-definition.entity';
import { CharacterStatsCalculator } from '../characters/character-stats-calculator';
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
import { CreatureRuntimeCalculator, DEFAULT_CREATURE_SECONDARY_COEFFICIENTS, CreatureSecondaryCoefficients } from '../creature-runtime/creature-runtime.calculator';
import { CreatureSecondaryCoefficientsService } from '../creature-config/creature-secondary-coefficients.service';
import { CreatureTemplateOverridesService } from '../creature-config/creature-template-overrides.service';
import { EMPTY_TEMPLATE_OVERRIDES } from '../creature-config/creature-template-overrides.constants';

/** Mock du service de coefficients renvoyant une config effective donnée (défauts par défaut). */
function makeCoefficientsServiceMock(coeffs: CreatureSecondaryCoefficients = DEFAULT_CREATURE_SECONDARY_COEFFICIENTS) {
  return { getCoefficients: jest.fn().mockReturnValue({ ...coeffs }) };
}

/** Mock du service d'overrides par template — aucun override (fallback global). */
function makeOverridesServiceMock() {
  return {
    getOverrides: jest.fn().mockReturnValue(EMPTY_TEMPLATE_OVERRIDES),
    onChange: jest.fn(),
  };
}

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
    strength: 0, vitality: 0, endurance: 0, agility: 0, dexterity: 0, intelligence: 0, wisdom: 0,
    spirit: 0, willpower: 0, charisma: 0,
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
  let coefficientsServiceMock: { getCoefficients: jest.Mock };

  beforeEach(async () => {
    coefficientsServiceMock = makeCoefficientsServiceMock();
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
        { provide: getRepositoryToken(CreatureTemplateSkill), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(SkillDefinition), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Character), useValue: characterRepository },
        { provide: WorldService, useValue: { getAllConnectedPlayers: jest.fn().mockReturnValue([]) } },
        { provide: ProgressionService, useValue: progressionService },
        { provide: MasteriesService, useValue: masteriesService },
        { provide: MasteryEffectsService, useValue: masteryEffectsService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: CreatureSecondaryCoefficientsService, useValue: coefficientsServiceMock },
        { provide: CreatureTemplateOverridesService, useValue: makeOverridesServiceMock() },
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
  describe('getRuntimeCombatInfo — capacités + cooldown live (V5-C1)', () => {
    it('expose les capacités damage configurées avec leur état de cooldown', async () => {
      const creature = makeCreature({ state: 'fighting', health: 20 });
      (service as any).liveCreatures.set(creature.id, creature);
      const now = Date.now();
      // Cache de capacités (config) pré-seedé + cooldown live d'une seule.
      (service as any).combatAbilityCache.set('turkey', [
        { skillKey: 'fireball', skillName: 'Boule de feu', effectType: 'damage', displayOrder: 0, rangeWU: 5000, cooldownMs: 3000, damageType: 'physical', scaling: {} },
        { skillKey: 'ice', skillName: 'Glace', effectType: 'heal', displayOrder: 1, rangeWU: 2000, cooldownMs: 1000, damageType: 'raw', scaling: {} },
      ]);
      (service as any).creatureSkillCooldowns.set(creature.id, new Map([['fireball', now]]));

      const info = await service.getRuntimeCombatInfo(creature.id);
      expect(info).not.toBeNull();
      const abilities = info!.abilities!;
      expect(abilities).toHaveLength(2);

      const fb = abilities.find((a) => a.skillKey === 'fireball')!;
      expect(fb).toMatchObject({ skillName: 'Boule de feu', effectType: 'damage', rangeWU: 5000, cooldownMs: 3000, lastCastAt: now, nextCastAt: now + 3000, onCooldown: true });
      expect(fb.cooldownRemainingMs).toBeGreaterThan(0);
      // V5-D1-A : le heal apparaît aussi dans le runtime (affichage, pas casté).
      expect(abilities.find((a) => a.skillKey === 'ice')!.effectType).toBe('heal');

      const ice = abilities.find((a) => a.skillKey === 'ice')!;
      expect(ice).toMatchObject({ lastCastAt: null, nextCastAt: null, cooldownRemainingMs: 0, onCooldown: false });
    });

    it('renvoie un tableau abilities vide si aucune capacité configurée', async () => {
      const creature = makeCreature({ state: 'alive' });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).combatAbilityCache.set('turkey', []);
      const info = await service.getRuntimeCombatInfo(creature.id);
      expect(info!.abilities).toEqual([]);
    });

    it('retourne null si la créature n\'est pas vivante en mémoire', async () => {
      expect(await service.getRuntimeCombatInfo('inconnu')).toBeNull();
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

      // ── V4-A : armorPenetrationPercent réduit l'armure effective de la cible ─
      it("pénétration d'armure (mastery flat) augmente les dégâts en ignorant l'armure", async () => {
        // Baseline sans pénétration : defenseTotal créature = 2 → dégâts 8.
        // Une maîtrise ajoute armorPenetrationPercent flat = 100 (statModifiers)
        // → armure effective round(2 × 0) = 0 → dégâts = 10.
        masteryEffectsService.getMasteryBonuses.mockResolvedValueOnce({
          statModifiers: { percent: {}, flat: { armorPenetrationPercent: 100 } },
          combat: { damagePercent: 0, damageFlat: 0 },
        });
        const creature = armCreature({ health: 30 });
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + TILE_SIZE_WU,
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.damage).toBe(10); // 8 → 10 grâce à la pénétration
          expect(result.dto.health).toBe(20);
        }
      });

      // ── V4-D : l'auto-attaque transmet criticalChance/criticalDamage ────────
      it("auto-attaque : critique forcé (criticalChance 100) applique criticalDamage 150", async () => {
        // Baseline : physicalAttack 10, armure créature 2 → 8 dégâts.
        // criticalChance 100 (mastery flat) → toujours critique ; criticalDamage
        // 150 (défaut dérivé) → attaque round(10 × 1.5) = 15 → 15 − 2 = 13.
        masteryEffectsService.getMasteryBonuses.mockResolvedValueOnce({
          statModifiers: { percent: {}, flat: { criticalChance: 100 } },
          combat: { damagePercent: 0, damageFlat: 0 },
        });
        const creature = armCreature({ health: 30 });
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + TILE_SIZE_WU,
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.damage).toBe(13); // critique ×1.5 puis − armure 2
          expect(result.dto.health).toBe(17);
        }
      });

      // ── V4-F : le joueur défenseur peut esquiver la riposte ─────────────────
      it("riposte esquivée (dodgeChance joueur 100) → 0 dégât, PV joueur inchangés", async () => {
        // dodgeChance dérivée poussée > 100 par mastery flat → clamp 100 dans le
        // calculateur → esquive systématique (roll Math.random < 1). La créature
        // survit au hit joueur (8 dégâts sur 30 PV) donc riposte, mais esquivée.
        masteryEffectsService.getMasteryBonuses.mockResolvedValueOnce({
          statModifiers: { percent: {}, flat: { dodgeChance: 100 } },
          combat: { damagePercent: 0, damageFlat: 0 },
        });
        const creature = armCreature({ health: 30 });
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + TILE_SIZE_WU,
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.riposte).toBeDefined();
          expect(result.riposte?.isDodged).toBe(true);
          expect(result.riposte?.damage).toBe(0);
          // PV joueur inchangés (makeCharacter health 100).
          expect(result.riposte?.characterHealth).toBe(100);
        }
      });

      // ── V4-H : le joueur défenseur peut BLOQUER la riposte ──────────────────
      it("riposte bloquée (blockChance 100, réduction 50 %) → dégâts riposte réduits de moitié", async () => {
        // Riposte non esquivée : attackPower créature 5 − défense joueur 3 = 2
        // (plancher 1 → 2). blockChance 100 → bloqué. Réduction = baseValue 25 %
        // (défaut de blockReductionPercent) + mastery flat 25 % = 50 % →
        // round(2 × 0.5) = 1, blockedDamage = 2 − 1 = 1.
        masteryEffectsService.getMasteryBonuses.mockResolvedValueOnce({
          statModifiers: {
            percent: {},
            flat: { blockChance: 100, blockReductionPercent: 25 },
          },
          combat: { damagePercent: 0, damageFlat: 0 },
        });
        const creature = armCreature({ health: 30 });
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + TILE_SIZE_WU,
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.riposte?.isDodged).toBe(false);
          expect(result.riposte?.isBlocked).toBe(true);
          expect(result.riposte?.damage).toBe(1); // 2 → round(2 × 0.5) = 1
          expect(result.riposte?.blockedDamage).toBe(1);
          expect(result.riposte?.characterHealth).toBe(99);
        }
      });

      // ── V4-I : parade + contre-attaque ──────────────────────────────────────
      // Arme de mêlée du défenseur (range null → reach fallback MELEE_RANGE_WU ≥
      // reach attaque créature) → parade éligible.
      const MELEE_EQUIP = [
        { slot: EquipmentSlot.RIGHT_HAND, item: { id: 'w', type: 'weapon', weaponType: null, range: null } },
      ] as any;

      it("parade réussie (parryChance 100) → riposte annulée + contre-attaque appliquée", async () => {
        // parryChance 100 → riposte parée (0 dégât, PV joueur inchangés).
        // counterAttackPower flat 10 → contre-attaque : 10 − defenseTotal créature 2 = 8.
        // Créature 30 − 8 (hit principal) = 22, puis − 8 (contre-attaque) = 14.
        masteryEffectsService.getMasteryBonuses.mockResolvedValueOnce({
          statModifiers: { percent: {}, flat: { parryChance: 100, counterAttackPower: 10 } },
          combat: { damagePercent: 0, damageFlat: 0 },
        });
        const creature = armCreature({ health: 30 });
        characterRepository.findOne.mockResolvedValue(
          makeCharacter({ attack: 10, defense: 3, equipment: MELEE_EQUIP }),
        );
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + TILE_SIZE_WU,
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.riposte?.isParried).toBe(true);
          expect(result.riposte?.damage).toBe(0);
          expect(result.riposte?.characterHealth).toBe(100); // PV joueur intacts
          expect(result.counterAttack).toBeDefined();
          expect(result.counterAttack?.damage).toBe(8);
          expect(result.counterAttack?.killed).toBe(false);
          expect(result.counterAttack?.creatureHealth).toBe(14);
          expect(result.killed).toBe(false); // le hit principal n'a pas tué
          expect(result.dto.health).toBe(14);
        }
      });

      it("contre-attaque létale → créature tuée par la contre-attaque (pas par le hit principal)", async () => {
        // counterAttackPower flat 100 → contre-attaque 98 > PV restants (22) → mort.
        masteryEffectsService.getMasteryBonuses.mockResolvedValueOnce({
          statModifiers: { percent: {}, flat: { parryChance: 100, counterAttackPower: 100 } },
          combat: { damagePercent: 0, damageFlat: 0 },
        });
        const creature = armCreature({ health: 30 });
        characterRepository.findOne.mockResolvedValue(
          makeCharacter({ attack: 10, defense: 3, equipment: MELEE_EQUIP }),
        );
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + TILE_SIZE_WU,
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.riposte?.isParried).toBe(true);
          expect(result.counterAttack?.killed).toBe(true);
          expect(result.counterAttack?.creatureHealth).toBe(0);
          expect(result.killed).toBe(false); // mort attribuée à la contre-attaque
          expect(result.dto.health).toBe(0);
          expect(result.dto.state).toBe('dead');
        }
      });

      it("pas d'arme de mêlée → pas de parade (riposte normale, aucune contre-attaque)", async () => {
        // parryChance 100 mais équipement vide → defenderCanParry false.
        masteryEffectsService.getMasteryBonuses.mockResolvedValueOnce({
          statModifiers: { percent: {}, flat: { parryChance: 100 } },
          combat: { damagePercent: 0, damageFlat: 0 },
        });
        const creature = armCreature({ health: 30 }); // makeCharacter equipment: []
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + TILE_SIZE_WU,
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.riposte?.isParried).toBe(false);
          expect(result.riposte?.damage).toBe(2); // riposte normale (5 − 3)
          expect(result.counterAttack).toBeUndefined();
        }
      });

      // V5-F : la parade/contre-attaque peut venir des STATS SECONDAIRES d'un item
      // équipé (canal DerivedStatModifiers.flat), sans aucun modificateur de maîtrise.
      it("V5-F : parade + contre-attaque pilotées par les statBonuses d'un item équipé", async () => {
        // Aucun bonus de maîtrise (mock par défaut vide) → tout vient de l'item.
        const PARRY_ITEM_EQUIP = [
          {
            slot: EquipmentSlot.RIGHT_HAND,
            item: {
              id: 'w',
              type: 'weapon',
              weaponType: null,
              range: null,
              statBonuses: { parryChance: 100, counterAttackPower: 20 },
            },
          },
        ] as any;
        const creature = armCreature({ health: 30 });
        characterRepository.findOne.mockResolvedValue(
          makeCharacter({ attack: 10, defense: 3, equipment: PARRY_ITEM_EQUIP }),
        );
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + TILE_SIZE_WU,
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.riposte?.isParried).toBe(true); // parryChance 100 via item
          expect(result.riposte?.characterHealth).toBe(100); // riposte annulée
          expect(result.counterAttack).toBeDefined();
          // counterAttackPower 20 (item) − armure créature 2 = 18.
          expect(result.counterAttack?.damage).toBe(18);
          // Créature 30 − 8 (hit principal) − 18 (contre-attaque) = 4.
          expect(result.counterAttack?.creatureHealth).toBe(4);
        }
      });

      it("arme à distance seule → pas de parade", async () => {
        masteryEffectsService.getMasteryBonuses.mockResolvedValueOnce({
          statModifiers: { percent: {}, flat: { parryChance: 100 } },
          combat: { damagePercent: 0, damageFlat: 0 },
        });
        const creature = armCreature({ health: 30 });
        characterRepository.findOne.mockResolvedValue(
          makeCharacter({
            attack: 10,
            defense: 3,
            equipment: [
              { slot: EquipmentSlot.RANGED_WEAPON, item: { id: 'bow', type: 'weapon', weaponType: 'bow', range: null } },
            ] as any,
          }),
        );
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + TILE_SIZE_WU,
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.riposte?.isParried).toBe(false);
          expect(result.counterAttack).toBeUndefined();
        }
      });

      it("portée arme mêlée défenseur < portée attaque entrante → pas de parade", async () => {
        // range 40 px → 640 WU < MELEE_RANGE_WU (1280) → defenderCanParry false.
        // La même arme raccourcit aussi la portée d'attaque du joueur (640 WU) :
        // on place donc la créature à 512 WU (≤ 640) pour que le hit principal
        // porte, tout en gardant reach défenseur (640) < attaque entrante (1280).
        masteryEffectsService.getMasteryBonuses.mockResolvedValueOnce({
          statModifiers: { percent: {}, flat: { parryChance: 100 } },
          combat: { damagePercent: 0, damageFlat: 0 },
        });
        const creature = armCreature({ health: 30 });
        characterRepository.findOne.mockResolvedValue(
          makeCharacter({
            attack: 10,
            defense: 3,
            equipment: [
              { slot: EquipmentSlot.RIGHT_HAND, item: { id: 'dagger', type: 'weapon', weaponType: null, range: 40 } },
            ] as any,
          }),
        );
        const result = await service.attack(creature.id, 'char-1', {
          worldX: CREATURE_WU.worldX + 512,
          worldY: CREATURE_WU.worldY,
          mapId: 1,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.riposte?.isParried).toBe(false);
          expect(result.counterAttack).toBeUndefined();
        }
      });
    });

    // ── Symétrie de lifecycle : mort du joueur dans le chemin riposte/contre-
    // attaque de attack() → la créature ABANDONNE explicitement sa cible, comme
    // le chemin passif applyCreatureHitToPlayer. Le reset est gardé par
    // `=== characterId` (n'abandonne que si le joueur mort ÉTAIT la cible). ─────
    describe("mort du joueur → reset explicite de la cible (symétrie lifecycle)", () => {
      const CREATURE_WU = { worldX: 6080, worldY: 12480, mapId: 1 };
      const TILE_SIZE_WU = 1024;
      const ADJACENT = { worldX: CREATURE_WU.worldX + TILE_SIZE_WU, worldY: CREATURE_WU.worldY, mapId: 1 };

      let respawnCharacter: jest.Mock;

      beforeEach(() => {
        // Respawn actif : `attack()` ne respawn que si `this.server` est défini.
        respawnCharacter = jest.fn().mockResolvedValue(undefined);
        (service as any).server = {} as any;
        (service as any).worldService.respawnCharacter = respawnCharacter;
      });

      /** Enregistre un PatrolState avec une cible donnée pour la créature. */
      function seedTarget(creatureId: string, targetCharacterId = 'char-1') {
        (service as any).patrolStates.set(creatureId, {
          dirX: 0,
          dirY: 0,
          speed: 0,
          moveUntil: 0,
          pauseUntil: 0,
          targetCharacterId,
        });
      }

      function targetOf(creatureId: string): string | undefined {
        return (service as any).patrolStates.get(creatureId)?.targetCharacterId;
      }

      // 1) Riposte létale → cible remise à undefined + respawn + aucun 2e dégât.
      it("riposte létale → targetCharacterId undefined, respawn déclenché, un seul dégât", async () => {
        // Créature survit au hit joueur (30 − 8 = 22) donc riposte ; joueur à 1 PV
        // → riposte (≥ 1) le tue. Pas d'arme → pas de parade → riposte normale.
        const creature = makeCreature({ ...CREATURE_WU, health: 30 });
        (service as any).liveCreatures.set(creature.id, creature);
        characterRepository.findOne.mockResolvedValue(makeCharacter({ health: 1, attack: 10, defense: 3 }));
        seedTarget(creature.id, 'char-1');

        const result = await service.attack(creature.id, 'char-1', ADJACENT);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.riposte?.characterHealth).toBe(0); // joueur mort
          expect(result.counterAttack).toBeUndefined(); // pas de parade → aucun 2e hit
        }
        expect(targetOf(creature.id)).toBeUndefined(); // cible abandonnée explicitement
        expect(respawnCharacter).toHaveBeenCalledTimes(1);
        expect(respawnCharacter).toHaveBeenCalledWith('char-1', expect.anything());
        // Un seul dégât appliqué au joueur (la riposte), aucun après la mort.
        expect(characterRepository.update).toHaveBeenCalledTimes(1);
      });

      // 2) Contre-attaque créature létale (parade) → cible undefined + respawn.
      it("contre-attaque créature létale (parade) → targetCharacterId undefined, respawn déclenché", async () => {
        // Coefficients poussés : parryChance 100 (créature pare le hit principal),
        // counterAttackPower 100 (contre-attaque létale sur un joueur à 1 PV).
        coefficientsServiceMock.getCoefficients.mockReturnValue({
          ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
          parryPerStrength: 100,
          counterPerDexterity: 100,
          secondaryChanceCap: 100,
        });
        const template = makeTemplate({ strength: 1, dexterity: 1 });
        const creature = makeCreature({ ...CREATURE_WU, health: 30, spawn: makeSpawn(template) as any });
        (service as any).liveCreatures.set(creature.id, creature);
        characterRepository.findOne.mockResolvedValue(makeCharacter({ health: 1, attack: 10, defense: 3 }));
        seedTarget(creature.id, 'char-1');

        const result = await service.attack(creature.id, 'char-1', ADJACENT);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.creatureCounterAttack).toBeDefined();
          expect(result.creatureCounterAttack?.killed).toBe(true);
          expect(result.riposte).toBeUndefined(); // contre-attaque remplace la riposte
        }
        expect(creature.health).toBe(30); // hit principal paré → créature intacte
        expect(targetOf(creature.id)).toBeUndefined();
        expect(respawnCharacter).toHaveBeenCalledTimes(1);
        expect(respawnCharacter).toHaveBeenCalledWith('char-1', expect.anything());
      });

      // 5) Riposte NON létale → cible conservée, comportement inchangé, pas de respawn.
      it("riposte non létale → targetCharacterId conservé, aucun respawn", async () => {
        const creature = makeCreature({ ...CREATURE_WU, health: 30 });
        (service as any).liveCreatures.set(creature.id, creature);
        characterRepository.findOne.mockResolvedValue(makeCharacter({ health: 100, attack: 10, defense: 3 }));
        seedTarget(creature.id, 'char-1');

        const result = await service.attack(creature.id, 'char-1', ADJACENT);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.riposte?.characterHealth).toBe(98); // 100 − 2, survit
        }
        expect(targetOf(creature.id)).toBe('char-1'); // cible inchangée
        expect(respawnCharacter).not.toHaveBeenCalled();
      });

      // 6) Contre-attaque NON létale sur parade → cible conservée, règles inchangées.
      it("contre-attaque créature NON létale (parade) → cible conservée, contre-attaque appliquée", async () => {
        coefficientsServiceMock.getCoefficients.mockReturnValue({
          ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
          parryPerStrength: 100,
          counterPerDexterity: 10, // contre-attaque modérée, non létale
          secondaryChanceCap: 100,
        });
        const template = makeTemplate({ strength: 1, dexterity: 1 });
        const creature = makeCreature({ ...CREATURE_WU, health: 30, spawn: makeSpawn(template) as any });
        (service as any).liveCreatures.set(creature.id, creature);
        characterRepository.findOne.mockResolvedValue(makeCharacter({ health: 100, attack: 10, defense: 3 }));
        seedTarget(creature.id, 'char-1');

        const result = await service.attack(creature.id, 'char-1', ADJACENT);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.creatureCounterAttack).toBeDefined();
          expect(result.creatureCounterAttack?.killed).toBe(false);
          expect((result.creatureCounterAttack?.amount ?? 0) > 0).toBe(true); // règles contre-attaque intactes
        }
        expect(targetOf(creature.id)).toBe('char-1'); // joueur vivant → cible conservée
        expect(respawnCharacter).not.toHaveBeenCalled();
      });

      // Garde `=== characterId` : un joueur mort qui n'est PAS la cible ne doit
      // jamais casser l'aggro de la créature sur un AUTRE joueur.
      it("riposte létale sur un joueur NON ciblé → aggro sur l'autre joueur préservée", async () => {
        const creature = makeCreature({ ...CREATURE_WU, health: 30 });
        (service as any).liveCreatures.set(creature.id, creature);
        characterRepository.findOne.mockResolvedValue(makeCharacter({ health: 1, attack: 10, defense: 3 }));
        seedTarget(creature.id, 'char-OTHER'); // la créature cible un autre joueur

        const result = await service.attack(creature.id, 'char-1', ADJACENT);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.riposte?.characterHealth).toBe(0); // char-1 meurt
        }
        expect(targetOf(creature.id)).toBe('char-OTHER'); // aggro préservée
        expect(respawnCharacter).toHaveBeenCalledWith('char-1', expect.anything());
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

      it("V6-A : créature défenseur — ni esquive ni blocage (seule defenseTotal s'applique)", async () => {
        masteryEffectsService.getMasteryBonuses.mockResolvedValue({ statModifiers: { percent: {}, flat: {} }, combat: { damagePercent: 0, damageFlat: 0 } });
        const creature = makeCreature({ ...CREATURE_WU, health: 30 }); // template défaut : baseArmor 2
        (service as any).liveCreatures.set(creature.id, creature);
        characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

        const result = await service.attack(creature.id, 'char-1', { ...CREATURE_WU });

        expect(result.success).toBe(true);
        if (result.success) {
          // Template par défaut : primaires à 0 → dodgeChance/blockChance 0 → ni
          // esquive ni blocage (V6-B3/V6-B4 s'activent seulement si primaires > 0).
          expect(result.isDodged).toBe(false);
          expect(result.isBlocked).toBe(false);
          // Seule defenseTotal (baseArmor 2) réduit : physicalAttack 10 − 2 = 8.
          expect(result.damage).toBe(8);
        }
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

    it('Agilité / Dextérité ne modifient pas physicalAttack (elles alimentent criticalChance, V4-D)', async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      // agility/dexterity 0 → criticalChance dérivée 0 → jamais de critique
      // (déterministe). Elles n'entrent pas dans physicalAttack (strength seul).
      // physicalAttack = attack (10), armure créature 2 → 8 dégâts.
      characterRepository.findOne.mockResolvedValue(
        makeCharacter({ attack: 10, defense: 3, baseAgility: 0, baseDexterity: 0 }),
      );

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success && result.damage).toBe(8);
    });

    it('V6-B2 : Endurance créature réduit les dégâts reçus (defenseTotal dérivé)', async () => {
      // endurance 5 → defenseTotal = baseArmor 2 + 5 = 7. Attaque joueur 10 → 10 − 7 = 3.
      const template = makeTemplate({ endurance: 5 });
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success && result.damage).toBe(3);
    });

    it('V6-B3 : créature avec dodge 100 esquive l\'auto-attaque joueur (dégâts 0, PV inchangés)', async () => {
      // Coefficients poussés → dodgeChance = agility 1 × 100, cap 100 = 100 → esquive
      // certaine (accuracy joueur 0). Déterministe sans mocker Math.random.
      coefficientsServiceMock.getCoefficients.mockReturnValue({
        ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
        dodgePerAgility: 100,
        secondaryChanceCap: 100,
      });
      const template = makeTemplate({ agility: 1 });
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.isDodged).toBe(true);
        expect(result.damage).toBe(0);
      }
      expect(creature.health).toBe(30); // PV créature inchangés
    });

    it('V6-B3 : créature dodge 0 (agility 0) → comportement identique (aucune esquive)', async () => {
      const template = makeTemplate({ agility: 0 });
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.isDodged).toBe(false);
        expect(result.damage).toBe(8); // 10 − defenseTotal 2
      }
    });

    it('V6-B6 : parryChance 0 → aucune parade (comportement identique)', async () => {
      // strength/dexterity 0 → parryChance 0 → canParry false : hit plein.
      const template = makeTemplate({ strength: 0, dexterity: 0 });
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.isParried).toBe(false);
        expect(result.damage).toBe(8); // 10 − defenseTotal 2, aucune parade
      }
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
  // Lot 2 (ADR-0021) : activation des PV max dérivés créature.
  // Coefficient par défaut maxHealthPerVitality = 10 (coefficientsServiceMock).
  describe('Lot 2 — PV max dérivés (spawn/respawn/admin/DTO/template)', () => {
    /** Template baseHealth 30 + vitality → max effectif = floor(30 + vitality×10). */
    const vitTemplate = (vitality: number, over: Partial<CreatureTemplate> = {}) =>
      makeTemplate({ baseHealth: 30, vitality, ...over });

    it('10/legacy : Vitalité 0 → maximum = baseHealth (no-op)', async () => {
      const creature = makeCreature({ state: 'dead', health: 0, spawn: makeSpawn(vitTemplate(0)) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).server = null;
      await (service as any).respawnCreature(creature.id);
      expect(creature.health).toBe(30);
    });

    it('11 : respawn automatique aux PV max dérivés (vitality 3 → 60)', async () => {
      const creature = makeCreature({ state: 'dead', health: 0, spawn: makeSpawn(vitTemplate(3)) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).server = null;
      await (service as any).respawnCreature(creature.id);
      expect(creature.health).toBe(60);
      expect(creatureRepository.update).toHaveBeenCalledWith(
        creature.id,
        expect.objectContaining({ health: 60 }),
      );
    });

    it('12 : force-respawn admin aux PV max dérivés', async () => {
      const creature = makeCreature({ state: 'dead', health: 5, spawn: makeSpawn(vitTemplate(3, { key: 'fr' })) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).server = null;
      const count = await service.forceRespawnAll('fr');
      expect(count).toBe(1);
      expect(creature.health).toBe(60);
    });

    it('17/19 : adminUpdateCreature clampe la valeur (non fiable) au max dérivé', async () => {
      const creature = makeCreature({ state: 'alive', health: 10, spawn: makeSpawn(vitTemplate(3)) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      await service.adminUpdateCreature(creature.id, { health: 9999 });
      expect(creature.health).toBe(60); // clamp serveur au max dérivé
    });

    it('18 : adminUpdateCreature PV négatifs → clamp à 0', async () => {
      const creature = makeCreature({ state: 'alive', health: 40, spawn: makeSpawn(vitTemplate(3)) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      await service.adminUpdateCreature(creature.id, { health: -50 });
      expect(creature.health).toBe(0);
    });

    it('27/28/29 : DTO maxHealth == runtimeStats.maxHp == max dérivé (une seule valeur)', () => {
      const creature = makeCreature({ state: 'alive', health: 60, spawn: makeSpawn(vitTemplate(3)) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      const [dto] = service.findAll();
      expect(dto.maxHealth).toBe(60);
      expect(dto.runtimeStats?.maxHp).toBe(60);
      expect(dto.maxHealth).toBe(dto.runtimeStats?.maxHp);
    });

    it('30 : baseHealth reste la config brute (attack/armor/attaque inchangés)', () => {
      const creature = makeCreature({ state: 'alive', health: 60, spawn: makeSpawn(vitTemplate(3, { baseArmor: 7, baseAttack: 4 })) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      const [dto] = service.findAll();
      expect(dto.armor).toBe(7); // baseArmor brut
      expect(dto.attack).toBe(4); // baseAttack brut
      expect(dto.maxHealth).toBe(60); // max = dérivé, pas baseHealth
    });

    it('20/22 : baisse du max (Vitalité réduite) → PV courants clampés', () => {
      const template = vitTemplate(5, { key: 'shrink' }); // max 30 + 50 = 80
      const creature = makeCreature({ state: 'alive', health: 80, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      // Vitalité 5 → 1 : nouveau max = 30 + 10 = 40 < 80 courant.
      service.refreshTemplateInMemory('shrink', { vitality: 1 });
      expect(creature.health).toBe(40); // clampé au nouveau max
    });

    it('21/24 : hausse du max (Vitalité augmentée) → PV courants inchangés (pas de soin)', () => {
      const template = vitTemplate(1, { key: 'grow' }); // max 40
      const creature = makeCreature({ state: 'alive', health: 15, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      service.refreshTemplateInMemory('grow', { vitality: 10 }); // nouveau max 130
      expect(creature.health).toBe(15); // inchangé, jamais soigné
    });

    it('20-bis : baisse via baseHealth → PV courants clampés', () => {
      const template = vitTemplate(0, { key: 'shrinkbase' }); // max 30
      const creature = makeCreature({ state: 'alive', health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      service.refreshTemplateInMemory('shrinkbase', { baseHealth: 12 }); // nouveau max 12
      expect(creature.health).toBe(12);
    });

    it('23 : changement de coefficient recalcule le max (paramétré)', () => {
      const template = vitTemplate(4); // baseHealth 30, vitality 4
      const low = CreatureRuntimeCalculator.resolveMaxHealth(template, {
        ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
        maxHealthPerVitality: 5,
      }).finalValue;
      const high = CreatureRuntimeCalculator.resolveMaxHealth(template, {
        ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
        maxHealthPerVitality: 25,
      }).finalValue;
      expect(low).toBe(30 + 4 * 5); // 50
      expect(high).toBe(30 + 4 * 25); // 130
    });
  });

  // -------------------------------------------------------------------------
  // Lot 2 fix : snapshot mémoïsé des PV max (ADR-0021 — pas de recalcul par tick).
  describe('Lot 2 fix — snapshot PV max (mémoïsation + invalidation)', () => {
    let spy: jest.SpyInstance | undefined;
    afterEach(() => {
      spy?.mockRestore();
      spy = undefined;
    });

    const setup = (vitality = 3, key = 'snap', health = 30) => {
      const template = makeTemplate({ key, baseHealth: 30, vitality });
      const creature = makeCreature({ id: `${key}-1`, state: 'alive', health, worldX: 6080, worldY: 12480, mapId: 1, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      return { template, creature };
    };

    it('1/2 : le max est résolu UNE fois puis mémoïsé (plusieurs lectures)', () => {
      setup();
      spy = jest.spyOn(CreatureRuntimeCalculator, 'resolveMaxHealth');
      service.findAll();
      service.findAll();
      service.findAll();
      expect(spy).toHaveBeenCalledTimes(1); // 1er accès uniquement
    });

    it('3/6 : lectures DTO répétées (par tick) ne recalculent pas', () => {
      const { creature } = setup();
      service.findAll(); // réchauffe le cache
      spy = jest.spyOn(CreatureRuntimeCalculator, 'resolveMaxHealth');
      for (let i = 0; i < 10; i++) (service as any).toDto(creature);
      expect(spy).not.toHaveBeenCalled();
    });

    it('4 : une attaque ne recalcule pas le max (cache chaud)', async () => {
      const { creature } = setup();
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));
      service.findAll(); // warm
      spy = jest.spyOn(CreatureRuntimeCalculator, 'resolveMaxHealth');
      await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });
      expect(spy).not.toHaveBeenCalled();
    });

    it('5 : un soin ne recalcule pas le max (cache chaud)', () => {
      const { template } = setup(3, 'heal', 40); // max 60
      const first = (service as any).resolveCreatureMaxHealth(template); // warm → 60
      expect(first).toBe(60);
      spy = jest.spyOn(CreatureRuntimeCalculator, 'resolveMaxHealth');
      const again = (service as any).resolveCreatureMaxHealth(template);
      expect(again).toBe(60);
      expect(spy).not.toHaveBeenCalled();
    });

    it('7/8 : édition template (vitality) invalide et recalcule', () => {
      setup(3, 'edit'); // max 60
      service.findAll(); // warm → 60
      spy = jest.spyOn(CreatureRuntimeCalculator, 'resolveMaxHealth');
      service.refreshTemplateInMemory('edit', { vitality: 5 }); // → 80
      expect(spy).toHaveBeenCalled();
      const dto = service.findAll().find((d) => d.id === 'edit-1');
      expect(dto!.maxHealth).toBe(80);
    });

    it('9 : invalidateMaxHealthCache force le recalcul (changement de coefficient)', () => {
      const { template } = setup(3, 'coef');
      expect((service as any).resolveCreatureMaxHealth(template)).toBe(60); // cached
      coefficientsServiceMock.getCoefficients.mockReturnValue({
        ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
        maxHealthPerVitality: 20,
      });
      // Sans invalidation : le snapshot renvoie encore l'ancienne valeur.
      expect((service as any).resolveCreatureMaxHealth(template)).toBe(60);
      service.invalidateMaxHealthCache('coef');
      expect((service as any).resolveCreatureMaxHealth(template)).toBe(30 + 3 * 20); // 90
    });

    it('10 : une lecture combat sans changement de source ne recalcule pas', async () => {
      const { creature } = setup();
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));
      service.findAll(); // warm
      spy = jest.spyOn(CreatureRuntimeCalculator, 'resolveMaxHealth');
      await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });
      service.findAll();
      (service as any).toDto(creature);
      expect(spy).not.toHaveBeenCalled();
    });

    it('11 : invalidateMaxHealthCache() vide tout le snapshot', () => {
      const { template } = setup(3, 'clr');
      (service as any).resolveCreatureMaxHealth(template); // cache
      spy = jest.spyOn(CreatureRuntimeCalculator, 'resolveMaxHealth');
      service.invalidateMaxHealthCache(); // clear all
      (service as any).resolveCreatureMaxHealth(template);
      expect(spy).toHaveBeenCalledTimes(1); // recalculé après clear
    });

    it('12 : deux templates distincts → snapshots distincts', () => {
      const a = makeTemplate({ key: 'ta', baseHealth: 30, vitality: 1 }); // 40
      const b = makeTemplate({ key: 'tb', baseHealth: 30, vitality: 5 }); // 80
      expect((service as any).resolveCreatureMaxHealth(a)).toBe(40);
      expect((service as any).resolveCreatureMaxHealth(b)).toBe(80);
    });

    it('15 : refresh sans baisse du max → PV courants inchangés (aucune écriture inutile)', () => {
      const template = makeTemplate({ key: 'noop', baseHealth: 30, vitality: 3 }); // max 60
      const creature = makeCreature({ id: 'noop-1', state: 'alive', health: 45, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      service.refreshTemplateInMemory('noop', { vitality: 3 }); // même max 60 ≥ 45
      expect(creature.health).toBe(45); // inchangé
    });

    it('17 : cap minimum 1 préservé via le snapshot', () => {
      const template = makeTemplate({ key: 'cap1', baseHealth: 1, vitality: 0 });
      expect((service as any).resolveCreatureMaxHealth(template)).toBe(1);
    });

    it('debug maxHp n\'affecte PAS le PV max autoritaire (artefact d\'inspection retiré ; DevTools = getRuntimeSnapshot)', () => {
      const { creature } = setup(0, 'dbg'); // max 30
      debugRegistry.addModifier('dbg-1', { targetStat: 'maxHp', operation: 'flat', value: 50, sourceLabel: 'Debug' });
      const dto = service.findAll().find((d) => d.id === 'dbg-1');
      expect(dto!.maxHealth).toBe(30); // debug ignoré pour le max autoritaire
      expect(dto!.runtimeStats?.maxHp).toBe(30);
    });
  });

  // -------------------------------------------------------------------------
  // Correctif coefficient : recalcul global des PV max après changement de
  // maxHealthPerVitality (coefficient GLOBAL).
  describe('recalculateAllMaxHealthAfterCoefficientChange', () => {
    const setMaxPerVit = (v: number) =>
      coefficientsServiceMock.getCoefficients.mockReturnValue({
        ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
        maxHealthPerVitality: v,
      });

    const liveCreature = (id: string, vitality: number, health: number, state: Creature['state'] = 'alive') => {
      const template = makeTemplate({ key: id, baseHealth: 30, vitality });
      const creature = makeCreature({ id: `${id}-c`, state, health, worldX: 6080, worldY: 12480, mapId: 1, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      return creature;
    };

    const withServer = () => {
      const emit = jest.fn();
      const server = { to: jest.fn().mockReturnValue({ emit }), emit };
      (service as any).server = server;
      return { server, emit };
    };

    it('6 : baisse du coefficient → PV courants clampés + persistés + diffusés', async () => {
      setMaxPerVit(10);
      const creature = liveCreature('shrink', 5, 80); // max 30 + 50 = 80
      service.findAll(); // réchauffe le snapshot à 80
      const { emit } = withServer();
      setMaxPerVit(2); // nouveau max = 30 + 10 = 40 < 80
      await service.recalculateAllMaxHealthAfterCoefficientChange();
      expect(creature.health).toBe(40); // clampé
      expect(creatureRepository.update).toHaveBeenCalledWith(creature.id, { health: 40 });
      expect(emit).toHaveBeenCalledWith('creature_update', expect.objectContaining({ id: creature.id, maxHealth: 40 }));
    });

    it('7 : hausse du coefficient → PV inchangés (pas de soin) + max diffusé', async () => {
      setMaxPerVit(10);
      const creature = liveCreature('grow', 3, 20); // max 60
      service.findAll();
      const { emit } = withServer();
      creatureRepository.update.mockClear();
      setMaxPerVit(30); // nouveau max = 30 + 90 = 120
      await service.recalculateAllMaxHealthAfterCoefficientChange();
      expect(creature.health).toBe(20); // inchangé, jamais soigné
      expect(creatureRepository.update).not.toHaveBeenCalled(); // pas d'écriture PV
      expect(emit).toHaveBeenCalledWith('creature_update', expect.objectContaining({ id: creature.id, maxHealth: 120 }));
    });

    it('8 : max inchangé (Vitalité 0) → aucune écriture ni émission', async () => {
      setMaxPerVit(10);
      const creature = liveCreature('legacy', 0, 30); // max = baseHealth 30 (coef sans effet)
      service.findAll(); // snapshot 30
      const { emit } = withServer();
      creatureRepository.update.mockClear();
      setMaxPerVit(50); // vitality 0 → max reste 30
      await service.recalculateAllMaxHealthAfterCoefficientChange();
      expect(creature.health).toBe(30);
      expect(creatureRepository.update).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('9 : créature morte non ressuscitée, respawnAt intact', async () => {
      setMaxPerVit(10);
      const respawnAt = new Date(Date.now() + 20000);
      const creature = liveCreature('dead', 5, 0, 'dead');
      creature.respawnAt = respawnAt;
      service.findAll();
      withServer();
      setMaxPerVit(2);
      await service.recalculateAllMaxHealthAfterCoefficientChange();
      expect(creature.state).toBe('dead');
      expect(creature.respawnAt).toBe(respawnAt);
      expect(creature.health).toBe(0);
    });

    it('1/3 : le snapshot est invalidé et recalculé avec le nouveau coefficient', async () => {
      setMaxPerVit(10);
      const creature = liveCreature('inval', 4, 30); // max 70
      expect((service as any).resolveCreatureMaxHealth(creature.spawn.template)).toBe(70);
      withServer();
      setMaxPerVit(20);
      await service.recalculateAllMaxHealthAfterCoefficientChange();
      // Lecture suivante → nouveau coefficient (30 + 4×20 = 110).
      expect((service as any).resolveCreatureMaxHealth(creature.spawn.template)).toBe(110);
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

  // ── V6-B2.5 : coefficients effectifs injectés depuis le service de config ──
  describe("coefficients effectifs (V6-B2.5 Lot 2)", () => {
    const setCoeffs = (over: Partial<CreatureSecondaryCoefficients>) =>
      coefficientsServiceMock.getCoefficients.mockReturnValue({
        ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
        ...over,
      });

    function localPlayer(worldX: number, worldY: number): any {
      return { characterId: "char-1", socketId: "sock-1", worldX, worldY, mapId: 1, name: "T", direction: "down" };
    }

    it("creatureCombatStats lit les coefficients du service (defaults → comportement inchangé)", async () => {
      // Défaut : attackPowerPerStrength=2 → attackPower = baseAttack 5 + strength 10×2 = 25.
      const template = makeTemplate({ strength: 10 });
      const creature = makeCreature({ id: "cc-1", state: "fighting", health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).combatAbilityCache.set(template.key, []);
      const dto = await service.getRuntimeCombatInfo(creature.id);
      expect(coefficientsServiceMock.getCoefficients).toHaveBeenCalled();
      expect(dto!.attackPower).toBe(25);
    });

    it("auto-attaque créature utilise attackPowerPerStrength effectif (custom)", async () => {
      setCoeffs({ attackPowerPerStrength: 5 }); // attackPower = 5 + 10×5 = 55
      const template = makeTemplate({ strength: 10 });
      const creature = makeCreature({ id: "cc-2", worldX: 6080, worldY: 12480, mapId: 1, state: "fighting", spawn: makeSpawn(template) as any });
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0, targetCharacterId: "char-1" };
      const player = localPlayer(6080, 12480);
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0, worldX: 6080, worldY: 12480, mapId: 1 }),
        update: jest.fn().mockResolvedValue({}),
      };
      const emits: { event: string; payload: any }[] = [];
      const mockServer = { to: () => ({ emit: (event: string, payload: any) => emits.push({ event, payload }) }) };

      await (service as any).doFighting(creature, state, template, [player], Date.now(), mockServer);

      const dmg = emits.find((e) => e.event === "character_damaged");
      expect(dmg!.payload.damage).toBe(55);
    });

    it("créature défenseur : defenseTotalPerEndurance effectif réduit les dégâts reçus", async () => {
      setCoeffs({ defenseTotalPerEndurance: 3 }); // defenseTotal = baseArmor 2 + endurance 5×3 = 17
      const template = makeTemplate({ endurance: 5 });
      const creature = makeCreature({ id: "cc-3", worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 20, defense: 3 }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      // 20 − 17 = 3 (vs 20 − 12 = 8 avec le coefficient par défaut de 1).
      expect(result.success && result.damage).toBe(3);
    });

    it("V6-B6 : parryChance > 0 → canParry true dans getRuntimeCombatInfo", async () => {
      // dodge/block désactivés pour isoler la parade (V6-B6 : parade active).
      setCoeffs({ blockPerStrength: 0, blockPerEndurance: 0, dodgePerAgility: 0, parryPerStrength: 1, parryPerDexterity: 1, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 20, dexterity: 20 });
      const creature = makeCreature({ id: "cc-4", state: "fighting", health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).combatAbilityCache.set(template.key, []);

      const dto = await service.getRuntimeCombatInfo(creature.id);
      expect(dto!.derivedSecondaryStats.parryChance).toBe(40); // 20×1 + 20×1 = 40
      expect(dto!.derivedSecondaryStats.blockChance).toBe(0); // coeffs block 0
      expect(dto!.canDodge).toBe(false);
      expect(dto!.canBlock).toBe(false); // blockChance 0
      expect(dto!.canParry).toBe(true); // V6-B6 : parryChance > 0 → parade active
    });

    it("V6-B6 : créature parryChance 100 pare l'auto-attaque physical (dégâts 0, PV inchangés)", async () => {
      // parry certain (100) via strength ; dodge/block désactivés.
      setCoeffs({ parryPerStrength: 100, dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, dexterity: 0 });
      const creature = makeCreature({ id: "cc-par", worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.isParried).toBe(true);
        expect(result.damage).toBe(0);
        expect(result.isDodged).toBe(false);
        expect(result.isBlocked).toBe(false);
      }
      expect(creature.health).toBe(30); // PV créature inchangés
    });

    it("V6-B6 : parade prioritaire — parry 100 + dodge 100 + block 100 → isParried true seul", async () => {
      setCoeffs({ parryPerStrength: 100, dodgePerAgility: 100, blockPerStrength: 100, blockReductionPercent: 50, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 1, endurance: 0, strength: 1 }); // parry/dodge/block 100
      const creature = makeCreature({ id: "cc-pri", worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.isParried).toBe(true); // parade en premier
        expect(result.isDodged).toBe(false);
        expect(result.isBlocked).toBe(false);
        expect(result.damage).toBe(0);
      }
    });

    // ── V6-B7 : contre-attaque créature sur parade du hit principal ──────────
    it("V6-B7 : créature pare le hit principal + counterAttackPower > 0 → contre-attaque créature (riposte remplacée)", async () => {
      // parry 100 (strength) ; counterAttackPower = dex 10 × 1 = 10 ; dodge/block off.
      setCoeffs({
        parryPerStrength: 100, dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0,
        counterPerDexterity: 1, counterPerAgility: 0, counterPerIntelligence: 0, secondaryChanceCap: 100,
      });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, dexterity: 10, intelligence: 0 });
      const creature = makeCreature({ id: "cc-b7", worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 0, health: 100 }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.isParried).toBe(true); // hit principal paré
        expect(result.damage).toBe(0);
        expect(result.riposte).toBeUndefined(); // riposte REMPLACÉE par la contre-attaque
        expect(result.creatureCounterAttack).toBeDefined();
        const cc = result.creatureCounterAttack!;
        expect(cc.isCounterAttack).toBe(true);
        expect(cc.amount).toBe(10); // counterAttackPower 10 − defense joueur 0
        expect(cc.currentHealth).toBe(90); // 100 − 10
        expect(cc.killed).toBe(false);
        expect(cc.isParried).toBe(false); // ANTI-RÉCURSION : le joueur ne pare pas la contre-attaque
        expect(cc.isDodged).toBe(false);
        expect(cc.isBlocked).toBe(false);
        expect(typeof cc.maxHealth).toBe("number");
      }
      expect(creature.health).toBe(30); // créature inchangée (parade = 0 dégât)
    });

    it("V6-B7 : counterAttackPower <= 0 → parade valide mais AUCUNE contre-attaque", async () => {
      setCoeffs({
        parryPerStrength: 100, counterPerDexterity: 0, counterPerAgility: 0, counterPerIntelligence: 0,
        dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100,
      });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, dexterity: 0 });
      const creature = makeCreature({ id: "cc-b7b", worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 0, health: 100 }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.isParried).toBe(true); // parade OK
        expect(result.damage).toBe(0);
        expect(result.creatureCounterAttack).toBeUndefined(); // pas de contre (counter 0)
        expect(result.riposte).toBeUndefined(); // ni riposte (remplacée)
      }
    });

    it("V6-B7 : esquive (pas de parade) → aucune contre-attaque créature", async () => {
      setCoeffs({
        dodgePerAgility: 100, parryPerStrength: 0, counterPerDexterity: 1,
        blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100,
      });
      const template = makeTemplate({ agility: 1, endurance: 0, strength: 0, dexterity: 10 });
      const creature = makeCreature({ id: "cc-b7c", worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 0, health: 100 }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.isDodged).toBe(true);
        expect(result.isParried).toBe(false);
        expect(result.creatureCounterAttack).toBeUndefined(); // contre seulement sur parade
      }
    });

    it("V6-B7 : blocage (pas de parade) → aucune contre-attaque créature", async () => {
      setCoeffs({
        blockPerStrength: 100, blockReductionPercent: 50, parryPerStrength: 0, dodgePerAgility: 0,
        counterPerDexterity: 1, secondaryChanceCap: 100,
      });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, dexterity: 10, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-b7d", worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 0, health: 100 }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.isBlocked).toBe(true);
        expect(result.isParried).toBe(false);
        expect(result.creatureCounterAttack).toBeUndefined();
      }
    });

    it("V6-B7 : joueur tué par la contre-attaque → respawnCharacter appelé une seule fois", async () => {
      setCoeffs({
        parryPerStrength: 100, counterPerDexterity: 10, counterPerAgility: 0, counterPerIntelligence: 0,
        dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100,
      });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, dexterity: 10 }); // counter = 10×10 = 100
      const creature = makeCreature({ id: "cc-b7e", worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 0, health: 5 }));
      const respawnCharacter = jest.fn().mockResolvedValue(undefined);
      const mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
      (service as any).worldService = { getAllConnectedPlayers: jest.fn().mockReturnValue([]), respawnCharacter };
      (service as any).server = mockServer;

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.creatureCounterAttack).toBeDefined();
        expect(result.creatureCounterAttack!.killed).toBe(true);
        expect(result.creatureCounterAttack!.currentHealth).toBe(0);
      }
      expect(respawnCharacter).toHaveBeenCalledTimes(1);
      expect(respawnCharacter).toHaveBeenCalledWith("char-1", mockServer);
    });

    it("V6-B6 : skill physical non-raw joueur → créature peut être paré", async () => {
      setCoeffs({ parryPerStrength: 100, dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-skp", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      // physical + physical → parable ; parry 100 → paré.
      const res = await service.applySkillDamage("cc-skp", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "physical", 0, 100, 0, "physical", { canBeParried: true });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isParried).toBe(true);
        expect(res.damage).toBe(0);
      }
      expect(creature.health).toBe(100);
    });

    // ── V6-B7 Lot 3 : contre-attaque créature sur skill joueur paré ──────────
    it("V6-B7 : skill physical paré + counterAttackPower > 0 → contre-attaque créature", async () => {
      setCoeffs({
        parryPerStrength: 100, counterPerDexterity: 1, counterPerAgility: 0, counterPerIntelligence: 0,
        dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100,
      });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, dexterity: 10, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-b7s", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      const update = jest.fn().mockResolvedValue({});
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue(makeCharacter({ id: "char-1", health: 100, defense: 0 })),
        update,
      };

      const res = await service.applySkillDamage("cc-b7s", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "physical", 0, 100, 0, "physical", { canBeParried: true });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isParried).toBe(true);
        expect(res.damage).toBe(0);
        expect(res.creatureCounterAttack).toBeDefined();
        const cc = res.creatureCounterAttack!;
        expect(cc.isCounterAttack).toBe(true);
        expect(cc.amount).toBe(10); // counterAttackPower (dex 10 × 1) − défense joueur 0
        expect(cc.currentHealth).toBe(90); // 100 − 10
        expect(cc.killed).toBe(false);
        expect(cc.isParried).toBe(false); // ANTI-RÉCURSION : joueur ne pare pas la contre
      }
    });

    it("V6-B7 : skill magic → jamais paré → aucune contre-attaque", async () => {
      setCoeffs({ parryPerStrength: 100, counterPerDexterity: 1, dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, dexterity: 10, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-b7m", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      // magic → non parable MÊME avec canBeParried:true → isParried false → pas de counter.
      const res = await service.applySkillDamage("cc-b7m", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "physical", 0, 100, 0, "magic", { canBeParried: true });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isParried).toBe(false);
        expect(res.creatureCounterAttack).toBeUndefined();
        expect(res.damage).toBe(50);
      }
    });

    it("V6-B7 : skill physical + raw paré → contre-attaque possible (raw parable)", async () => {
      setCoeffs({ parryPerStrength: 100, counterPerDexterity: 1, dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, dexterity: 10, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-b7r", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue(makeCharacter({ id: "char-1", health: 100, defense: 0 })),
        update: jest.fn().mockResolvedValue({}),
      };

      // damageType raw + nature physical → parable via isParried.
      const res = await service.applySkillDamage("cc-b7r", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "raw", 0, 100, 0, "physical", { canBeParried: true });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isParried).toBe(true);
        expect(res.creatureCounterAttack).toBeDefined();
        expect(res.creatureCounterAttack!.amount).toBe(10);
      }
    });

    it("V6-B7 : skill paré mais counterAttackPower <= 0 → pas de contre-attaque", async () => {
      setCoeffs({ parryPerStrength: 100, counterPerDexterity: 0, counterPerAgility: 0, counterPerIntelligence: 0, dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, dexterity: 0, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-b7z", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      const res = await service.applySkillDamage("cc-b7z", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "physical", 0, 100, 0, "physical", { canBeParried: true });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isParried).toBe(true);
        expect(res.creatureCounterAttack).toBeUndefined();
      }
    });

    it("V6-B7 : skill esquivé (pas de parade) → aucune contre-attaque", async () => {
      setCoeffs({ dodgePerAgility: 100, parryPerStrength: 0, parryPerDexterity: 0, counterPerDexterity: 1, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 1, endurance: 0, strength: 0, dexterity: 10, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-b7dg", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      const res = await service.applySkillDamage("cc-b7dg", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "physical", 0, 100, 0, "physical");
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isDodged).toBe(true);
        expect(res.isParried).toBe(false);
        expect(res.creatureCounterAttack).toBeUndefined();
      }
    });

    it("V6-B7 : skill bloqué (pas de parade) → aucune contre-attaque", async () => {
      setCoeffs({ blockPerStrength: 100, blockReductionPercent: 50, parryPerStrength: 0, parryPerDexterity: 0, dodgePerAgility: 0, counterPerDexterity: 1, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, dexterity: 10, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-b7bl", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      const res = await service.applySkillDamage("cc-b7bl", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 40, 9999, 0, "physical", 0, 100, 0, "physical");
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isBlocked).toBe(true);
        expect(res.isParried).toBe(false);
        expect(res.creatureCounterAttack).toBeUndefined();
      }
    });

    it("V6-B7 : joueur tué par la contre-attaque de skill → respawnCharacter appelé une seule fois", async () => {
      setCoeffs({ parryPerStrength: 100, counterPerDexterity: 10, counterPerAgility: 0, counterPerIntelligence: 0, dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, dexterity: 10, baseArmor: 0 }); // counter = 10×10 = 100
      const creature = makeCreature({ id: "cc-b7k", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue(makeCharacter({ id: "char-1", health: 5, defense: 0 })),
        update: jest.fn().mockResolvedValue({}),
      };
      const respawnCharacter = jest.fn().mockResolvedValue(undefined);
      const mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
      (service as any).worldService = { getAllConnectedPlayers: jest.fn().mockReturnValue([]), respawnCharacter };
      (service as any).server = mockServer;

      const res = await service.applySkillDamage("cc-b7k", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "physical", 0, 100, 0, "physical", { canBeParried: true });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.creatureCounterAttack).toBeDefined();
        expect(res.creatureCounterAttack!.killed).toBe(true);
        expect(res.creatureCounterAttack!.currentHealth).toBe(0);
      }
      expect(respawnCharacter).toHaveBeenCalledTimes(1);
      expect(respawnCharacter).toHaveBeenCalledWith("char-1", mockServer);
    });

    it("V6-B6 : skill magic joueur → créature n'est JAMAIS paré", async () => {
      setCoeffs({ parryPerStrength: 100, dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-skm", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      // attackDefenseKind magic → non parable même avec parry 100.
      const res = await service.applySkillDamage("cc-skm", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "physical", 0, 100, 0, "magic");
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isParried).toBe(false);
        expect(res.damage).toBe(50);
      }
    });

    it("V6-B6 : skill physical + raw joueur → PARABLE (raw n'empêche pas la parade)", async () => {
      setCoeffs({ parryPerStrength: 100, dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-skr", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      // attackDefenseKind physical + damageType raw → parable (la nature décide) ; parry 100 → paré.
      const res = await service.applySkillDamage("cc-skr", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "raw", 0, 100, 0, "physical", { canBeParried: true });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isParried).toBe(true);
        expect(res.damage).toBe(0);
      }
      expect(creature.health).toBe(100); // parée → aucun dégât, même raw
    });

    it("V6-B6 : skill magic + raw joueur → NON parable (la nature magic décide)", async () => {
      setCoeffs({ parryPerStrength: 100, dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-skmr", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      // attackDefenseKind magic + raw → non parable même avec parry 100 ET canBeParried:true.
      const res = await service.applySkillDamage("cc-skmr", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "raw", 0, 100, 0, "magic", { canBeParried: true });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isParried).toBe(false);
        expect(res.damage).toBe(50);
      }
    });

    // ── Lot A/B : flags défensifs SERVEUR par skill ─────────────────────────
    it("Lot A/B : skill physical par défaut (canBeParried false) → jamais paré, pas de counter", async () => {
      setCoeffs({ parryPerStrength: 100, counterPerDexterity: 1, dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, dexterity: 10, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-la1", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      // Aucun flag fourni → canBeParried défaut false → skill physical NON paré.
      const res = await service.applySkillDamage("cc-la1", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "physical", 0, 100, 0, "physical");
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isParried).toBe(false);
        expect(res.creatureCounterAttack).toBeUndefined();
        expect(res.damage).toBe(50);
      }
    });

    it("Lot A/B : canBeParried false + raw physical → non parable, pas de counter", async () => {
      setCoeffs({ parryPerStrength: 100, counterPerDexterity: 1, dodgePerAgility: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, dexterity: 10, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-la2", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      const res = await service.applySkillDamage("cc-la2", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "raw", 0, 100, 0, "physical", { canBeParried: false });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isParried).toBe(false);
        expect(res.creatureCounterAttack).toBeUndefined();
        expect(res.damage).toBe(50);
      }
    });

    it("Lot A/B : canBeDodged false → pas d'esquive même dodge 100", async () => {
      setCoeffs({ dodgePerAgility: 100, parryPerStrength: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 1, endurance: 0, strength: 0, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-la3", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      const res = await service.applySkillDamage("cc-la3", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "physical", 0, 100, 0, "physical", { canBeDodged: false });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isDodged).toBe(false); // esquive désactivée par le flag
        expect(res.damage).toBe(50);
      }
    });

    it("Lot A/B : canBeBlocked false → pas de blocage même block 100", async () => {
      setCoeffs({ blockPerStrength: 100, blockReductionPercent: 50, parryPerStrength: 0, dodgePerAgility: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-la4", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      const res = await service.applySkillDamage("cc-la4", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 40, 9999, 0, "physical", 0, 100, 0, "physical", { canBeBlocked: false });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isBlocked).toBe(false); // blocage désactivé par le flag
        expect(res.damage).toBe(40); // dégâts pleins (armure 0)
      }
    });

    it("V6-B6 : skill raw joueur → ESQUIVABLE (esquive indépendante du damageType)", async () => {
      setCoeffs({ dodgePerAgility: 100, parryPerStrength: 0, blockPerStrength: 0, blockPerEndurance: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 1, endurance: 0, strength: 0, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-skrd", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      // dodge 100 → esquivé, quel que soit le damageType (raw n'empêche pas l'esquive).
      const res = await service.applySkillDamage("cc-skrd", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "raw", 0, 100, 0, "physical");
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isDodged).toBe(true);
        expect(res.isParried).toBe(false); // parry 0
        expect(res.damage).toBe(0);
      }
      expect(creature.health).toBe(100);
    });

    it("V6-B4 : créature blockChance 100 + réduction 50 bloque l'auto-attaque physical (après armure)", async () => {
      // block certain (100) via strength ; endurance 0 → defenseTotal reste baseArmor 2.
      setCoeffs({ blockPerStrength: 100, blockReductionPercent: 50, dodgePerAgility: 0, parryPerStrength: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1 }); // blockChance 100
      const creature = makeCreature({ id: "cc-blk", worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        // 10 − armure 2 = 8 → bloqué 50 % → round(8 × 0.5) = 4 ; blockedDamage = 4.
        expect(result.isDodged).toBe(false);
        expect(result.isBlocked).toBe(true);
        expect(result.damage).toBe(4);
        expect(result.blockedDamage).toBe(4);
      }
      expect(creature.health).toBe(26); // 30 − 4
    });

    it("V6-B4 : blockReductionPercent module la réduction (100 % → dégâts 0)", async () => {
      setCoeffs({ blockPerStrength: 100, blockReductionPercent: 100, dodgePerAgility: 0, parryPerStrength: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1 });
      const creature = makeCreature({ id: "cc-blk2", worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.isBlocked).toBe(true);
        expect(result.damage).toBe(0); // round(8 × 0) = 0
        expect(result.blockedDamage).toBe(8);
      }
      expect(creature.health).toBe(30); // PV inchangés
    });

    it("V6-B4 : blockChance 0 → comportement identique (jamais bloqué)", async () => {
      setCoeffs({ blockPerStrength: 0, blockPerEndurance: 0, dodgePerAgility: 0 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 0 });
      const creature = makeCreature({ id: "cc-blk0", worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.isBlocked).toBe(false);
        expect(result.damage).toBe(8); // 10 − 2
      }
    });

    it("V6-B4 : dodge prioritaire sur block (dodge 100 + block 100 → isDodged true, isBlocked false)", async () => {
      setCoeffs({ dodgePerAgility: 100, blockPerStrength: 100, blockReductionPercent: 50, parryPerStrength: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 1, strength: 1, endurance: 0 }); // dodge 100, block 100
      const creature = makeCreature({ id: "cc-dp", worldX: 6080, worldY: 12480, mapId: 1, health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(creature.id, "char-1", { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.isDodged).toBe(true);
        expect(result.isBlocked).toBe(false); // esquive avant blocage → pas de blocage
        expect(result.damage).toBe(0);
      }
      expect(creature.health).toBe(30);
    });

    it("V6-B4 : skill physical joueur → créature peut être bloqué", async () => {
      setCoeffs({ blockPerStrength: 100, blockReductionPercent: 50, dodgePerAgility: 0, parryPerStrength: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, baseArmor: 0 }); // block 100, armure 0
      const creature = makeCreature({ id: "cc-sk", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      const res = await service.applySkillDamage("cc-sk", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 40, 9999, 0, "physical", 0, 100, 0);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isBlocked).toBe(true);
        expect(res.damage).toBe(20); // round(40 × 0.5)
        expect(res.blockedDamage).toBe(20);
      }
    });

    it("V6-B4 : skill raw joueur → créature n'est JAMAIS bloqué", async () => {
      setCoeffs({ blockPerStrength: 100, blockReductionPercent: 50, dodgePerAgility: 0, parryPerStrength: 0, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 0, endurance: 0, strength: 1, baseArmor: 0 });
      const creature = makeCreature({ id: "cc-raw", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      const res = await service.applySkillDamage("cc-raw", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 40, 9999, 0, "raw", 0, 100, 0);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isBlocked).toBe(false); // raw ignore le blocage
        expect(res.damage).toBe(40);
      }
    });

    it("V6-B3 : canDodge devient true dans getRuntimeCombatInfo quand dodgeChance > 0", async () => {
      setCoeffs({ dodgePerAgility: 1, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 20 });
      const creature = makeCreature({ id: "cc-6", state: "fighting", health: 30, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).combatAbilityCache.set(template.key, []);

      const dto = await service.getRuntimeCombatInfo(creature.id);
      expect(dto!.derivedSecondaryStats.dodgeChance).toBe(20);
      expect(dto!.canDodge).toBe(true);
      expect(dto!.canBlock).toBe(false);
      expect(dto!.canParry).toBe(false);
    });

    it("V6-B3 : skill damage joueur → créature peut être esquivé (dodge 100)", async () => {
      setCoeffs({ dodgePerAgility: 100, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 1 }); // dodgeChance 100
      const creature = makeCreature({ id: "cc-7", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      // accuracy attaquant 0 → effectiveDodge 100 → esquive certaine.
      const res = await service.applySkillDamage("cc-7", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "physical", 0, 100, 0);
      expect(res.success).toBe(true);
      if (res.success) expect(res.isDodged).toBe(true);
      expect(creature.health).toBe(100); // PV inchangés
    });

    it("V6-B3 : accuracy joueur 100 annule l'esquive créature d'un skill (dodge 100)", async () => {
      setCoeffs({ dodgePerAgility: 100, secondaryChanceCap: 100 });
      const template = makeTemplate({ agility: 1, baseArmor: 0 }); // dodgeChance 100, armure 0
      const creature = makeCreature({ id: "cc-8", worldX: 6080, worldY: 12480, mapId: 1, health: 100, spawn: makeSpawn(template) as any });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).characterRepository = { update: jest.fn().mockResolvedValue({}) };

      // accuracy attaquant 100 → effectiveDodge = clamp(100 − 100) = 0 → jamais esquivé.
      const res = await service.applySkillDamage("cc-8", "char-1", { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID }, 50, 9999, 0, "physical", 0, 100, 100);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.isDodged).toBe(false);
        expect(res.damage).toBe(50); // dégâts appliqués (armure 0)
      }
    });
  });

  // ── V4-B : applySkillDamage — damageType physical/raw + pénétration ────────
  describe('applySkillDamage — damageType (V4-B)', () => {
    const POS = { worldX: 6080, worldY: 12480, mapId: DEFAULT_MAP_ID };

    function armSkillCreature(baseArmor: number, health = 1000) {
      const template = makeTemplate({ baseArmor, baseHealth: 1000 });
      const spawn = makeSpawn(template);
      const creature = {
        id: 'sk-1',
        spawn,
        health,
        state: 'alive',
        worldX: 6080,
        worldY: 12480,
        mapId: DEFAULT_MAP_ID,
      } as Creature;
      (service as any).liveCreatures.set(creature.id, creature);
      return creature;
    }

    it('physical applique l’armure de la créature (100 − 40 = 60)', async () => {
      armSkillCreature(40);
      const r = await service.applySkillDamage('sk-1', 'char-1', POS, 100, 9999, 0, 'physical');
      expect(r.success).toBe(true);
      if (r.success) expect(r.damage).toBe(60);
    });

    it('raw ignore l’armure (dégâts = 100)', async () => {
      armSkillCreature(40);
      const r = await service.applySkillDamage('sk-1', 'char-1', POS, 100, 9999, 0, 'raw');
      expect(r.success).toBe(true);
      if (r.success) expect(r.damage).toBe(100);
    });

    it('physical + armorPenetrationPercent 50 → armure effective 20, dégâts 80', async () => {
      armSkillCreature(40);
      const r = await service.applySkillDamage('sk-1', 'char-1', POS, 100, 9999, 50, 'physical');
      expect(r.success).toBe(true);
      if (r.success) expect(r.damage).toBe(80);
    });

    it('défaut physical si damageType non fourni', async () => {
      armSkillCreature(40);
      const r = await service.applySkillDamage('sk-1', 'char-1', POS, 100, 9999);
      expect(r.success).toBe(true);
      if (r.success) expect(r.damage).toBe(60);
    });

    it('V4-D physical critique (chance 100, criticalDamage 150) : 100/armure 40 → 110', async () => {
      armSkillCreature(40);
      // armorPen 0, physical, criticalChance 100, criticalDamage 150.
      const r = await service.applySkillDamage('sk-1', 'char-1', POS, 100, 9999, 0, 'physical', 100, 150);
      expect(r.success).toBe(true);
      if (r.success) expect(r.damage).toBe(110); // round(100 × 1.5) − 40
    });

    it('V4-D raw critique (chance 100, criticalDamage 150) → 150 (ignore armure)', async () => {
      armSkillCreature(40);
      const r = await service.applySkillDamage('sk-1', 'char-1', POS, 100, 9999, 0, 'raw', 100, 150);
      expect(r.success).toBe(true);
      if (r.success) expect(r.damage).toBe(150);
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
        { provide: getRepositoryToken(CreatureTemplateSkill), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(SkillDefinition), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Character), useValue: { findOne: jest.fn().mockResolvedValue(null), update: jest.fn() } },
        { provide: WorldService, useValue: { getAllConnectedPlayers: jest.fn().mockReturnValue([]) } },
        { provide: ProgressionService, useValue: { applyCharacterXpInTx: jest.fn() } },
        { provide: MasteriesService, useValue: { applyMasteryXpInTx: jest.fn() } },
        { provide: MasteryEffectsService, useValue: { getMasteryBonuses: jest.fn().mockResolvedValue({ statModifiers: { percent: {}, flat: {} }, combat: { damagePercent: 0, damageFlat: 0 } }), getPermanentStatModifiers: jest.fn().mockResolvedValue({ percent: {}, flat: {} }) } },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: CreatureSecondaryCoefficientsService, useValue: makeCoefficientsServiceMock() },
        { provide: CreatureTemplateOverridesService, useValue: makeOverridesServiceMock() },
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
        { provide: getRepositoryToken(CreatureTemplateSkill), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(SkillDefinition), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Character), useValue: { findOne: jest.fn().mockResolvedValue(null), update: jest.fn() } },
        { provide: WorldService, useValue: { getAllConnectedPlayers: jest.fn().mockReturnValue([]) } },
        { provide: ProgressionService, useValue: { applyCharacterXpInTx: jest.fn() } },
        { provide: MasteriesService, useValue: { applyMasteryXpInTx: jest.fn() } },
        { provide: MasteryEffectsService, useValue: { getMasteryBonuses: jest.fn().mockResolvedValue({ statModifiers: { percent: {}, flat: {} }, combat: { damagePercent: 0, damageFlat: 0 } }), getPermanentStatModifiers: jest.fn().mockResolvedValue({ percent: {}, flat: {} }) } },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: CreatureSecondaryCoefficientsService, useValue: makeCoefficientsServiceMock() },
        { provide: CreatureTemplateOverridesService, useValue: makeOverridesServiceMock() },
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

    it("V6-B2 : auto-attaque créature — strength augmente les dégâts infligés au joueur", async () => {
      // strength 10 → attackPower = baseAttack 5 + 10×2 = 25. Joueur defense 0 → dégâts 25.
      const template = makeTemplate({ strength: 10 });
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting", spawn: makeSpawn(template) as any });
      const state = {
        dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0,
        targetCharacterId: "char-1",
      };
      const player = makePlayer(6080, 12480);
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0, worldX: 6080, worldY: 12480, mapId: 1 }),
        update: jest.fn().mockResolvedValue({}),
      };
      const emits: { event: string; payload: any }[] = [];
      const mockServer = { to: () => ({ emit: (event: string, payload: any) => emits.push({ event, payload }) }) };

      await (service as any).doFighting(creature, state, template, [player], Date.now(), mockServer);

      const dmgEvent = emits.find((e) => e.event === "character_damaged");
      expect(dmgEvent).toBeDefined();
      expect(dmgEvent!.payload.damage).toBe(25);
      expect(dmgEvent!.payload.health).toBe(75);
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

  // ─── V5-B : cast d'une capacité damage configurée (via resolveCombatHit) ────
  describe("doFighting — capacités damage créature (V5-B)", () => {
    function makePlayer(worldX: number, worldY: number): any {
      return { characterId: "char-1", socketId: "sock-1", worldX, worldY, mapId: 1, name: "Test" };
    }
    function fightingState() {
      return { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0, targetCharacterId: "char-1" };
    }
    const ABILITY = {
      skillKey: "fireball",
      skillName: "Boule de feu",
      effectType: "damage" as const,
      displayOrder: 0,
      rangeWU: 5000,
      cooldownMs: 3000,
      damageType: "physical" as const,
      scaling: { derivedCoefficients: { physicalAttack: 2 } },
    };
    const combatOf = (emits: any[]) =>
      emits.find((e) => e.event === "combat:event" && e.payload.type === "damage");

    // Force les stats dérivées serveur du joueur défenseur (esquive/blocage/défense).
    function mockDefenderDerived(derived: Record<string, number>) {
      jest
        .spyOn(CharacterStatsCalculator, "compute")
        .mockReturnValue({ derived: { defense: 0, dodgeChance: 0, blockChance: 0, blockReductionPercent: 0, ...derived } } as any);
    }
    function captureServer(emits: { event: string; payload: any }[]) {
      return { to: () => ({ emit: (event: string, payload: any) => emits.push({ event, payload }) }) };
    }

    afterEach(() => jest.restoreAllMocks());

    it("capacité en portée (au-delà de la mêlée) → cast via resolver, combat:event skillName", async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      (service as any).combatAbilityCache.set("turkey", [ABILITY]);
      const player = makePlayer(6080 + 2000, 12480); // dist 2000 > MELEE, <= rangeWU
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0 }),
        update: jest.fn().mockResolvedValue({}),
      };
      const emits: { event: string; payload: any }[] = [];
      const server = { to: () => ({ emit: (event: string, payload: any) => emits.push({ event, payload }) }) };

      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [player], Date.now(), server);

      const ev = combatOf(emits).payload;
      expect(ev).toMatchObject({ sourceType: "creature", targetType: "player", skillName: "Boule de feu", amount: 10 });
      expect(emits.some((e) => e.event === "character_damaged")).toBe(true);
    });

    it("hors portée du skill mais cible en mêlée → fallback auto-attaque (aucun skillName)", async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      (service as any).combatAbilityCache.set("turkey", [{ ...ABILITY, rangeWU: 500 }]);
      const player = makePlayer(6080 + 800, 12480); // 800 > skill range 500, <= MELEE
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0 }),
        update: jest.fn().mockResolvedValue({}),
      };
      const emits: { event: string; payload: any }[] = [];
      const server = { to: () => ({ emit: (event: string, payload: any) => emits.push({ event, payload }) }) };

      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [player], Date.now(), server);

      const ev = combatOf(emits).payload;
      expect(ev.skillName).toBeUndefined();
      expect(ev.amount).toBe(5); // auto-attaque : baseAttack 5 − defense 0
    });

    it("skill créature passe par le contrat défensif joueur (esquive via resolver)", async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      (service as any).combatAbilityCache.set("turkey", [ABILITY]);
      const player = makePlayer(6080 + 1000, 12480);
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0 }),
        update: jest.fn().mockResolvedValue({}),
      };
      // Esquive forcée : dodgeChance 100 dans les dérivées calculées.
      (service as any).derivedStats = {
        getDefinitions: jest.fn().mockResolvedValue([]),
      };
      jest
        .spyOn(CharacterStatsCalculator, "compute")
        .mockReturnValue({ derived: { defense: 0, dodgeChance: 100, blockChance: 0, blockReductionPercent: 0 } } as any);
      const emits: { event: string; payload: any }[] = [];
      const server = { to: () => ({ emit: (event: string, payload: any) => emits.push({ event, payload }) }) };

      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [player], Date.now(), server);

      const ev = combatOf(emits).payload;
      expect(ev.isDodged).toBe(true);
      expect(ev.amount).toBe(0);
      (CharacterStatsCalculator.compute as jest.Mock).mockRestore();
    });

    it("pickCreatureDamageAbility respecte portée et cooldown skill", () => {
      const now = 100000;
      expect((service as any).pickCreatureDamageAbility("c1", [ABILITY], 9999, now)).toBeNull();
      expect((service as any).pickCreatureDamageAbility("c1", [ABILITY], 1000, now)?.skillKey).toBe("fireball");
      (service as any).creatureSkillCooldowns.set("c1", new Map([["fireball", now - 1000]]));
      expect((service as any).pickCreatureDamageAbility("c1", [ABILITY], 1000, now)).toBeNull();
      (service as any).creatureSkillCooldowns.set("c1", new Map([["fireball", now - 4000]]));
      expect((service as any).pickCreatureDamageAbility("c1", [ABILITY], 1000, now)?.skillKey).toBe("fireball");
    });

    it("getCombatAbilities inclut damage + heal, exclut désactivé, fallback range, cache + invalidation", async () => {
      const abilityRepo = {
        find: jest.fn().mockResolvedValue([
          { skillKey: "heal", enabled: true, displayOrder: 0 },
          { skillKey: "off", enabled: true, displayOrder: 1 },
          { skillKey: "fireball", enabled: true, displayOrder: 2 },
        ]),
      };
      const skillRepo = {
        find: jest.fn().mockResolvedValue([
          { key: "heal", name: "Soin", enabled: true, effectType: "heal", rangeWU: 100, cooldownMs: 1000, damageType: "physical", scaling: {} },
          { key: "off", name: "Off", enabled: false, effectType: "damage", rangeWU: 100, cooldownMs: 1000, damageType: "physical", scaling: {} },
          { key: "fireball", name: "Boule de feu", enabled: true, effectType: "damage", rangeWU: 0, cooldownMs: 3000, damageType: "raw", scaling: {} },
        ]),
      };
      (service as any).creatureTemplateSkillRepository = abilityRepo;
      (service as any).skillDefinitionRepository = skillRepo;

      const out = await (service as any).getCombatAbilities(1, "goblin");
      // V5-D1-A : heal + fireball conservés (tri displayOrder), off (désactivé) exclu.
      expect(out).toHaveLength(2);
      expect(out.map((a: any) => a.skillKey)).toEqual(["heal", "fireball"]);
      expect(out.find((a: any) => a.skillKey === "heal")).toMatchObject({ effectType: "heal" });
      expect(out.find((a: any) => a.skillKey === "fireball")).toMatchObject({ effectType: "damage", damageType: "raw", rangeWU: 1280 });

      await (service as any).getCombatAbilities(1, "goblin");
      expect(abilityRepo.find).toHaveBeenCalledTimes(1); // cache

      service.invalidateAbilitiesCache("goblin");
      await (service as any).getCombatAbilities(1, "goblin");
      expect(abilityRepo.find).toHaveBeenCalledTimes(2); // reload
    });

    it("V5-D1-A : une capacité heal n'est PAS castée en combat (fallback auto-attaque)", async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      // Seule capacité = heal, en portée → ne doit pas être castée ; auto-attaque prend le relais.
      (service as any).combatAbilityCache.set("turkey", [
        { skillKey: "heal", skillName: "Soin", effectType: "heal", displayOrder: 0, rangeWU: 5000, cooldownMs: 1000, damageType: "physical", scaling: {} },
      ]);
      const player = makePlayer(6080 + 800, 12480);
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0 }),
        update: jest.fn().mockResolvedValue({}),
      };
      (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue([]) };
      mockDefenderDerived({ defense: 0 });
      const emits: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [player], Date.now(), captureServer(emits));
      const ev = combatOf(emits).payload;
      expect(ev.skillName).toBeUndefined(); // heal non casté
      expect(ev.amount).toBe(5); // auto-attaque legacy
    });

    // Helper : lance un cast de skill (créature en portée) et renvoie l'event dmg.
    async function castSkillAndCapture(ability: any, derived: Record<string, number>) {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      (service as any).combatAbilityCache.set("turkey", [ability]);
      const player = makePlayer(6080 + 1000, 12480); // en portée skill, > pas requis
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0 }),
        update: jest.fn().mockResolvedValue({}),
      };
      (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue([]) };
      mockDefenderDerived(derived);
      const emits: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [player], Date.now(), captureServer(emits));
      return { emits, ev: combatOf(emits)?.payload };
    }

    // 1. Skill physical bloqué par le joueur (via resolver).
    it("skill physical → BLOQUÉ par le joueur (isBlocked + blockedDamage), pas de fallback", async () => {
      const { ev } = await castSkillAndCapture(ABILITY, { defense: 0, blockChance: 100, blockReductionPercent: 50 });
      // amount skill = attackPower 5 × coef 2 = 10 ; block 50 % → round(10×0.5)=5.
      expect(ev.skillName).toBe("Boule de feu");
      expect(ev.isBlocked).toBe(true);
      expect(ev.blockedDamage).toBe(5);
      expect(ev.amount).toBe(5);
    });

    // 2. Skill raw ignore blocage ET armure.
    it("skill raw → ignore blocage + armure", async () => {
      const rawAbility = { ...ABILITY, damageType: "raw" as const };
      const { ev } = await castSkillAndCapture(rawAbility, { defense: 100, blockChance: 100, blockReductionPercent: 50 });
      expect(ev.skillName).toBe("Boule de feu");
      expect(ev.isBlocked).toBe(false);
      expect(ev.blockedDamage).toBe(0);
      expect(ev.amount).toBe(10); // 10 brut, ni armure (100) ni blocage
    });

    // 3. Skill créature ne déclenche JAMAIS la parade (canParry false forcé).
    it("skill créature → parade JAMAIS déclenchée, aucune contre-attaque", async () => {
      const { ev } = await castSkillAndCapture(ABILITY, { defense: 0, parryChance: 100 });
      expect(ev.skillName).toBe("Boule de feu");
      expect(ev.isParried).toBeUndefined(); // le hit skill ne porte pas isParried
      expect(ev.amount).toBe(10); // hit appliqué normalement (pas annulé)
      expect(ev.targetDied).toBeUndefined();
    });

    // 7. Payload de l'event de cast skill.
    it("event payload skill : creature→player, skillName, flags défensifs propagés", async () => {
      const { ev } = await castSkillAndCapture(ABILITY, { defense: 0, dodgeChance: 100 });
      expect(ev.sourceType).toBe("creature");
      expect(ev.targetType).toBe("player");
      expect(ev.skillName).toBe("Boule de feu");
      expect(ev.isDodged).toBe(true); // esquive du joueur via resolver
      expect(ev.amount).toBe(0);
      // skillKey non porté par l'event (format actuel = skillName uniquement).
      expect(ev.skillKey).toBeUndefined();
    });

    // ══ D1 : mitigation magique du joueur DÉFENSEUR (créature → joueur) ════════
    // ABILITY : attackPower 5 × coef 2 = 10 dégâts BRUTS avant mitigation.
    // Formule (inchangée) : finalDamage = round(raw × (1 − effectiveResistance/100)),
    // plancher 1 si raw > 0. effectiveResistance = magicResistanceGlobal + école.
    const MAGIC_AIR = {
      ...ABILITY,
      skillKey: "gust",
      skillName: "Rafale",
      damageType: "magic" as const,
      magicSchool: "air" as const,
    };

    // ── Résolution de la résistance ───────────────────────────────────────────
    it("D1 : résistance GLOBALE seule (global 20, air 0 → effective 20 → 8)", async () => {
      const { ev } = await castSkillAndCapture(MAGIC_AIR, {
        magicResistanceGlobal: 20,
        magicResistanceAir: 0,
      });
      expect(ev.skillName).toBe("Rafale");
      expect(ev.amount).toBe(8); // round(10 × 0.8)
    });

    it("D1 : GLOBALE + ÉCOLE additionnées (global 10 + air 40 = 50 → 5)", async () => {
      const { ev } = await castSkillAndCapture(MAGIC_AIR, {
        magicResistanceGlobal: 10,
        magicResistanceAir: 40,
      });
      expect(ev.amount).toBe(5); // round(10 × 0.5)
    });

    it("D1 : ÉCOLE seule (air 40 → 6)", async () => {
      const { ev } = await castSkillAndCapture(MAGIC_AIR, { magicResistanceAir: 40 });
      expect(ev.amount).toBe(6); // round(10 × 0.6)
    });

    it("D1 : isolation des écoles — air élevé n'atténue PAS un skill FIRE", async () => {
      const magicFire = { ...MAGIC_AIR, magicSchool: "fire" as const };
      const { ev } = await castSkillAndCapture(magicFire, {
        magicResistanceAir: 80, // école air, ignorée pour un hit fire
        magicResistanceGlobal: 0,
      });
      expect(ev.amount).toBe(10); // résistance fire 0 + globale 0 → aucune mitigation
    });

    // ── Valeurs limites (aucun clamp, plancher 1) ─────────────────────────────
    it("D1 : résistance NÉGATIVE = vulnérabilité, aucun clamp (−50 → 15)", async () => {
      const { ev } = await castSkillAndCapture(MAGIC_AIR, { magicResistanceAir: -50 });
      expect(ev.amount).toBe(15); // round(10 × 1.5)
    });

    it("D1 : résistance ≥ 100 → plancher 1 (aucune immunité) : global 20 + air 100 = 120", async () => {
      const { ev } = await castSkillAndCapture(MAGIC_AIR, {
        magicResistanceGlobal: 20,
        magicResistanceAir: 100,
      });
      expect(ev.amount).toBe(1); // round(10 × −0.2) = −2 → max(1, …) = 1
    });

    it("D1 : résistance = 100 exacte → plancher 1 (hit valide positif)", async () => {
      const { ev } = await castSkillAndCapture(MAGIC_AIR, { magicResistanceAir: 100 });
      expect(ev.amount).toBe(1); // round(10 × 0) = 0 → max(1, 0) = 1
    });

    // ── Validation : magic sans école → REJET explicite (aucun dégât) ─────────
    it("D1 : skill magic SANS école → hit rejeté, PV joueur inchangés, aucun event dégât", async () => {
      const noSchool = { ...MAGIC_AIR, magicSchool: null as any };
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      (service as any).combatAbilityCache.set("turkey", [noSchool]);
      const player = makePlayer(6080 + 1000, 12480);
      const update = jest.fn().mockResolvedValue({});
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0 }),
        update,
      };
      (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue([]) };
      mockDefenderDerived({ magicResistanceGlobal: 10, magicResistanceAir: 40 });
      const emits: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [player], Date.now(), captureServer(emits));
      // Rejet : aucun dégât appliqué, PV non écrits, aucun character_damaged.
      expect(update).not.toHaveBeenCalled();
      expect(emits.some((e) => e.event === "character_damaged")).toBe(false);
      expect(combatOf(emits)).toBeUndefined();
    });

    // ── Non-régression : physical / raw / esquive / blocage / auto-attaque ────
    it("D1 : skill PHYSICAL ignore les résistances magiques (→ 10)", async () => {
      const { ev } = await castSkillAndCapture(ABILITY, {
        magicResistanceGlobal: 10,
        magicResistanceAir: 40,
      });
      expect(ev.amount).toBe(10); // physical : armure seule (0), résistances ignorées
    });

    it("D1 : dégâts RAW ignorent les résistances magiques (→ 10)", async () => {
      const rawAbility = { ...ABILITY, damageType: "raw" as const };
      const { ev } = await castSkillAndCapture(rawAbility, {
        magicResistanceGlobal: 50,
        magicResistanceAir: 50,
      });
      expect(ev.amount).toBe(10); // raw : ni armure ni résistance magique
    });

    it("D1 : esquive réussie sur un hit magique → 0 dégât (le plancher 1 n'est PAS forcé)", async () => {
      const { ev } = await castSkillAndCapture(MAGIC_AIR, {
        dodgeChance: 100,
        magicResistanceGlobal: 10,
        magicResistanceAir: 40,
      });
      expect(ev.isDodged).toBe(true);
      expect(ev.amount).toBe(0); // esquive → 0, pas de plancher
    });

    it("D1 : hit magique NON bloqué (magic ignore le blocage physique)", async () => {
      const { ev } = await castSkillAndCapture(MAGIC_AIR, {
        blockChance: 100,
        blockReductionPercent: 100,
        magicResistanceAir: 40,
      });
      expect(ev.isBlocked).toBe(false); // magic ignore le blocage physique
      expect(ev.amount).toBe(6); // seule la résistance magique s'applique (air 40)
    });

    it("D1 : auto-attaque créature (physical) inchangée malgré des résistances magiques élevées", async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      // Aucune capacité → fallback auto-attaque physical (baseAttack 5 − défense 0).
      (service as any).combatAbilityCache.set("turkey", []);
      const player = makePlayer(6080 + 800, 12480); // <= MELEE
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0 }),
        update: jest.fn().mockResolvedValue({}),
      };
      (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue([]) };
      mockDefenderDerived({ magicResistanceGlobal: 90, magicResistanceAir: 90 });
      const emits: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [player], Date.now(), captureServer(emits));
      const ev = combatOf(emits).payload;
      expect(ev.skillName).toBeUndefined(); // auto-attaque
      expect(ev.amount).toBe(5); // physical inchangé, résistances magiques ignorées
    });

    // ── getCombatAbilities : préservation du type magic + école ───────────────
    it("D1 : getCombatAbilities préserve magic + magicSchool (jamais collapse), physical → école null", async () => {
      (service as any).creatureTemplateSkillRepository = {
        find: jest.fn().mockResolvedValue([
          { skillKey: "gust", enabled: true, displayOrder: 0 },
          { skillKey: "poke", enabled: true, displayOrder: 1 },
        ]),
      };
      (service as any).skillDefinitionRepository = {
        find: jest.fn().mockResolvedValue([
          { key: "gust", name: "Rafale", enabled: true, effectType: "damage", rangeWU: 100, cooldownMs: 1000, damageType: "magic", magicSchool: "air", scaling: {} },
          { key: "poke", name: "Coup", enabled: true, effectType: "damage", rangeWU: 100, cooldownMs: 1000, damageType: "physical", magicSchool: null, scaling: {} },
        ]),
      };
      service.invalidateAbilitiesCache("wind");
      const out = await (service as any).getCombatAbilities(1, "wind");
      expect(out.find((a: any) => a.skillKey === "gust")).toMatchObject({ damageType: "magic", magicSchool: "air" });
      expect(out.find((a: any) => a.skillKey === "poke")).toMatchObject({ damageType: "physical", magicSchool: null });
    });

    // ── Équipement : PIPELINE RÉEL (CharacterStatsCalculator non mocké) ────────
    // Un objet équipé donnant de l'Esprit augmente magicResistanceAir via le
    // coefficient primaire (0.5), et la mitigation s'applique réellement.
    // Définitions minimales : les autres dérivées sont complétées à 0.
    const RESIST_DEFS = [
      { key: "magicResistanceGlobal", enabled: true, baseValue: 0, primaryCoefficients: {}, minValue: null, maxValue: null, rawStatSource: null },
      { key: "magicResistanceAir", enabled: true, baseValue: 0, primaryCoefficients: { spirit: 0.5 }, minValue: null, maxValue: null, rawStatSource: null },
    ];

    async function castMagicRealPipeline(char: any) {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      (service as any).combatAbilityCache.set("turkey", [MAGIC_AIR]);
      const player = makePlayer(6080 + 1000, 12480);
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue(char),
        update: jest.fn().mockResolvedValue({}),
      };
      (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue(RESIST_DEFS) };
      // Pas de mockDefenderDerived : CharacterStatsCalculator.compute est RÉEL.
      const emits: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [player], Date.now(), captureServer(emits));
      return combatOf(emits)?.payload;
    }

    it("D1 : équipement (Esprit) augmente magicResistanceAir → mitigation réelle (pipeline complet)", async () => {
      // Objet ÉQUIPÉ : spirit 20 → final.spirit 20 → magicResistanceAir 0.5×20 = 10.
      const char = {
        id: "char-1", health: 100, attack: 0, defense: 0, maxHealth: 100, baseSpirit: 0,
        equipment: [{ item: { statBonuses: { spirit: 20 }, attack: 0, defense: 0 } }],
      };
      const ev = await castMagicRealPipeline(char);
      expect(ev.amount).toBe(9); // résistance air 10 → round(10 × 0.9)
    });

    it("D1 : le MÊME objet uniquement dans l'INVENTAIRE (non équipé) → aucune contribution", async () => {
      // equipment vide : l'objet spirit n'est pas porté → magicResistanceAir 0.
      const char = {
        id: "char-1", health: 100, attack: 0, defense: 0, maxHealth: 100, baseSpirit: 0,
        equipment: [],
      };
      const ev = await castMagicRealPipeline(char);
      expect(ev.amount).toBe(10); // aucune résistance → dégâts pleins
    });

    // 4/5/6. Fallback : capacité inutilisable → AUTO-ATTAQUE existante (V1, legacy).
    // NOTE : l'auto-attaque créature n'applique PAS esquive/blocage/parade
    // (chemin legacy `max(baseAttack−défense,1)`, inchangé V5-B) — seuls la
    // riposte (V4-I) et les skills (V5-B, resolver) portent le contrat défensif.
    it("fallback HORS PORTÉE → auto-attaque (no skillName) ; V5-G : esquive joueur appliquée", async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      (service as any).combatAbilityCache.set("turkey", [{ ...ABILITY, rangeWU: 500 }]);
      const player = makePlayer(6080 + 800, 12480); // 800 > skill 500, <= MELEE
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0 }),
        update: jest.fn().mockResolvedValue({}),
      };
      (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue([]) };
      mockDefenderDerived({ defense: 0, dodgeChance: 100 }); // V5-G : désormais prise en compte
      const emits: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [player], Date.now(), captureServer(emits));
      const ev = combatOf(emits).payload;
      expect(ev.skillName).toBeUndefined(); // toujours le chemin auto-attaque
      expect(ev.isDodged).toBe(true); // V5-G : l'esquive s'applique maintenant
      expect(ev.amount).toBe(0);
    });

    it("fallback COOLDOWN → auto-attaque (no skillName) ; V5-G : blocage joueur appliqué", async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      (service as any).combatAbilityCache.set("turkey", [ABILITY]);
      const now = Date.now();
      (service as any).creatureSkillCooldowns.set(creature.id, new Map([["fireball", now]])); // vient de caster
      const player = makePlayer(6080 + 800, 12480); // en portée MELEE
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0 }),
        update: jest.fn().mockResolvedValue({}),
      };
      (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue([]) };
      mockDefenderDerived({ defense: 0, blockChance: 100, blockReductionPercent: 50 }); // V5-G : prise en compte
      const emits: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [player], now, captureServer(emits));
      const ev = combatOf(emits).payload;
      expect(ev.skillName).toBeUndefined(); // toujours le chemin auto-attaque
      expect(ev.isBlocked).toBe(true); // V5-G : le blocage s'applique maintenant
      expect(ev.amount).toBe(3); // baseAttack 5 → round(5 × (1 − 0.5)) = 3
    });

    it("fallback SANS capacité → auto-attaque legacy (pas de skillName)", async () => {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      (service as any).combatAbilityCache.set("turkey", []); // aucune capacité
      const player = makePlayer(6080 + 800, 12480);
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0 }),
        update: jest.fn().mockResolvedValue({}),
      };
      (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue([]) };
      mockDefenderDerived({ defense: 0 });
      const emits: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [player], Date.now(), captureServer(emits));
      const ev = combatOf(emits).payload;
      expect(ev.skillName).toBeUndefined();
      expect(ev.amount).toBe(5);
    });

    // ─── Cycle de cooldown (temps contrôlé via le param `now` de doFighting) ───
    const SHORT = {
      skillKey: "fireball",
      skillName: "Boule de feu",
      effectType: "damage" as const,
      displayOrder: 0,
      rangeWU: 5000,
      cooldownMs: 1000,
      damageType: "physical" as const,
      scaling: { derivedCoefficients: { physicalAttack: 2 } },
    };
    function combatSetup() {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting" });
      const player = makePlayer(6080 + 1000, 12480); // en portée skill
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100000, defense: 0 }),
        update: jest.fn().mockResolvedValue({}),
      };
      (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue([]) };
      mockDefenderDerived({ defense: 0 });
      return creature;
    }
    const skillEvents = (emits: any[]) =>
      emits.filter((e) => e.event === "combat:event" && e.payload.type === "damage" && e.payload.skillName);

    // Cas A/D : le skill est relancé après expiration du cooldown (pas 1 seule fois).
    it("Cas A/D : recast après expiration du cooldown sur plusieurs fenêtres d'action", async () => {
      const creature = combatSetup();
      (service as any).combatAbilityCache.set("turkey", [SHORT]);
      const emits: { event: string; payload: any }[] = [];
      const server = captureServer(emits);
      const T = 1_000_000;

      // T : 1er cast (cd vide → dispo, fenêtre d'action ouverte).
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [makePlayer(7080, 12480)], T, server);
      // T+500 : fenêtre d'action fermée (< 1500) → aucun nouveau cast.
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [makePlayer(7080, 12480)], T + 500, server);
      // T+1500 : fenêtre ouverte ET cooldown expiré (1500 ≥ 1000) → recast.
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [makePlayer(7080, 12480)], T + 1500, server);
      // T+3000 : encore un recast (combat long).
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [makePlayer(7080, 12480)], T + 3000, server);

      const casts = skillEvents(emits);
      expect(casts.length).toBe(3); // 3 casts, PAS un seul
      expect(casts.every((e) => e.payload.skillName === "Boule de feu")).toBe(true);
    });

    // Cas A : entre deux casts, le skill est bien ignoré tant qu'il est en cooldown.
    it("Cas A : skill sauté pendant le cooldown (fenêtre ouverte mais cd non expiré)", async () => {
      const creature = combatSetup();
      // cd long (5000) → à la 2e fenêtre (1500) le skill est encore en cooldown.
      (service as any).combatAbilityCache.set("turkey", [{ ...SHORT, cooldownMs: 5000 }]);
      const emits: { event: string; payload: any }[] = [];
      const server = captureServer(emits);
      const T = 2_000_000;
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [makePlayer(6580, 12480)], T, server); // cast
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [makePlayer(6580, 12480)], T + 1500, server); // cd non expiré → fallback
      const casts = skillEvents(emits);
      expect(casts.length).toBe(1); // toujours en cooldown à T+1500
      // à T+5000 : cd expiré → recast
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [makePlayer(6580, 12480)], T + 5000, server);
      expect(skillEvents(emits).length).toBe(2);
    });

    // Cas C : capacité A en cooldown → capacité B disponible est choisie.
    it("Cas C : A en cooldown → B disponible choisie (ordre respecté)", () => {
      const A = { ...SHORT, skillKey: "a", displayOrder: 0, cooldownMs: 5000 };
      const B = { ...SHORT, skillKey: "b", displayOrder: 1, cooldownMs: 1000 };
      const now = 3_000_000;
      (service as any).creatureSkillCooldowns.set("c1", new Map([["a", now]])); // A vient d'être castée
      const chosen = (service as any).pickCreatureDamageAbility("c1", [A, B], 1000, now + 1500);
      expect(chosen?.skillKey).toBe("b"); // A sautée (cd), B choisie
    });

    // Cas B : getRuntimeCombatInfo — cooldownRemainingMs diminue puis s'annule.
    it("Cas B : cooldownRemainingMs décrémente et onCooldown repasse à false", async () => {
      const creature = makeCreature({ state: "fighting", health: 20 });
      (service as any).liveCreatures.set(creature.id, creature);
      (service as any).combatAbilityCache.set("turkey", [SHORT]); // cooldownMs 1000

      // Vient de caster (lastCast = maintenant) → onCooldown true, remaining ~1000.
      (service as any).creatureSkillCooldowns.set(creature.id, new Map([["fireball", Date.now()]]));
      const t0 = await service.getRuntimeCombatInfo(creature.id);
      const a0 = t0!.abilities!.find((a) => a.skillKey === "fireball")!;
      expect(a0.onCooldown).toBe(true);
      expect(a0.cooldownRemainingMs).toBeGreaterThan(0);
      expect(a0.cooldownRemainingMs).toBeLessThanOrEqual(1000);

      // Cast il y a > cooldownMs → expiré : remaining 0, onCooldown false.
      (service as any).creatureSkillCooldowns.set(creature.id, new Map([["fireball", Date.now() - 1500]]));
      const t1 = await service.getRuntimeCombatInfo(creature.id);
      const a1 = t1!.abilities!.find((a) => a.skillKey === "fireball")!;
      expect(a1.onCooldown).toBe(false);
      expect(a1.cooldownRemainingMs).toBe(0);
    });

    // ─── V5-D1-B : self-heal créature ──────────────────────────────────────────
    const HEAL = {
      skillKey: "soin",
      skillName: "Soin",
      effectType: "heal" as const,
      displayOrder: 0,
      rangeWU: 0,
      cooldownMs: 1000,
      damageType: "physical" as const,
      scaling: { derivedCoefficients: { healingPower: 2 } }, // healingPower←attackPower(5) → 10
    };
    function healSetup(health: number) {
      const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting", health });
      (service as any).characterRepository = {
        findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0 }),
        update: jest.fn().mockResolvedValue({}),
      };
      (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue([]) };
      mockDefenderDerived({ defense: 0 });
      return creature;
    }
    const healOf = (emits: any[]) =>
      emits.find((e) => e.event === "combat:event" && e.payload.type === "heal");

    it("A. blessée + heal dispo → heal casté (PV augmentent, event heal, cooldown enregistré)", async () => {
      const creature = healSetup(10); // maxHealth 30
      (service as any).combatAbilityCache.set("turkey", [HEAL]);
      const now = 5_000_000;
      const emits: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [makePlayer(6880, 12480)], now, captureServer(emits));
      expect(creature.health).toBe(20); // 10 + 10
      const heal = healOf(emits);
      expect(heal.payload).toMatchObject({ type: "heal", sourceType: "creature", targetType: "creature", amount: 10, skillName: "Soin" });
      expect((service as any).creatureSkillCooldowns.get(creature.id).get("soin")).toBe(now);
    });

    it("B. full HP → heal NON casté (auto-attaque prend le relais)", async () => {
      const creature = healSetup(30); // = maxHealth
      (service as any).combatAbilityCache.set("turkey", [HEAL]);
      const emits: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [makePlayer(6880, 12480)], Date.now(), captureServer(emits));
      expect(healOf(emits)).toBeUndefined();
      expect(creature.health).toBe(30);
      expect(combatOf(emits).payload.skillName).toBeUndefined(); // auto-attaque legacy
    });

    it("C. blessée + heal ET damage dispo → heal prioritaire, damage non lancé", async () => {
      const creature = healSetup(10);
      (service as any).combatAbilityCache.set("turkey", [HEAL, { ...ABILITY, displayOrder: 1 }]);
      const emits: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [makePlayer(6880, 12480)], Date.now(), captureServer(emits));
      expect(healOf(emits)).toBeDefined();
      // Aucun event damage skill dans le même tick.
      const dmgSkill = emits.find((e) => e.event === "combat:event" && e.payload.type === "damage" && e.payload.skillName);
      expect(dmgSkill).toBeUndefined();
    });

    it("D. heal en cooldown → non casté, auto-attaque fallback ; recast après expiration", async () => {
      const creature = healSetup(10);
      (service as any).combatAbilityCache.set("turkey", [HEAL]);
      const now = 6_000_000;
      (service as any).creatureSkillCooldowns.set(creature.id, new Map([["soin", now]])); // vient de heal
      const emits1: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [makePlayer(6880, 12480)], now, captureServer(emits1));
      expect(healOf(emits1)).toBeUndefined(); // cooldown → pas de heal
      expect(combatOf(emits1).payload.skillName).toBeUndefined(); // auto-attaque fallback
      // Après expiration (cooldownMs 1000) → heal relancé.
      const emits2: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [makePlayer(6880, 12480)], now + 1500, captureServer(emits2));
      expect(healOf(emits2)).toBeDefined();
    });

    it("E. clamp maxHealth : heal borné aux PV manquants (event = montant réel)", async () => {
      const creature = healSetup(28); // maxHealth 30 → 2 PV manquants
      (service as any).combatAbilityCache.set("turkey", [HEAL]); // amount 10
      const emits: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), makeTemplate(), [makePlayer(6880, 12480)], Date.now(), captureServer(emits));
      expect(creature.health).toBe(30); // clampé
      expect(healOf(emits).payload.amount).toBe(2); // heal réellement appliqué
    });

    it("Lot 2 (14/16) : soin clampé au max DÉRIVÉ (vitality 3 → max 60)", async () => {
      const template = makeTemplate({ key: "healvit", baseHealth: 30, vitality: 3 }); // max 60
      const creature = healSetup(55); // 55 < 60 → heal casté ; +10 → 65 → clampé 60
      creature.spawn = makeSpawn(template) as any;
      (service as any).combatAbilityCache.set("healvit", [HEAL]);
      const emits: { event: string; payload: any }[] = [];
      await (service as any).doFighting(creature, fightingState(), template, [makePlayer(6880, 12480)], Date.now(), captureServer(emits));
      expect(creature.health).toBe(60); // clampé au max dérivé, pas 65
      expect(healOf(emits).payload.amount).toBe(5); // 60 − 55 réellement appliqué
    });

    // ─── V5-D2-A : stats de combat avancées créature ──────────────────────────
    describe("stats de combat avancées (V5-D2-A)", () => {
      // Capacité damage physique : montant = attackPower(baseAttack 5) × coef 2 = 10.
      const PHYS = {
        skillKey: "fireball",
        skillName: "Boule de feu",
        effectType: "damage" as const,
        displayOrder: 0,
        rangeWU: 5000,
        cooldownMs: 3000,
        damageType: "physical" as const,
        canCrit: true, // dégâts physiques : critiquable (règle canonique)
        scaling: { derivedCoefficients: { physicalAttack: 2 } },
      };

      // Id unique par cast : évite que deux casts d'un même test partagent le
      // cooldown skill / la fenêtre d'action (map keyée par creature.id).
      let castSeq = 0;

      // Lance une capacité (template + stats défenseur paramétrables) et renvoie l'event damage.
      async function castAbility(
        ability: any,
        templateOverrides: Partial<CreatureTemplate>,
        derived: Record<string, number> = { defense: 0 },
      ) {
        const creature = makeCreature({ id: `adv-cast-${++castSeq}`, worldX: 6080, worldY: 12480, mapId: 1, state: "fighting", health: 30 });
        (service as any).combatAbilityCache.set("turkey", [ability]);
        const player = makePlayer(6080 + 1000, 12480); // en portée skill
        (service as any).characterRepository = {
          findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100000, defense: 0 }),
          update: jest.fn().mockResolvedValue({}),
        };
        (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue([]) };
        mockDefenderDerived(derived);
        const emits: { event: string; payload: any }[] = [];
        await (service as any).doFighting(
          creature,
          fightingState(),
          makeTemplate(templateOverrides),
          [player],
          Date.now(),
          captureServer(emits),
        );
        return combatOf(emits)?.payload;
      }

      // A. Compat : template sans stats avancées → défauts sûrs.
      it("A. base non migrée → défauts sûrs (crit 0, criticalDamage 150, accuracy/pen/heal 0)", () => {
        const base = CreatureRuntimeCalculator.calculateBaseStats(makeCreature(), makeTemplate());
        expect(base).toMatchObject({
          healingPower: 0,
          criticalChance: 0,
          criticalDamage: 150,
          accuracy: 0,
          armorPenetrationPercent: 0,
        });
      });

      it("A-bis. cast damage template par défaut → pas de critique, montant historique 10", async () => {
        const ev = await castAbility(PHYS, {});
        expect(ev.amount).toBe(10);
        expect(ev.isCritical).toBe(false);
      });

      // B. Runtime : getRuntimeCombatInfo expose les 5 stats.
      it("B. getRuntimeCombatInfo expose les 5 stats avancées + défensif toujours false", async () => {
        const template = makeTemplate({
          key: "adv",
          healingPower: 12,
          criticalChance: 7,
          criticalDamage: 180,
          accuracy: 9,
          armorPenetrationPercent: 25,
        });
        const creature = makeCreature({ id: "adv-1", state: "fighting", health: 20, spawn: makeSpawn(template) as any });
        (service as any).liveCreatures.set(creature.id, creature);
        (service as any).combatAbilityCache.set("adv", []);
        const dto = await service.getRuntimeCombatInfo(creature.id);
        expect(dto).toMatchObject({
          healingPower: 12,
          criticalChance: 7,
          criticalDamage: 180,
          accuracy: 9,
          armorPenetrationPercent: 25,
          canDodge: false,
          canBlock: false,
          canParry: false,
        });
      });

      it("V6-B2 : getRuntimeCombatInfo expose les primaires et dérive attackPower/defenseTotal", async () => {
        const template = makeTemplate({
          key: "prim",
          baseAttack: 5, baseArmor: 2, baseHealth: 30,
          strength: 10, vitality: 20, endurance: 5, agility: 8, dexterity: 12, intelligence: 3, wisdom: 7,
          spirit: 4, willpower: 6, charisma: 9,
        });
        const creature = makeCreature({ id: "prim-1", state: "fighting", health: 30, spawn: makeSpawn(template) as any });
        (service as any).liveCreatures.set(creature.id, creature);
        (service as any).combatAbilityCache.set("prim", []);
        const dto = await service.getRuntimeCombatInfo(creature.id);
        // Les 10 primaires exposées = valeurs template.
        expect(dto!.primaryStats).toEqual({
          strength: 10, vitality: 20, endurance: 5, agility: 8, dexterity: 12, intelligence: 3, wisdom: 7,
          spirit: 4, willpower: 6, charisma: 9,
        });
        // V6-B2 : strength (×2) et endurance (×1) dérivent attackPower/defenseTotal.
        expect(dto!.attackPower).toBe(5 + 10 * 2); // 25
        expect(dto!.defenseTotal).toBe(2 + 5); // 7
        // Lot 2 : maxHealth = PV max dérivé activé = floor(30 + vitality 20 × 10).
        expect(dto!.maxHealth).toBe(30 + 20 * 10); // 230
        // V6-B3 : canDodge true. V6-B4 : canBlock true. V6-B6 : parryChance > 0 (dex 12/str 10)
        // → canParry true.
        expect(dto!.canDodge).toBe(true);
        expect(dto!.canBlock).toBe(true);
        expect(dto!.canParry).toBe(true);
      });

      it("V6-B2 : getRuntimeCombatInfo expose les secondaires calculées (informatif, non actives)", async () => {
        const template = makeTemplate({
          key: "sec",
          baseAttack: 5, baseArmor: 2, baseHealth: 30,
          strength: 10, vitality: 20, endurance: 5, agility: 8, dexterity: 12, intelligence: 3,
        });
        const creature = makeCreature({ id: "sec-1", state: "fighting", health: 30, spawn: makeSpawn(template) as any });
        (service as any).liveCreatures.set(creature.id, creature);
        (service as any).combatAbilityCache.set("sec", []);

        // Référence : les valeurs exposées doivent correspondre à resolveCombatStats.
        const ref = CreatureRuntimeCalculator.resolveCombatStats(creature, template);

        const dto = await service.getRuntimeCombatInfo(creature.id);
        expect(dto!.derivedSecondaryStats).toEqual({
          dodgeChance: ref.dodgeChance,
          blockChance: ref.blockChance,
          blockReductionPercent: ref.blockReductionPercent,
          parryChance: ref.parryChance,
          counterAttackPower: ref.counterAttackPower,
          maxHealthDerived: ref.maxHealthDerived,
        });
        // Valeurs numériques attendues (dérivation V6-B2).
        expect(dto!.derivedSecondaryStats.dodgeChance).toBeCloseTo(8 * 0.3); // 2.4
        expect(dto!.derivedSecondaryStats.blockChance).toBeCloseTo(5 * 0.2 + 10 * 0.1); // 2
        expect(dto!.derivedSecondaryStats.blockReductionPercent).toBe(25);
        expect(dto!.derivedSecondaryStats.parryChance).toBeCloseTo(10 * 0.15 + 12 * 0.15); // 3.3
        expect(dto!.derivedSecondaryStats.counterAttackPower).toBeCloseTo(12 * 0.4 + 8 * 0.3 + 3 * 0.2); // 7.8
        // Lot 2 : maxHealthDerived est un ALIAS de maxHealth (PV max dérivé activé).
        expect(dto!.derivedSecondaryStats.maxHealthDerived).toBe(30 + 20 * 10); // 230
        expect(dto!.maxHealth).toBe(30 + 20 * 10); // 230 — même valeur
        expect(dto!.maxHealth).toBe(dto!.derivedSecondaryStats.maxHealthDerived);
        // V6-B3 : canDodge true. V6-B4 : canBlock true. V6-B6 : parryChance 3.3 (>0) → canParry true.
        expect(dto!.canDodge).toBe(true);
        expect(dto!.canBlock).toBe(true);
        expect(dto!.canParry).toBe(true);
      });

      it("B-bis. healingPower non configurée → getRuntimeCombatInfo retombe sur attackPower", async () => {
        const template = makeTemplate({ key: "adv2", baseAttack: 5, healingPower: 0 });
        const creature = makeCreature({ id: "adv-2", state: "fighting", health: 20, spawn: makeSpawn(template) as any });
        (service as any).liveCreatures.set(creature.id, creature);
        (service as any).combatAbilityCache.set("adv2", []);
        const dto = await service.getRuntimeCombatInfo(creature.id);
        expect(dto!.healingPower).toBe(5); // fallback attackPower (baseAttack 5)
      });

      // Lot 3 : trace serveur du calcul du PV max (Studio, lecture seule).
      it("Lot 3 : getRuntimeCombatInfo expose maxHealthTrace (socle + Vitalité + caps + arrondi + final)", async () => {
        const template = makeTemplate({ key: "trace", baseHealth: 30, vitality: 3 }); // max floor(30+30)=60
        const creature = makeCreature({ id: "trace-1", state: "fighting", health: 45, spawn: makeSpawn(template) as any });
        (service as any).liveCreatures.set(creature.id, creature);
        (service as any).combatAbilityCache.set("trace", []);

        const dto = await service.getRuntimeCombatInfo(creature.id);
        const tr = dto!.maxHealthTrace;
        expect(tr.stat).toBe("maxHealth");
        expect(tr.baseValue).toBe(30); // socle baseHealth
        expect(tr.vitality).toBe(3);
        expect(tr.maxHealthPerVitality).toBe(10); // coefficient (mock défaut)
        // Contribution Vitalité appliquée avec tags derived/vitality/health.
        const vit = tr.appliedContributions.find((c) => c.sourceId === "vitality");
        expect(vit!.operation).toBe("flat");
        expect(vit!.contribution).toBe(30); // 3 × 10
        expect(vit!.tags).toEqual(["derived", "vitality", "health"]);
        expect(tr.filteredContributions).toEqual([]); // aucun filtre
        expect(tr.beforeCaps).toBe(60);
        expect(tr.caps).toEqual({ min: 1, max: null }); // cap minimum 1
        expect(tr.afterCaps).toBe(60);
        expect(tr.roundingPolicy).toBe("floor");
        expect(tr.overrideApplied).toBeNull();
        // finalValue == maxHealth DTO == runtimeStats-équivalent (une seule valeur).
        expect(tr.finalValue).toBe(60);
        expect(dto!.maxHealth).toBe(tr.finalValue);
        expect(dto!.derivedSecondaryStats.maxHealthDerived).toBe(tr.finalValue);
      });

      it("Lot 3 : coefficient fractionnaire → beforeCaps non arrondi, final floor", async () => {
        (service as any).creatureSecondaryCoefficients.getCoefficients = jest.fn().mockReturnValue({
          ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
          maxHealthPerVitality: 2.5,
        });
        const template = makeTemplate({ key: "frac", baseHealth: 30, vitality: 3 }); // 30 + 7.5 = 37.5 → 37
        const creature = makeCreature({ id: "frac-1", state: "fighting", health: 30, spawn: makeSpawn(template) as any });
        (service as any).liveCreatures.set(creature.id, creature);
        (service as any).combatAbilityCache.set("frac", []);

        const dto = await service.getRuntimeCombatInfo(creature.id);
        const tr = dto!.maxHealthTrace;
        expect(tr.beforeCaps).toBeCloseTo(37.5, 6); // avant arrondi
        expect(tr.finalValue).toBe(37); // floor
        expect(dto!.maxHealth).toBe(37);
      });

      // C. Heal : préserve V5-D1 (fallback) et prend la vraie valeur si configurée.
      const HEAL2 = {
        skillKey: "soin",
        skillName: "Soin",
        effectType: "heal" as const,
        displayOrder: 0,
        rangeWU: 0,
        cooldownMs: 1000,
        damageType: "physical" as const,
        scaling: { derivedCoefficients: { healingPower: 2 } },
      };
      async function castHeal(templateOverrides: Partial<CreatureTemplate>, creatureHealth: number) {
        const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting", health: creatureHealth });
        (service as any).combatAbilityCache.set("turkey", [HEAL2]);
        (service as any).characterRepository = {
          findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0 }),
          update: jest.fn().mockResolvedValue({}),
        };
        (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue([]) };
        mockDefenderDerived({ defense: 0 });
        const emits: { event: string; payload: any }[] = [];
        await (service as any).doFighting(
          creature,
          fightingState(),
          makeTemplate(templateOverrides),
          [makePlayer(6880, 12480)],
          Date.now(),
          captureServer(emits),
        );
        return emits.find((e) => e.event === "combat:event" && e.payload.type === "heal")?.payload;
      }

      it("C. healingPower non configurée → heal = fallback attackPower (comportement V5-D1)", async () => {
        const heal = await castHeal({ baseHealth: 100, baseAttack: 5, healingPower: 0 }, 10);
        expect(heal.amount).toBe(10); // attackPower 5 × coef 2
      });

      it("C-bis. healingPower configurée → heal utilise la vraie valeur", async () => {
        const heal = await castHeal({ baseHealth: 100, baseAttack: 5, healingPower: 20 }, 10);
        expect(heal.amount).toBe(40); // healingPower 20 × coef 2 (90 PV manquants → non clampé)
      });

      // D. Critique : criticalChance 100 → toujours critique (roll < 1), × criticalDamage.
      it("D. criticalChance 100 → dégâts critiques (× criticalDamage), isCritical émis", async () => {
        const ev = await castAbility(PHYS, { criticalChance: 100, criticalDamage: 200 });
        expect(ev.isCritical).toBe(true);
        expect(ev.amount).toBe(20); // 10 × 200 %
      });

      // D-bis. canCrit false (skill physique non critiquable) → jamais de critique.
      it("D-bis. skill physique canCrit false + chance 100 → AUCUN critique", async () => {
        const noCrit = { ...PHYS, canCrit: false };
        const ev = await castAbility(noCrit, { criticalChance: 100, criticalDamage: 200 });
        expect(ev.isCritical).toBe(false);
        expect(ev.amount).toBe(10); // montant normal, aucun multiplicateur critique
      });

      // D-ter. Un skill magic ne critique JAMAIS, même à criticalChance 100.
      it("D-ter. skill magic + chance 100 → AUCUN critique (règle canonique)", async () => {
        const magic = {
          ...PHYS, skillKey: "gust", damageType: "magic" as const, magicSchool: "air" as const, canCrit: true,
        };
        const ev = await castAbility(magic, { criticalChance: 100, criticalDamage: 200 }, { defense: 0, magicResistanceGlobal: 0, magicResistanceAir: 0 });
        expect(ev.isCritical).toBe(false);
        expect(ev.amount).toBe(10); // magic non critique, aucune résistance ici
      });

      // E. Pénétration d'armure : ignore un % de l'armure du défenseur (dégâts physiques).
      it("E. armorPenetrationPercent réduit l'armure effective de la cible", async () => {
        const without = await castAbility(PHYS, { armorPenetrationPercent: 0 }, { defense: 8 });
        expect(without.amount).toBe(2); // 10 − 8
        const withPen = await castAbility(PHYS, { armorPenetrationPercent: 50 }, { defense: 8 });
        expect(withPen.amount).toBe(6); // 10 − round(8 × 0.5)=4
      });

      it("E-bis. damageType raw ignore l'armure ET armorPenetrationPercent", async () => {
        const raw = { ...PHYS, damageType: "raw" as const };
        const ev = await castAbility(raw, { armorPenetrationPercent: 80 }, { defense: 100 });
        expect(ev.amount).toBe(10); // brut : ni armure (100) ni pénétration appliquées
      });

      // F. Précision : réduit l'esquive effective du défenseur (V4-G).
      it("F. accuracy annule l'esquive du défenseur", async () => {
        const dodged = await castAbility(PHYS, { accuracy: 0 }, { defense: 0, dodgeChance: 100 });
        expect(dodged.isDodged).toBe(true);
        expect(dodged.amount).toBe(0);
        const hit = await castAbility(PHYS, { accuracy: 100 }, { defense: 0, dodgeChance: 100 });
        expect(hit.isDodged).toBe(false);
        expect(hit.amount).toBe(10);
      });

      // G. Non-régression : l'auto-attaque legacy ne critique jamais, même crit 100.
      it("G. V5-G : l'auto-attaque passive applique désormais le critique créature", async () => {
        const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting", health: 30 });
        (service as any).combatAbilityCache.set("turkey", []); // aucune capacité → auto-attaque
        (service as any).characterRepository = {
          findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100000, defense: 0 }),
          update: jest.fn().mockResolvedValue({}),
        };
        (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue([]) };
        mockDefenderDerived({ defense: 0 });
        const emits: { event: string; payload: any }[] = [];
        await (service as any).doFighting(
          creature,
          fightingState(),
          makeTemplate({ criticalChance: 100, criticalDamage: 300 }),
          [makePlayer(6880, 12480)],
          Date.now(),
          captureServer(emits),
        );
        const ev = combatOf(emits).payload;
        expect(ev.skillName).toBeUndefined(); // toujours le chemin auto-attaque (pas un skill)
        expect(ev.isCritical).toBe(true); // V5-G : critique créature appliqué
        expect(ev.amount).toBe(15); // baseAttack 5 × criticalDamage 300 %
      });
    });

    // ─── V5-F : défense joueur pilotée par les statBonuses d'un item ──────────
    describe("V5-F : défense joueur via statBonuses d'item (skill créature)", () => {
      it("dodgeChance d'un item équipé annule un skill damage créature", async () => {
        const creature = makeCreature({ worldX: 6080, worldY: 12480, mapId: 1, state: "fighting", health: 30 });
        (service as any).combatAbilityCache.set("turkey", [
          {
            skillKey: "fireball",
            skillName: "Boule de feu",
            effectType: "damage",
            displayOrder: 0,
            rangeWU: 5000,
            cooldownMs: 3000,
            damageType: "physical",
            scaling: { derivedCoefficients: { physicalAttack: 2 } },
          },
        ]);
        const player = makePlayer(6080 + 1000, 12480);
        (service as any).characterRepository = {
          findOne: jest.fn().mockResolvedValue({
            id: "char-1",
            health: 100,
            maxHealth: 100,
            attack: 0,
            defense: 0,
            // dodgeChance vient UNIQUEMENT du statBonuses de l'item équipé.
            equipment: [{ slot: "right-hand", item: { type: "weapon", statBonuses: { dodgeChance: 100 } } }],
          }),
          update: jest.fn().mockResolvedValue({}),
        };
        (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue([]) };
        // PAS de mockDefenderDerived → compute réel, la défense passe par le merge équipement.
        const emits: { event: string; payload: any }[] = [];
        await (service as any).doFighting(creature, fightingState(), makeTemplate(), [player], Date.now(), captureServer(emits));
        const ev = combatOf(emits).payload;
        expect(ev.skillName).toBe("Boule de feu");
        expect(ev.isDodged).toBe(true); // dodgeChance 100 (item) → esquive via resolver
        expect(ev.amount).toBe(0);
      });
    });

    // ─── V5-G : auto-attaque passive via le resolver commun ───────────────────
    describe("V5-G : auto-attaque passive via resolveCombatHit", () => {
      // Auto-attaque = aucune capacité → chemin fallback de doFighting.
      async function autoAttack(
        id: string,
        templateOverrides: Partial<CreatureTemplate>,
        defenderDerived: Record<string, number>,
      ) {
        const creature = makeCreature({ id, worldX: 6080, worldY: 12480, mapId: 1, state: "fighting", health: 30 });
        (service as any).combatAbilityCache.set("turkey", []); // aucune capacité → auto-attaque
        (service as any).characterRepository = {
          findOne: jest.fn().mockResolvedValue({ id: "char-1", health: 100, defense: 0 }),
          update: jest.fn().mockResolvedValue({}),
        };
        (service as any).derivedStats = { getDefinitions: jest.fn().mockResolvedValue([]) };
        mockDefenderDerived(defenderDerived);
        const emits: { event: string; payload: any }[] = [];
        await (service as any).doFighting(creature, fightingState(), makeTemplate(templateOverrides), [makePlayer(6880, 12480)], Date.now(), captureServer(emits));
        return emits;
      }

      it("accuracy créature réduit l'esquive du joueur (touche malgré dodge 100)", async () => {
        const ev = combatOf(await autoAttack("v5g-acc", { accuracy: 100 }, { defense: 0, dodgeChance: 100 })).payload;
        expect(ev.isDodged).toBe(false); // effectiveDodge = clamp(100 − 100) = 0
        expect(ev.amount).toBe(5); // baseAttack 5, défense 0
      });

      it("armorPenetrationPercent créature réduit l'armure effective du joueur", async () => {
        const without = combatOf(await autoAttack("v5g-pen0", { armorPenetrationPercent: 0 }, { defense: 4 })).payload;
        expect(without.amount).toBe(1); // 5 − 4 = 1
        const withPen = combatOf(await autoAttack("v5g-pen100", { armorPenetrationPercent: 100 }, { defense: 4 })).payload;
        expect(withPen.amount).toBe(5); // armure ignorée → 5 − 0 = 5
      });

      it("minimumDamage conservé : attaque ≤ défense → 1 dégât (plancher legacy)", async () => {
        const ev = combatOf(await autoAttack("v5g-min", {}, { defense: 100 })).payload;
        expect(ev.amount).toBe(1); // max(round(5 − 100), 1) = 1
      });

      it("parade JAMAIS déclenchée sur l'auto-attaque passive (canParry false)", async () => {
        const ev = combatOf(await autoAttack("v5g-parry", {}, { defense: 0, parryChance: 100 })).payload;
        expect(ev.isParried).toBeFalsy(); // parryChance joueur ignoré
        expect(ev.amount).toBe(5); // hit appliqué normalement
      });

      it("exactement un character_damaged et un combat:event (pas de double)", async () => {
        const emits = await autoAttack("v5g-single", {}, { defense: 0 });
        expect(emits.filter((e) => e.event === "character_damaged")).toHaveLength(1);
        expect(emits.filter((e) => e.event === "combat:event")).toHaveLength(1);
      });
    });
  });
});
