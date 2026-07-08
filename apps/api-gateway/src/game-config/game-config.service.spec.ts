import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GameConfigService } from './game-config.service';
import { GameConfig } from './game-config.entity';

function baseConfig(): GameConfig {
  return {
    id: 1,
    // Modèle XP actif (tranches multiplicatives).
    startingXp: 100,
    xpMultiplierLevel1To10: 1.2,
    xpMultiplierLevel11To30: 1.15,
    xpMultiplierLevel31To60: 1.12,
    xpMultiplierLevel61To120: 1.1,
    // Legacy — conservés pour compatibilité, sans effet sur le calcul.
    characterBaseXpPerLevel: 100,
    characterXpCurveExponent: 1.5,
    characterXpCoefficient: 1.0,
    highLevelXpMultiplier: 1.0,
    characterMaxLevel: 120,
    characterCurrentLevelCap: 60,
    statPointsAtLevelOne: 3,
    statPointsPerLevel: 3,
    masteryNaturalCap: 1000,
    masteryOvercap: 2000,
  };
}

describe('GameConfigService', () => {
  let service: GameConfigService;
  let repo: {
    findOne: jest.Mock;
    save: jest.Mock;
    merge: jest.Mock;
    create: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn().mockResolvedValue(baseConfig()),
      save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
      merge: jest.fn().mockImplementation((target, patch) => ({ ...target, ...patch })),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameConfigService,
        { provide: getRepositoryToken(GameConfig), useValue: repo },
      ],
    }).compile();

    service = module.get<GameConfigService>(GameConfigService);
  });

  it("met en cache la config apres la premiere lecture", async () => {
    await service.getConfig();
    await service.getConfig();
    expect(repo.findOne).toHaveBeenCalledTimes(1);
  });

  it("fusionne le patch, sauvegarde et invalide le cache", async () => {
    await service.getConfig();
    const saved = await service.updateConfig({ characterMaxLevel: 999, statPointsPerLevel: 7 });

    expect(saved.characterMaxLevel).toBe(999);
    expect(saved.statPointsPerLevel).toBe(7);
    expect(saved.id).toBe(1);
    expect(repo.save).toHaveBeenCalledTimes(1);

    // Cache invalidé : la lecture suivante relit le repo.
    repo.findOne.mockClear();
    await service.getConfig();
    expect(repo.findOne).toHaveBeenCalledTimes(1);
  });

  it("ignore toute tentative de modifier la cle primaire", async () => {
    const saved = await service.updateConfig({ id: 42 } as Partial<GameConfig>);
    expect(saved.id).toBe(1);
  });
});
