import { Test, TestingModule } from '@nestjs/testing';
import { ProgressionService, ProgressionSource } from './progression.service';
import { GameConfigService } from '../game-config/game-config.service';

const STAT_POINTS_PER_LEVEL = 5;

function makeConfig(overrides: Partial<Record<string, number>> = {}) {
  return {
    id: 1,
    // Modèle XP par tranches (ADR-0018). Multiplicateur 2 en tranche 1-10 pour
    // des seuils ronds dans les tests : 1->2=100, 2->3=200, 3->4=400...
    startingXp: 100,
    xpMultiplierLevel1To10: 2,
    xpMultiplierLevel11To30: 1.5,
    xpMultiplierLevel31To60: 1.25,
    xpMultiplierLevel61To120: 1.1,
    characterMaxLevel: 100,
    characterCurrentLevelCap: 60,
    statPointsAtLevelOne: 3,
    statPointsPerLevel: STAT_POINTS_PER_LEVEL,
    masteryNaturalCap: 1000,
    masteryOvercap: 2000,
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
    it("retourne le cout de la marche 1 -> 2 (startingXp)", async () => {
      expect(await service.getNextLevelXp(1)).toBe(100);
    });

    it("retourne le cout de la marche 2 -> 3 (multiplicateur de tranche)", async () => {
      // 100 * 2 = 200
      expect(await service.getNextLevelXp(2)).toBe(200);
    });
  });

  describe('applyCharacterXpInTx', () => {
    function makeManager(character: any) {
      return {
        findOne: jest.fn().mockResolvedValue({ unspentStatPoints: 0, ...character }),
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

  describe('points de stats au level-up', () => {
    function makeManager(character: any) {
      return {
        findOne: jest.fn().mockResolvedValue({ unspentStatPoints: 0, ...character }),
        update: jest.fn().mockResolvedValue({}),
      };
    }

    it("accorde les points configures pour un seul niveau gagne", async () => {
      const manager = makeManager({ id: "char-1", level: 1, experience: 0 });
      const result = await service.applyCharacterXpInTx("char-1", 100, ProgressionSource.COMBAT, manager as any);
      expect(result.gainedLevels).toBe(1);
      expect(result.unspentStatPoints).toBe(STAT_POINTS_PER_LEVEL);
    });

    it("accorde les points configures par niveau pour un multi-level", async () => {
      // Tranche 1-10, multiplicateur 2 : 1->2=100, 2->3=200, 3->4=400.
      // 100 + 200 + 400 = 700 -> 3 niveaux gagnes.
      const manager = makeManager({ id: "char-1", level: 1, experience: 0 });
      const result = await service.applyCharacterXpInTx("char-1", 700, ProgressionSource.COMBAT, manager as any);
      expect(result.gainedLevels).toBe(3);
      expect(result.unspentStatPoints).toBe(3 * STAT_POINTS_PER_LEVEL);
    });

    it("n'accorde aucun point sans level-up", async () => {
      const manager = makeManager({ id: "char-1", level: 1, experience: 0 });
      const result = await service.applyCharacterXpInTx("char-1", 50, ProgressionSource.COMBAT, manager as any);
      expect(result.gainedLevels).toBe(0);
      expect(result.unspentStatPoints).toBe(0);
    });

    it("cumule les points avec ceux deja possedes", async () => {
      const manager = makeManager({ id: "char-1", level: 1, experience: 0, unspentStatPoints: 12 });
      const result = await service.applyCharacterXpInTx("char-1", 100, ProgressionSource.COMBAT, manager as any);
      expect(result.unspentStatPoints).toBe(12 + STAT_POINTS_PER_LEVEL);
    });

    it("n'accorde aucun point au-dela du niveau maximum", async () => {
      const manager = makeManager({ id: "char-1", level: 100, experience: 0, unspentStatPoints: 7 });
      const result = await service.applyCharacterXpInTx("char-1", 99999, ProgressionSource.COMBAT, manager as any);
      expect(result.gainedLevels).toBe(0);
      expect(result.unspentStatPoints).toBe(7);
    });

    it("persiste unspentStatPoints dans le meme update que level/experience", async () => {
      const manager = makeManager({ id: "char-1", level: 1, experience: 0 });
      await service.applyCharacterXpInTx("char-1", 100, ProgressionSource.COMBAT, manager as any);
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        "char-1",
        expect.objectContaining({ level: 2, unspentStatPoints: STAT_POINTS_PER_LEVEL }),
      );
    });
  });
});
