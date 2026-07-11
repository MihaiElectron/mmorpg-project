import {
  buildMasteryEffectTargets,
  CONTEXTUAL_MASTERY_EFFECT_STATS,
  indexMasteryEffectTargets,
  MASTERY_EFFECT_MODES,
  MasteryTargetSourceDefinition,
} from './mastery-effect-targets';

// Fixture : source DerivedStatDefinition minimale pour les tests.
function source(
  overrides: Partial<MasteryTargetSourceDefinition> = {},
): MasteryTargetSourceDefinition {
  return {
    key: 'physicalAttack',
    label: 'Attaque physique',
    category: 'offensive',
    enabled: true,
    masteryEligible: true,
    allowedModifierModes: ['percentPerLevel', 'flatPerLevel'],
    runtimeStatus: 'implemented',
    description: 'Consommée par le combat.',
    ...overrides,
  };
}

/** Les 10 dérivées implémentées, telles qu'après la réconciliation V3-B. */
export const IMPLEMENTED_SOURCES: MasteryTargetSourceDefinition[] = [
  'physicalAttack',
  'defense',
  'maxHealth',
  'maxMana',
  'maxEnergy',
  'healthRegen',
  'manaRegen',
  'energyRegen',
  'healingPower',
  'magicPower',
].map((key) => source({ key, label: key }));

/** Targets standard pour les tests des consommateurs (calculateur/service). */
export const STANDARD_TARGETS = buildMasteryEffectTargets(IMPLEMENTED_SOURCES);

describe('buildMasteryEffectTargets (V3-B — depuis les DerivedStatDefinition)', () => {
  it('expose une dérivée implemented + masteryEligible + modes', () => {
    const targets = buildMasteryEffectTargets([source()]);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual({
      key: 'physicalAttack',
      label: 'Attaque physique',
      category: 'offensive',
      allowedModes: ['percentPerLevel', 'flatPerLevel'],
      minValueByMode: { percentPerLevel: 0, flatPerLevel: 0 },
      maxValueByMode: { percentPerLevel: 5, flatPerLevel: 100 },
      runtimeStatus: 'implemented',
      description: 'Consommée par le combat.',
    });
  });

  it('construit les 10 targets standard', () => {
    expect(STANDARD_TARGETS.map((t) => t.key).sort()).toEqual(
      IMPLEMENTED_SOURCES.map((s) => s.key).sort(),
    );
  });

  it('EXCLUT disabled', () => {
    expect(buildMasteryEffectTargets([source({ enabled: false })])).toHaveLength(0);
  });

  it('EXCLUT masteryEligible=false', () => {
    expect(buildMasteryEffectTargets([source({ masteryEligible: false })])).toHaveLength(0);
  });

  it('EXCLUT runtimeStatus calculatedOnly et notHooked', () => {
    expect(buildMasteryEffectTargets([source({ runtimeStatus: 'calculatedOnly' })])).toHaveLength(0);
    expect(buildMasteryEffectTargets([source({ runtimeStatus: 'notHooked' })])).toHaveLength(0);
  });

  it('EXCLUT allowedModifierModes vide et null', () => {
    expect(buildMasteryEffectTargets([source({ allowedModifierModes: [] })])).toHaveLength(0);
    expect(buildMasteryEffectTargets([source({ allowedModifierModes: null })])).toHaveLength(0);
  });

  it('conserve uniquement les modes valides', () => {
    const targets = buildMasteryEffectTargets([
      source({ allowedModifierModes: ['percentPerLevel', 'bogus' as never] }),
    ]);
    expect(targets[0].allowedModes).toEqual(['percentPerLevel']);
  });

  it('expose une stat CUSTOM (créée dans le Studio) si elle remplit les critères', () => {
    const targets = buildMasteryEffectTargets([
      source({ key: 'luck', label: 'Chance', category: 'social_threat' }),
    ]);
    expect(targets.map((t) => t.key)).toEqual(['luck']);
  });

  it('indexMasteryEffectTargets indexe par key', () => {
    const idx = indexMasteryEffectTargets(STANDARD_TARGETS);
    expect(idx.get('maxHealth')?.label).toBe('maxHealth');
    expect(idx.get('criticalChance')).toBeUndefined();
  });

  it('MASTERY_EFFECT_MODES et CONTEXTUAL_MASTERY_EFFECT_STATS restent constants', () => {
    expect(MASTERY_EFFECT_MODES.map((m) => m.key)).toEqual([
      'percentPerLevel',
      'flatPerLevel',
    ]);
    expect(CONTEXTUAL_MASTERY_EFFECT_STATS).toEqual(['physicalAttack']);
  });
});
