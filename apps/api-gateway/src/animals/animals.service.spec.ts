import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnimalsService } from './animals.service';
import { Animal } from './entities/animal.entity';
import { CreatureTemplate } from './entities/creature-template.entity';
import { CreatureSpawn } from './entities/creature-spawn.entity';
import { Character } from '../characters/entities/character.entity';
import { WorldService } from '../world/world.service';

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

describe('AnimalsService', () => {
  let service: AnimalsService;
  let animalRepository: Record<string, jest.Mock>;
  let characterRepository: Record<string, jest.Mock>;
  let templateRepository: Record<string, jest.Mock>;
  let spawnRepository: Record<string, jest.Mock>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnimalsService,
        { provide: getRepositoryToken(Animal), useValue: animalRepository },
        { provide: getRepositoryToken(CreatureTemplate), useValue: templateRepository },
        { provide: getRepositoryToken(CreatureSpawn), useValue: spawnRepository },
        { provide: getRepositoryToken(Character), useValue: characterRepository },
        { provide: WorldService, useValue: { getAllConnectedPlayers: jest.fn().mockReturnValue([]) } },
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
      const animal = makeAnimal({ x: 600, y: 580, health: 30 });
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
      const animal = makeAnimal({ x: 600, y: 580, health: 5 });
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
      const animal = makeAnimal({ x: 600, y: 580, health: 30, state: 'fighting' });
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
    it('attack() écrit worldX/worldY/mapId sur l\'entité avant save', async () => {
      // animal pixel(600, 580) → worldX=6080, worldY=12480
      const animal = makeAnimal({ x: 600, y: 580, health: 30 });
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
  describe('synchronisation WU mémoire IA (A2)', () => {
    it('doPatrolMovement synchronise worldX/worldY après déplacement', () => {
      // animal pixel(600, 580), se déplace vers la droite
      const animal = makeAnimal({ x: 600, y: 580 });
      const state = { dirX: 1, dirY: 0, speed: 60, moveUntil: Infinity, pauseUntil: 0 };

      (service as any).doPatrolMovement(animal, state, makeTemplate(), Date.now());

      expect(Number.isFinite(animal.worldX)).toBe(true);
      expect(Number.isFinite(animal.worldY)).toBe(true);
      expect(animal.mapId).toBe(1);
    });

    it('doFighting synchronise worldX/worldY lors de la poursuite', async () => {
      // animal (700,580), joueur (400,300) — dist ≈ 410 > MELEE_RANGE
      const animal = makeAnimal({ x: 700, y: 580 });
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
      // animal (600,580), joueur (600,560) — animal fuit vers le haut
      const animal = makeAnimal({ x: 600, y: 580 });
      const player = {
        characterId: 'char-1', socketId: 'sock-1',
        x: 600, y: 560, worldX: 1600, worldY: 11840, mapId: 1,
        name: 'Test', direction: 'down',
      };
      const state = { dirX: 0, dirY: 0, speed: 0, moveUntil: 0, pauseUntil: 0 };

      await (service as any).doEscaping(animal, state, makeTemplate(), [player], Date.now());

      expect(Number.isFinite(animal.worldX)).toBe(true);
      expect(Number.isFinite(animal.worldY)).toBe(true);
      expect(animal.mapId).toBe(1);
    });
  });
});
