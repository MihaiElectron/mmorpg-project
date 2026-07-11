import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MasteryEffectsService } from './mastery-effects.service';
import { MasteriesService } from './masteries.service';
import { MasteryDefinition } from './entities/mastery-definition.entity';

describe('MasteryEffectsService', () => {
  let service: MasteryEffectsService;
  let masteryDefRepo: { find: jest.Mock };
  let masteriesService: { getCharacterMasteries: jest.Mock };

  beforeEach(async () => {
    masteryDefRepo = { find: jest.fn() };
    masteriesService = { getCharacterMasteries: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MasteryEffectsService,
        { provide: getRepositoryToken(MasteryDefinition), useValue: masteryDefRepo },
        { provide: MasteriesService, useValue: masteriesService },
      ],
    }).compile();

    service = module.get<MasteryEffectsService>(MasteryEffectsService);
  });

  it('court-circuite sans weaponType : 0 % et AUCUNE lecture DB', async () => {
    const result = await service.getCombatMasteryEffects('char-1', {});

    expect(result).toEqual({ damagePercent: 0 });
    expect(masteryDefRepo.find).not.toHaveBeenCalled();
    expect(masteriesService.getCharacterMasteries).not.toHaveBeenCalled();
  });

  it('charge les définitions enabled + niveaux joueur et calcule le bonus', async () => {
    masteryDefRepo.find.mockResolvedValue([
      {
        key: 'dagger',
        enabled: true,
        effects: {
          context: { weaponType: 'dagger' },
          combat: { damagePercentPerLevel: 0.5 },
        },
      },
    ]);
    masteriesService.getCharacterMasteries.mockResolvedValue([
      { key: 'dagger', level: 5 },
      { key: 'bow', level: 20 },
    ]);

    const result = await service.getCombatMasteryEffects('char-1', {
      weaponType: 'dagger',
    });

    // (5 − 1) × 0.5 = 2 %.
    expect(result).toEqual({ damagePercent: 2 });
    expect(masteryDefRepo.find).toHaveBeenCalledWith({ where: { enabled: true } });
    expect(masteriesService.getCharacterMasteries).toHaveBeenCalledWith('char-1');
  });

  it('retourne 0 quand aucune définition ne matche le contexte', async () => {
    masteryDefRepo.find.mockResolvedValue([
      {
        key: 'bow',
        enabled: true,
        effects: {
          context: { weaponType: 'bow' },
          combat: { damagePercentPerLevel: 1 },
        },
      },
    ]);
    masteriesService.getCharacterMasteries.mockResolvedValue([{ key: 'bow', level: 10 }]);

    const result = await service.getCombatMasteryEffects('char-1', {
      weaponType: 'dagger',
    });

    expect(result).toEqual({ damagePercent: 0 });
  });

  it('computeCombatEffects (sans I/O) délègue au calculateur pur', () => {
    const result = service.computeCombatEffects(
      [
        {
          key: 'dagger',
          enabled: true,
          effects: {
            context: { weaponType: 'dagger' },
            combat: { damagePercentPerLevel: 1 },
          },
        },
      ],
      { dagger: 11 },
      { weaponType: 'dagger' },
    );

    expect(result).toEqual({ damagePercent: 10 });
  });
});
