import { Test, TestingModule } from '@nestjs/testing';
import { ProgressionService, ProgressionSource } from './progression.service';
import { GameConfigService } from '../game-config/game-config.service';
import { Character } from '../characters/entities/character.entity';

const DEFAULT_CONFIG = {
  id: 1,
  characterBaseXpPerLevel: 100,
  characterXpCurveExponent: 1.5,
  characterMaxLevel: 100,
};

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    level: 1,
    experience: 0,
    health: 100,
    maxHealth: 100,
    attack: 10,
    defense: 5,
    baseAttack: 10,
    baseDefense: 5,
    name: "Hero",
    worldX: 0,
    worldY: 0,
    mapId: 1,
    ...overrides,
  } as Character;
}

describe("ProgressionService", () => {
  let service: ProgressionService;
  let gameConfigService: jest.Mocked<GameConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressionService,
        {
          provide: GameConfigService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ ...DEFAULT_CONFIG }),
          },
        },
      ],
    }).compile();

    service = module.get(ProgressionService);
    gameConfigService = module.get(GameConfigService);
  });

  describe("getNextLevelXp", () => {
    it("retourne la bonne valeur pour le niveau 1", async () => {
      // floor(100 * 1^1.5) = 100
      const result = await service.getNextLevelXp(1);
      expect(result).toBe(100);
    });

    it("retourne la bonne valeur pour le niveau 2", async () => {
      // floor(100 * 2^1.5) = floor(282.84) = 283
      const result = await service.getNextLevelXp(2);
      expect(result).toBe(283);
    });
  });

  describe("applyCharacterXpInTx", () => {
    let mockManager: any;

    beforeEach(() => {
      const char = makeCharacter({ level: 1, experience: 0 });
      mockManager = {
        findOne: jest.fn().mockResolvedValue(char),
        update: jest.fn().mockResolvedValue({}),
      };
    });

    it("crédit XP sans level-up", async () => {
      const result = await service.applyCharacterXpInTx("char-1", 50, ProgressionSource.COMBAT, mockManager);
      expect(result.experience).toBe(50);
      expect(result.level).toBe(1);
      expect(result.leveledUp).toBe(false);
      expect(mockManager.update).toHaveBeenCalledWith(Character, "char-1", { level: 1, experience: 50 });
    });

    it("level-up quand l'XP atteint le seuil", async () => {
      // niveau 1 → besoin de 100 XP (100 * 1^1.5 = 100)
      const result = await service.applyCharacterXpInTx("char-1", 100, ProgressionSource.COMBAT, mockManager);
      expect(result.level).toBe(2);
      expect(result.experience).toBe(0);
      expect(result.leveledUp).toBe(true);
    });

    it("XP restante après level-up est correcte", async () => {
      const result = await service.applyCharacterXpInTx("char-1", 150, ProgressionSource.COMBAT, mockManager);
      expect(result.level).toBe(2);
      expect(result.experience).toBe(50);
      expect(result.leveledUp).toBe(true);
    });

    it("ne depasse pas le niveau maximum", async () => {
      gameConfigService.getConfig.mockResolvedValue({ ...DEFAULT_CONFIG, characterMaxLevel: 1 });
      const char = makeCharacter({ level: 1, experience: 0 });
      mockManager.findOne.mockResolvedValue(char);

      const result = await service.applyCharacterXpInTx("char-1", 9999, ProgressionSource.COMBAT, mockManager);
      expect(result.level).toBe(1);
      expect(result.leveledUp).toBe(false);
      expect(result.nextLevelXp).toBe(0);
    });

    it("lance une erreur si le personnage est introuvable", async () => {
      mockManager.findOne.mockResolvedValue(null);
      await expect(
        service.applyCharacterXpInTx("unknown", 50, ProgressionSource.COMBAT, mockManager),
      ).rejects.toThrow("unknown");
    });
  });
});
