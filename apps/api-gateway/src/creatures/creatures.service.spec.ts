import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreaturesService, resolveCombatSkill } from './creatures.service';
import { Creature } from './entities/creature.entity';
import { CreatureTemplate } from './entities/creature-template.entity';
import { CreatureSpawn } from './entities/creature-spawn.entity';
import { Character } from '../characters/entities/character.entity';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { EquipmentSlot } from '../characters/dto/equip-item.dto';
import { SkillsService } from '../skills/skills.service';
import { WorldService } from '../world/world.service';
import { wuToIsoScreenX, wuToIsoScreenY } from '../common/world-coordinates';
import { RuntimeDebugRegistry } from '../player-runtime/debug-modifier.registry';

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
    ...overrides,
  } as CreatureTemplate;
}

function makeSpawn(template: CreatureTemplate): CreatureSpawn {
  return {
    id: 'spawn-1',
    key: 'turkey_spawn_1',
    template,
    spawnX: 600,
    spawnY: 580,
    respawnDelayMs: 20000,
  } as CreatureSpawn;
}

function makeCreature(overrides: Partial<Creature> = {}): Creature {
  const template = makeTemplate();
  const spawn = makeSpawn(template);
  return {
    id: 'creature-1',
    spawn,
    x: 600,
    y: 580,
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

// Helper : équipement ranged factice
function makeRangedEquipment(category: string): CharacterEquipment {
  return {
    slot: EquipmentSlot.RANGED_WEAPON,
    item: { category } as any,
  } as CharacterEquipment;
}

// Helper : équipement mêlée factice
function makeMeleeEquipment(): CharacterEquipment {
  return {
    slot: EquipmentSlot.RIGHT_HAND,
    item: { type: 'weapon', category: 'sword' } as any,
  } as CharacterEquipment;
}

describe('resolveCombatSkill', () => {
  it('retourne two_handed sans équipement', () => {
    expect(resolveCombatSkill([])).toBe('two_handed');
  });

  it('retourne bow pour une arme à distance non-crossbow', () => {
    expect(resolveCombatSkill([makeRangedEquipment('bow')])).toBe('bow');
  });

  it('retourne crossbow pour une arme à distance catégorie crossbow', () => {
    expect(resolveCombatSkill([makeRangedEquipment('crossbow')])).toBe('crossbow');
  });

  it('retourne two_handed pour une arme de mêlée RIGHT_HAND', () => {
    expect(resolveCombatSkill([makeMeleeEquipment()])).toBe('two_handed');
  });
});

describe('CreaturesService', () => {
  let service: CreaturesService;
  let debugRegistry: RuntimeDebugRegistry;
  let creatureRepository: Record<string, jest.Mock>;
  let characterRepository: Record<string, jest.Mock>;
  let templateRepository: Record<string, jest.Mock>;
  let spawnRepository: Record<string, jest.Mock>;
  let skillsService: Record<string, jest.Mock>;

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
    skillsService = {
      addXp: jest.fn().mockResolvedValue({ level: 1, xp: 10 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreaturesService,
        { provide: getRepositoryToken(Creature), useValue: creatureRepository },
        { provide: getRepositoryToken(CreatureTemplate), useValue: templateRepository },
        { provide: getRepositoryToken(CreatureSpawn), useValue: spawnRepository },
        { provide: getRepositoryToken(Character), useValue: characterRepository },
        { provide: WorldService, useValue: { getAllConnectedPlayers: jest.fn().mockReturnValue([]) } },
        { provide: SkillsService, useValue: skillsService },
        RuntimeDebugRegistry,
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

    it('DTO conserve x/y pixel legacy aux côtés des WU', () => {
      const creature = makeCreature({ x: 600, y: 580, worldX: 65536, worldY: 32768, mapId: 1 } as any);
      (service as any).liveCreatures.set(creature.id, creature);

      const result = service.findAll();

      expect(result[0].x).toBe(600);
      expect(result[0].y).toBe(580);
      expect(result[0].worldX).toBe(65536);
      expect(result[0].worldY).toBe(32768);
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

    it('applique les dégâts et retourne un succès', async () => {
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
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

    it("tue l'creature, programme un respawn et efface l'état de patrouille", async () => {
      jest.useFakeTimers();
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 5 });
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
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 30, state: 'fighting' });
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

    it('accorde XP two_handed au kill sans équipement', async () => {
      jest.useFakeTimers();
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 5 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, equipment: [] }));

      await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(skillsService.addXp).toHaveBeenCalledWith('char-1', 'two_handed', 10);
      jest.useRealTimers();
    });

    it('accorde XP bow pour une arme à distance (catégorie bow)', async () => {
      jest.useFakeTimers();
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 5 });
      (service as any).liveCreatures.set(creature.id, creature);
      const equipment = [makeRangedEquipment('bow')];
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, equipment }));

      await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(skillsService.addXp).toHaveBeenCalledWith('char-1', 'bow', 10);
      jest.useRealTimers();
    });

    it('accorde XP crossbow pour une arme catégorie crossbow', async () => {
      jest.useFakeTimers();
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 5 });
      (service as any).liveCreatures.set(creature.id, creature);
      const equipment = [makeRangedEquipment('crossbow')];
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, equipment }));

      await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(skillsService.addXp).toHaveBeenCalledWith('char-1', 'crossbow', 10);
      jest.useRealTimers();
    });

    it("n'accorde pas XP si l'creature survit", async () => {
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(skillsService.addXp).not.toHaveBeenCalled();
    });

    it("n'accorde pas XP si l'creature est déjà mort", async () => {
      const creature = makeCreature({ state: 'dead' });
      (service as any).liveCreatures.set(creature.id, creature);

      await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(skillsService.addXp).not.toHaveBeenCalled();
    });

    it('utilise le characterId serveur (paramètre), pas une donnée client', async () => {
      jest.useFakeTimers();
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 1 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, equipment: [] }));

      await service.attack(creature.id, 'server-resolved-char-id', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(skillsService.addXp).toHaveBeenCalledWith('server-resolved-char-id', expect.any(String), expect.any(Number));
      jest.useRealTimers();
    });

    // ── Runtime compute — non-régression et debug modifiers ─────────────────

    it('sans debug modifiers : damage identique au comportement direct (non-régression)', async () => {
      // template.baseArmor=2, char.attack=10 → damage = max(max(10,5)-2, 1) = 8
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveCreatures.set(creature.id, creature);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(creature.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      if (result.success) expect(result.damage).toBe(8);
    });

    it('debug modifier flat sur defenseTotal réduit les dégâts infligés', async () => {
      // baseArmor=2, debug +10 flat → defenseTotal=12
      // char.attack=10 → damage = max(max(10,5)-12, 1) = max(-2,1) = 1
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
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
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 30, state: 'fighting' });
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
      const creature = makeCreature({ state: 'dead', health: 0, x: 999, y: 999 });
      (service as any).liveCreatures.set(creature.id, creature);
      const mockServer = { emit: jest.fn() };
      (service as any).server = mockServer;

      await (service as any).respawnCreature(creature.id);

      expect(creature.state).toBe('alive');
      expect(creature.health).toBe(30);
      expect(creature.x).toBe(600);
      expect(creature.y).toBe(580);
      expect(creatureRepository.update).toHaveBeenCalledWith(
        creature.id,
        expect.objectContaining({ state: 'alive', health: 30, x: 600, y: 580 }),
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
      const creature = makeCreature({ state: 'dead', health: 0, x: 999, y: 999 });
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
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
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
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1 });
      const state = { dirX: 1, dirY: 0, speed: 60, moveUntil: Infinity, pauseUntil: 0 };

      (service as any).doPatrolMovement(creature, state, makeTemplate(), Date.now());

      expect(Number.isFinite(creature.worldX)).toBe(true);
      expect(Number.isFinite(creature.worldY)).toBe(true);
      expect(creature.mapId).toBe(1);
    });

    it('doFighting synchronise worldX/worldY lors de la poursuite', async () => {
      // creature pixel(700,580) → WU(6880,11680), joueur WU(0,9600) — dist > MELEE_RANGE_WU
      const creature = makeCreature({ x: 700, y: 580, worldX: 6880, worldY: 11680, mapId: 1 });
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
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1 });
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
    it('doPatrolMovement — worldX/worldY sont la vérité, x/y dérivés par projection', () => {
      // creature WU(6080,12480), dirX=1 dirY=0, speed=60, dt=0.2s
      // stepWU=192 → newWX=6272, newWY=12480 < patrolRadius(3200WU) → else
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1 });
      const state = { dirX: 1, dirY: 0, speed: 60, moveUntil: Infinity, pauseUntil: 0 };

      (service as any).doPatrolMovement(creature, state, makeTemplate(), Date.now());

      expect(creature.worldX).toBe(6272);
      expect(creature.worldY).toBe(12480);
      expect(creature.x).toBe(Math.round(wuToIsoScreenX(creature.worldX!, creature.worldY!)));
      expect(creature.y).toBe(Math.round(wuToIsoScreenY(creature.worldX!, creature.worldY!)));
    });

    it('doFighting — x/y dérivés de worldX/worldY après poursuite', async () => {
      // creature WU(6880,11680), joueur WU(0,9600) — dist>MELEE_RANGE_WU → mouvement
      const creature = makeCreature({ x: 700, y: 580, worldX: 6880, worldY: 11680, mapId: 1 });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 400, y: 300, worldX: 0, worldY: 9600, mapId: 1,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0, targetCharacterId: 'char-1' };
      const mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };

      await (service as any).doFighting(creature, state, makeTemplate(), [player], Date.now(), mockServer);

      expect(Number.isFinite(creature.worldX)).toBe(true);
      expect(creature.x).toBe(Math.round(wuToIsoScreenX(creature.worldX!, creature.worldY!)));
      expect(creature.y).toBe(Math.round(wuToIsoScreenY(creature.worldX!, creature.worldY!)));
    });

    it('doEscaping — x/y dérivés de worldX/worldY lors de la fuite', async () => {
      // creature WU(6080,12480), joueur WU(5760,12160) — dist(320WU) < patrolRadius(3200WU)
      const creature = makeCreature({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1 });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 600, y: 560, worldX: 5760, worldY: 12160, mapId: 1,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };

      await (service as any).doEscaping(creature, state, makeTemplate(), [player], Date.now());

      expect(Number.isFinite(creature.worldX)).toBe(true);
      expect(creature.x).toBe(Math.round(wuToIsoScreenX(creature.worldX!, creature.worldY!)));
      expect(creature.y).toBe(Math.round(wuToIsoScreenY(creature.worldX!, creature.worldY!)));
    });

    it('doPatrolMovement — guard : retourne sans modifier si worldX est null', () => {
      const creature = makeCreature({ x: 600, y: 580 });
      const state = { dirX: 1, dirY: 0, speed: 60, moveUntil: Infinity, pauseUntil: 0 };
      const prevX = creature.x;

      (service as any).doPatrolMovement(creature, state, makeTemplate(), Date.now());

      expect(creature.x).toBe(prevX);
      expect(creature.worldX).toBeUndefined();
    });
  });
});
