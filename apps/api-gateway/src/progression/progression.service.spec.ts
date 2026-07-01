import { Test, TestingModule } from '@nestjs/testing';
import { ProgressionService, ProgressionSource } from './progression.service';
import { GameConfigService } from '../game-config/game-config.service';

function makeConfig(overrides: Partial<{ characterBaseXpPerLevel: number; characterXpCurveExponent: number; characterMaxLevel: number }> = {}) {
  return {
    id: 1,
    characterBaseXpPerLevel: 100,
    characterXpCurveExponent: 1.5,
    characterMaxLevel: 100,
    ...overrides,
  };
}

describe('ProgressionService', () => {
  let service: ProgressionService;
  let gameConfigService: { getConfig: jest.Mock };

  beforeEach(async () => {
    gameConfigService = { getConfig: jest.fn().mockResolvedValue(makeConfig()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressionService,
        { provide: GameConfigService, useValue: gameConfigService },
      ],
    }).compile();

    service = module.get<ProgressionService>(ProgressionService);
  });

  describe('getNextLevelXp', () => {
    it("retourne la bonne valeur pour le niveau 1", async () => {
      // Math.round(100 * 1^1.5) = 100
      expect(await service.getNextLevelXp(1)).toBe(100);
    });

    it("retourne la bonne valeur pour le niveau 2", async () => {
      // Math.round(100 * 2^1.5) = Math.round(100 * 2.828) = 283
      expect(await service.getNextLevelXp(2)).toBe(283);
    });
  });

  describe('applyCharacterXpInTx', () => {
    function makeManager(character: any) {
      return {
        findOne: jest.fn().mockResolvedValue(character),
        update: jest.fn().mockResolvedValue({}),
      };
    }

    it("ne level-up pas avec XP insuffisante", async () => {
      const manager = makeManager({ id: "char-1", level: 1, experience: 0 });
      const result = await service.applyCharacterXpInTx("char-1", 50, ProgressionSource.COMBAT, manager as any);
      expect(result.level).toBe(1);
      expect(result.experience).toBe(50);
      expect(result.leveledUp).toBe(false);
    });

    it("level-up quand l'XP atteint le seuil", async () => {
      const manager = makeManager({ id: "char-1", level: 1, experience: 0 });
      const result = await service.applyCharacterXpInTx("char-1", 100, ProgressionSource.COMBAT, manager as any);
      expect(result.level).toBe(2);
      expect(result.leveledUp).toBe(true);
    });

    it("XP restante apres level-up est correcte", async () => {
      const manager = makeManager({ id: "char-1", level: 1, experience: 0 });
      const result = await service.applyCharacterXpInTx("char-1", 150, ProgressionSource.COMBAT, manager as any);
      expect(result.level).toBe(2);
      expect(result.experience).toBe(50);
    });

    it("ne depasse pas le niveau maximum", async () => {
      const manager = makeManager({ id: "char-1", level: 100, experience: 0 });
      const result = await service.applyCharacterXpInTx("char-1", 99999, ProgressionSource.COMBAT, manager as any);
      expect(result.level).toBe(100);
      expect(result.nextLevelXp).toBe(0);
    });

    it("lance une erreur si le personnage est introuvable", async () => {
      const manager = { findOne: jest.fn().mockResolvedValue(null), update: jest.fn() };
      await expect(
        service.applyCharacterXpInTx("inexistant", 50, ProgressionSource.COMBAT, manager as any),
      ).rejects.toThrow("inexistant");
    });
  });
});
