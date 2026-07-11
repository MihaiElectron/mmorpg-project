import { Test, TestingModule } from '@nestjs/testing';
import { MasteryEffectsService } from './mastery-effects.service';
import { MasteriesService } from './masteries.service';
import type { MasteryEffectsDefinitionLike } from './mastery-effects.calculator';

const TWO_HANDED_DEF: MasteryEffectsDefinitionLike = {
  key: 'two_handed',
  enabled: true,
  effects: {
    context: { weaponType: 'two_handed_sword' },
    modifiers: [{ stat: 'physicalAttack', mode: 'percentPerLevel', value: 5 }],
  },
};

const VITALITY_DEF: MasteryEffectsDefinitionLike = {
  key: 'vitality_training',
  enabled: true,
  effects: {
    modifiers: [{ stat: 'maxHealth', mode: 'percentPerLevel', value: 2 }],
  },
};

describe('MasteryEffectsService (V2)', () => {
  let service: MasteryEffectsService;
  let masteriesService: {
    getEnabledMasteryDefinitions: jest.Mock;
    getCharacterMasteries: jest.Mock;
  };

  beforeEach(async () => {
    masteriesService = {
      getEnabledMasteryDefinitions: jest.fn().mockResolvedValue([TWO_HANDED_DEF, VITALITY_DEF]),
      getCharacterMasteries: jest.fn().mockResolvedValue([
        { key: 'two_handed', level: 3 },
        { key: 'vitality_training', level: 5 },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MasteryEffectsService,
        { provide: MasteriesService, useValue: masteriesService },
      ],
    }).compile();

    service = module.get<MasteryEffectsService>(MasteryEffectsService);
  });

  it('getMasteryBonuses : un seul chargement → permanents + contextuel', async () => {
    const result = await service.getMasteryBonuses('char-1', {
      weaponType: 'two_handed_sword',
    });

    // Contextuel : (3−1)×5 = 10 %. Permanent : (5−1)×2 = 8 % maxHealth.
    expect(result.combat).toEqual({ damagePercent: 10, damageFlat: 0 });
    expect(result.statModifiers).toEqual({ percent: { maxHealth: 8 }, flat: {} });
    expect(masteriesService.getEnabledMasteryDefinitions).toHaveBeenCalledTimes(1);
    expect(masteriesService.getCharacterMasteries).toHaveBeenCalledTimes(1);
  });

  it('getPermanentStatModifiers : ignore les effets contextuels', async () => {
    const result = await service.getPermanentStatModifiers('char-1');
    expect(result).toEqual({ percent: { maxHealth: 8 }, flat: {} });
  });

  it('getCombatMasteryEffects : court-circuit sans weaponType (aucune lecture)', async () => {
    const result = await service.getCombatMasteryEffects('char-1', {});
    expect(result).toEqual({ damagePercent: 0, damageFlat: 0 });
    expect(masteriesService.getEnabledMasteryDefinitions).not.toHaveBeenCalled();
  });

  it('façades pures : computeCombatEffects et aggregatePermanentModifiers', () => {
    const levels = { two_handed: 3, vitality_training: 5 };
    expect(
      service.computeCombatEffects([TWO_HANDED_DEF], levels, { weaponType: 'two_handed_sword' }),
    ).toEqual({ damagePercent: 10, damageFlat: 0 });
    expect(service.aggregatePermanentModifiers([VITALITY_DEF], levels)).toEqual({
      percent: { maxHealth: 8 },
      flat: {},
    });
    expect(service.emptyStatModifiers()).toEqual({ percent: {}, flat: {} });
  });
});
