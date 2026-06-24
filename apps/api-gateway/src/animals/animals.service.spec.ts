import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnimalsService, resolveCombatSkill } from './animals.service';
import { Animal } from './entities/animal.entity';
import { CreatureTemplate } from './entities/creature-template.entity';
import { CreatureSpawn } from './entities/creature-spawn.entity';
import { Character } from '../characters/entities/character.entity';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { EquipmentSlot } from '../characters/dto/equip-item.dto';
import { SkillsService } from '../skills/skills.service';
import { WorldService } from '../world/world.service';
import { wuToIsoScreenX, wuToIsoScreenY } from '../common/world-coordinates';

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

function makeAnimal(overrides: Partial<Animal> = {}): Animal {
  const template = makeTemplate();
  const spawn = makeSpawn(template);
  return {
    id: 'animal-1',
    spawn,
    x: 600,
    y: 580,
    health: 30,
    state: 'alive',
    ...overrides,
  } as Animal;
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

describe('AnimalsService', () => {
  let service: AnimalsService;
  let animalRepository: Record<string, jest.Mock>;
  let characterRepository: Record<string, jest.Mock>;
  let templateRepository: Record<string, jest.Mock>;
  let spawnRepository: Record<string, jest.Mock>;
  let skillsService: Record<string, jest.Mock>;

  beforeEach(async () => {
    animalRepository = {
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
        AnimalsService,
        { provide: getRepositoryToken(Animal), useValue: animalRepository },
        { provide: getRepositoryToken(CreatureTemplate), useValue: templateRepository },
        { provide: getRepositoryToken(CreatureSpawn), useValue: spawnRepository },
        { provide: getRepositoryToken(Character), useValue: characterRepository },
        { provide: WorldService, useValue: { getAllConnectedPlayers: jest.fn().mockReturnValue([]) } },
        { provide: SkillsService, useValue: skillsService },
      ],
    }).compile();

    service = module.get<AnimalsService>(AnimalsService);
  });

  // -------------------------------------------------------------------------
  describe('findAll', () => {
    it('retourne les DTOs de tous les animaux en mémoire', () => {
      const animal = makeAnimal();
      (service as any).liveAnimals.set(animal.id, animal);

      const result = service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'animal-1', health: 30, state: 'alive' });
    });

    it('retourne un tableau vide si aucun animal en mémoire', () => {
      expect(service.findAll()).toEqual([]);
    });

    it('DTO expose textureKey depuis le template', () => {
      const animal = makeAnimal();
      (service as any).liveAnimals.set(animal.id, animal);

      const result = service.findAll();

      expect(result[0].textureKey).toBe('turkey');
    });

    it('DTO textureKey correspond à template.textureKey', () => {
      const template = makeTemplate({ textureKey: 'custom_sprite' });
      const animal = makeAnimal({ spawn: makeSpawn(template) as any });
      (service as any).liveAnimals.set(animal.id, animal);

      const result = service.findAll();

      expect(result[0].textureKey).toBe('custom_sprite');
    });

    it('DTO type et textureKey sont identiques en Phase 1', () => {
      const animal = makeAnimal();
      (service as any).liveAnimals.set(animal.id, animal);

      const result = service.findAll();

      expect(result[0].type).toBe(result[0].textureKey);
    });

    it('DTO expose worldX/worldY/mapId depuis l\'animal', () => {
      const animal = makeAnimal({ worldX: 65536, worldY: 32768, mapId: 1 } as any);
      (service as any).liveAnimals.set(animal.id, animal);

      const result = service.findAll();

      expect(result[0].worldX).toBe(65536);
      expect(result[0].worldY).toBe(32768);
      expect(result[0].mapId).toBe(1);
    });

    it('DTO worldX/worldY/mapId sont null si absents de l\'animal', () => {
      const animal = makeAnimal();
      (service as any).liveAnimals.set(animal.id, animal);

      const result = service.findAll();

      expect(result[0].worldX).toBeNull();
      expect(result[0].worldY).toBeNull();
      expect(result[0].mapId).toBeNull();
    });

    it('DTO conserve x/y pixel legacy aux côtés des WU', () => {
      const animal = makeAnimal({ x: 600, y: 580, worldX: 65536, worldY: 32768, mapId: 1 } as any);
      (service as any).liveAnimals.set(animal.id, animal);

      const result = service.findAll();

      expect(result[0].x).toBe(600);
      expect(result[0].y).toBe(580);
      expect(result[0].worldX).toBe(65536);
      expect(result[0].worldY).toBe(32768);
    });
  });

  // -------------------------------------------------------------------------
  describe('attack', () => {
    it("rejette si l'animal est introuvable", async () => {
      const result = await service.attack('unknown', 'char-1', { worldX: 0, worldY: 0, mapId: 1 });
      expect(result).toEqual({ success: false, error: 'Animal not found' });
    });

    it("rejette si l'animal est déjà mort", async () => {
      const animal = makeAnimal({ state: 'dead' });
      (service as any).liveAnimals.set(animal.id, animal);

      const result = await service.attack(animal.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result).toEqual({ success: false, error: 'Animal already dead' });
    });

    it('rejette si le personnage est introuvable', async () => {
      const animal = makeAnimal();
      (service as any).liveAnimals.set(animal.id, animal);
      characterRepository.findOne.mockResolvedValue(null);

      const result = await service.attack(animal.id, 'char-missing', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result).toEqual({ success: false, error: 'Character not found' });
    });

    it('rejette si la cible est hors de portée', async () => {
      const animal = makeAnimal({ worldX: 6080, worldY: 12480, mapId: 1 });
      (service as any).liveAnimals.set(animal.id, animal);
      characterRepository.findOne.mockResolvedValue(makeCharacter());

      const result = await service.attack(animal.id, 'char-1', { worldX: -8000, worldY: 8000, mapId: 1 });

      expect(result).toEqual({ success: false, error: 'Target out of range' });
    });

    it('rejette si le personnage est mort', async () => {
      const animal = makeAnimal();
      (service as any).liveAnimals.set(animal.id, animal);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ health: 0 }));

      const result = await service.attack(animal.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result).toEqual({ success: false, error: 'Character is dead' });
    });

    it('applique les dégâts et retourne un succès', async () => {
      const animal = makeAnimal({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveAnimals.set(animal.id, animal);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      const result = await service.attack(animal.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      // damage = max(max(10,5) - 2, 1) = 8
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.damage).toBe(8);
        expect(result.dto.health).toBe(22);
        expect(result.dto.state).toBe('alive');
      }
      expect(animal.health).toBe(22);
      expect(animal.state).toBe('alive');
    });

    it("tue l'animal, programme un respawn et efface l'état de patrouille", async () => {
      jest.useFakeTimers();
      const animal = makeAnimal({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 5 });
      (service as any).liveAnimals.set(animal.id, animal);
      (service as any).patrolStates.set(animal.id, {});
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, defense: 0 }));

      const result = await service.attack(animal.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      expect(animal.state).toBe('dead');
      expect(animal.health).toBe(0);
      expect((service as any).patrolStates.has(animal.id)).toBe(false);
      expect(jest.getTimerCount()).toBe(1);

      jest.useRealTimers();
    });

    it('préserve l\'état fighting si l\'animal survit', async () => {
      const animal = makeAnimal({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 30, state: 'fighting' });
      (service as any).liveAnimals.set(animal.id, animal);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 7, defense: 3 }));

      const result = await service.attack(animal.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result.success).toBe(true);
      expect(animal.state).toBe('fighting');
    });

    it('rejette si le cooldown d\'attaque est actif', async () => {
      const animal = makeAnimal();
      (service as any).liveAnimals.set(animal.id, animal);
      // Simuler un attack récent
      (service as any).lastAttackAt.set('char-1', Date.now());

      const result = await service.attack(animal.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(result).toEqual({ success: false, error: 'Attack on cooldown' });
    });

    it('accorde XP two_handed au kill sans équipement', async () => {
      jest.useFakeTimers();
      const animal = makeAnimal({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 5 });
      (service as any).liveAnimals.set(animal.id, animal);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, equipment: [] }));

      await service.attack(animal.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(skillsService.addXp).toHaveBeenCalledWith('char-1', 'two_handed', 10);
      jest.useRealTimers();
    });

    it('accorde XP bow pour une arme à distance (catégorie bow)', async () => {
      jest.useFakeTimers();
      const animal = makeAnimal({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 5 });
      (service as any).liveAnimals.set(animal.id, animal);
      const equipment = [makeRangedEquipment('bow')];
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, equipment }));

      await service.attack(animal.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(skillsService.addXp).toHaveBeenCalledWith('char-1', 'bow', 10);
      jest.useRealTimers();
    });

    it('accorde XP crossbow pour une arme catégorie crossbow', async () => {
      jest.useFakeTimers();
      const animal = makeAnimal({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 5 });
      (service as any).liveAnimals.set(animal.id, animal);
      const equipment = [makeRangedEquipment('crossbow')];
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, equipment }));

      await service.attack(animal.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(skillsService.addXp).toHaveBeenCalledWith('char-1', 'crossbow', 10);
      jest.useRealTimers();
    });

    it("n'accorde pas XP si l'animal survit", async () => {
      const animal = makeAnimal({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveAnimals.set(animal.id, animal);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      await service.attack(animal.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(skillsService.addXp).not.toHaveBeenCalled();
    });

    it("n'accorde pas XP si l'animal est déjà mort", async () => {
      const animal = makeAnimal({ state: 'dead' });
      (service as any).liveAnimals.set(animal.id, animal);

      await service.attack(animal.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(skillsService.addXp).not.toHaveBeenCalled();
    });

    it('utilise le characterId serveur (paramètre), pas une donnée client', async () => {
      jest.useFakeTimers();
      const animal = makeAnimal({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 1 });
      (service as any).liveAnimals.set(animal.id, animal);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 50, equipment: [] }));

      await service.attack(animal.id, 'server-resolved-char-id', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(skillsService.addXp).toHaveBeenCalledWith('server-resolved-char-id', expect.any(String), expect.any(Number));
      jest.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  describe('respawnAnimal', () => {
    it("remet l'animal en vie à son point de spawn avec vie pleine", async () => {
      const animal = makeAnimal({ state: 'dead', health: 0, x: 999, y: 999 });
      (service as any).liveAnimals.set(animal.id, animal);
      const mockServer = { emit: jest.fn() };
      (service as any).server = mockServer;

      await (service as any).respawnAnimal(animal.id);

      expect(animal.state).toBe('alive');
      expect(animal.health).toBe(30);
      expect(animal.x).toBe(600);
      expect(animal.y).toBe(580);
      expect(animalRepository.update).toHaveBeenCalledWith(
        animal.id,
        expect.objectContaining({ state: 'alive', health: 30, x: 600, y: 580 }),
      );
      expect(mockServer.emit).toHaveBeenCalledWith(
        'animal_update',
        expect.objectContaining({ id: animal.id, state: 'alive', health: 30 }),
      );
    });

    it("ignore les animaux non morts", async () => {
      const animal = makeAnimal({ state: 'alive' });
      (service as any).liveAnimals.set(animal.id, animal);

      await (service as any).respawnAnimal(animal.id);

      expect(animalRepository.update).not.toHaveBeenCalled();
    });

    it("ignore les ids inconnus", async () => {
      await (service as any).respawnAnimal('ghost-id');
      expect(animalRepository.update).not.toHaveBeenCalled();
    });

    it("n'émet pas si le serveur n'est pas initialisé", async () => {
      const animal = makeAnimal({ state: 'dead', health: 0 });
      (service as any).liveAnimals.set(animal.id, animal);
      (service as any).server = null;

      await expect((service as any).respawnAnimal(animal.id)).resolves.not.toThrow();
      expect(animalRepository.update).toHaveBeenCalled();
    });

    it('écrit worldX/worldY/mapId en DB lors du respawn', async () => {
      // spawn pixel(600, 580) → worldX=6080, worldY=12480
      const animal = makeAnimal({ state: 'dead', health: 0, x: 999, y: 999 });
      (service as any).liveAnimals.set(animal.id, animal);
      (service as any).server = null;

      await (service as any).respawnAnimal(animal.id);

      expect(animalRepository.update).toHaveBeenCalledWith(
        animal.id,
        expect.objectContaining({ worldX: 6080, worldY: 12480, mapId: 1 }),
      );
      expect(animal.worldX).toBe(6080);
      expect(animal.worldY).toBe(12480);
      expect(animal.mapId).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('double-écriture WU', () => {
    it('attack() conserve worldX/worldY/mapId lors du save', async () => {
      // animal WU(6080,12480) fourni dès le départ — plus besoin de conversion pixel→WU (A7)
      const animal = makeAnimal({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1, health: 30 });
      (service as any).liveAnimals.set(animal.id, animal);
      characterRepository.findOne.mockResolvedValue(makeCharacter({ attack: 10, defense: 3 }));

      await service.attack(animal.id, 'char-1', { worldX: 6080, worldY: 12480, mapId: 1 });

      expect(animal.worldX).toBe(6080);
      expect(animal.worldY).toBe(12480);
      expect(animal.mapId).toBe(1);
      expect(animalRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ worldX: 6080, worldY: 12480, mapId: 1 }),
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('synchronisation WU mémoire IA (A2→A4)', () => {
    it('doPatrolMovement synchronise worldX/worldY après déplacement', () => {
      // animal pixel(600,580) → WU(6080,12480), déplacement dirX=1 dirY=0
      const animal = makeAnimal({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1 });
      const state = { dirX: 1, dirY: 0, speed: 60, moveUntil: Infinity, pauseUntil: 0 };

      (service as any).doPatrolMovement(animal, state, makeTemplate(), Date.now());

      expect(Number.isFinite(animal.worldX)).toBe(true);
      expect(Number.isFinite(animal.worldY)).toBe(true);
      expect(animal.mapId).toBe(1);
    });

    it('doFighting synchronise worldX/worldY lors de la poursuite', async () => {
      // animal pixel(700,580) → WU(6880,11680), joueur WU(0,9600) — dist > MELEE_RANGE_WU
      const animal = makeAnimal({ x: 700, y: 580, worldX: 6880, worldY: 11680, mapId: 1 });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 400, y: 300, worldX: 0, worldY: 9600, mapId: 1,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0, targetCharacterId: 'char-1' };
      const mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };

      await (service as any).doFighting(animal, state, makeTemplate(), [player], Date.now(), mockServer);

      expect(Number.isFinite(animal.worldX)).toBe(true);
      expect(Number.isFinite(animal.worldY)).toBe(true);
      expect(animal.mapId).toBe(1);
    });

    it('doEscaping synchronise worldX/worldY lors de la fuite', async () => {
      // animal pixel(600,580) → WU(6080,12480), joueur pixel(600,560) → WU(5760,12160)
      // chebyshev=320 WU < patrolRadius(200px)=3200 WU → animal reste en fuite
      const animal = makeAnimal({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1 });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 600, y: 560, worldX: 5760, worldY: 12160, mapId: 1,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };

      await (service as any).doEscaping(animal, state, makeTemplate(), [player], Date.now());

      expect(Number.isFinite(animal.worldX)).toBe(true);
      expect(Number.isFinite(animal.worldY)).toBe(true);
      expect(animal.mapId).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('findNearestPlayer WU (A3)', () => {
    it('retourne null si animal n\'a pas de worldX/worldY → doEscaping passe en alive', async () => {
      // animal sans WU → findNearestPlayer retourne null immédiatement
      const animal = makeAnimal({ state: 'escaping' });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 600, y: 560, worldX: 5760, worldY: 12160, mapId: 1,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };

      await (service as any).doEscaping(animal, state, makeTemplate(), [player], Date.now());

      expect(animal.state).toBe('alive');
    });

    it('exclut les joueurs sur une carte différente (mapId filter)', async () => {
      // animal mapId=1, seul joueur mapId=2 → nearest=null → retour en alive
      const animal = makeAnimal({ state: 'escaping', worldX: 6080, worldY: 12480, mapId: 1 });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 600, y: 560, worldX: 5760, worldY: 12160, mapId: 2,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };

      await (service as any).doEscaping(animal, state, makeTemplate(), [player], Date.now());

      expect(animal.state).toBe('alive');
    });

    it('sélectionne le joueur le plus proche par WU', async () => {
      // animal WU(6080,12480) — près: WU(5760,12160) chebyshev=320 — loin: WU(-4160,12160) chebyshev=10240
      // patrolRadius(200px)=3200 WU : le joueur proche (320≤3200) maintient la fuite
      const animal = makeAnimal({ state: 'escaping', worldX: 6080, worldY: 12480, mapId: 1 });
      const near = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 600, y: 560, worldX: 5760, worldY: 12160, mapId: 1, name: 'Near', direction: 'down',
      };
      const far = {
        characterId: 'char-2', socketId: 'sock-2',
        x: 100, y: 560, worldX: -4160, worldY: 12160, mapId: 1, name: 'Far', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };

      await (service as any).doEscaping(animal, state, makeTemplate(), [near, far], Date.now());

      // Le plus proche (near) est dans le patrolRadius → l'animal continue à fuir
      expect(animal.state).toBe('escaping');
    });
  });

  // -------------------------------------------------------------------------
  describe('moteur de déplacement WU (A4)', () => {
    it('doPatrolMovement — worldX/worldY sont la vérité, x/y dérivés par projection', () => {
      // animal WU(6080,12480), dirX=1 dirY=0, speed=60, dt=0.2s
      // stepWU=192 → newWX=6272, newWY=12480 < patrolRadius(3200WU) → else
      const animal = makeAnimal({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1 });
      const state = { dirX: 1, dirY: 0, speed: 60, moveUntil: Infinity, pauseUntil: 0 };

      (service as any).doPatrolMovement(animal, state, makeTemplate(), Date.now());

      expect(animal.worldX).toBe(6272);
      expect(animal.worldY).toBe(12480);
      expect(animal.x).toBe(Math.round(wuToIsoScreenX(animal.worldX!, animal.worldY!)));
      expect(animal.y).toBe(Math.round(wuToIsoScreenY(animal.worldX!, animal.worldY!)));
    });

    it('doFighting — x/y dérivés de worldX/worldY après poursuite', async () => {
      // animal WU(6880,11680), joueur WU(0,9600) — dist>MELEE_RANGE_WU → mouvement
      const animal = makeAnimal({ x: 700, y: 580, worldX: 6880, worldY: 11680, mapId: 1 });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 400, y: 300, worldX: 0, worldY: 9600, mapId: 1,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0, targetCharacterId: 'char-1' };
      const mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };

      await (service as any).doFighting(animal, state, makeTemplate(), [player], Date.now(), mockServer);

      expect(Number.isFinite(animal.worldX)).toBe(true);
      expect(animal.x).toBe(Math.round(wuToIsoScreenX(animal.worldX!, animal.worldY!)));
      expect(animal.y).toBe(Math.round(wuToIsoScreenY(animal.worldX!, animal.worldY!)));
    });

    it('doEscaping — x/y dérivés de worldX/worldY lors de la fuite', async () => {
      // animal WU(6080,12480), joueur WU(5760,12160) — dist(320WU) < patrolRadius(3200WU)
      const animal = makeAnimal({ x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1 });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 600, y: 560, worldX: 5760, worldY: 12160, mapId: 1,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };

      await (service as any).doEscaping(animal, state, makeTemplate(), [player], Date.now());

      expect(Number.isFinite(animal.worldX)).toBe(true);
      expect(animal.x).toBe(Math.round(wuToIsoScreenX(animal.worldX!, animal.worldY!)));
      expect(animal.y).toBe(Math.round(wuToIsoScreenY(animal.worldX!, animal.worldY!)));
    });

    it('doPatrolMovement — guard : retourne sans modifier si worldX est null', () => {
      const animal = makeAnimal({ x: 600, y: 580 });
      const state = { dirX: 1, dirY: 0, speed: 60, moveUntil: Infinity, pauseUntil: 0 };
      const prevX = animal.x;

      (service as any).doPatrolMovement(animal, state, makeTemplate(), Date.now());

      expect(animal.x).toBe(prevX);
      expect(animal.worldX).toBeUndefined();
    });
  });
});
