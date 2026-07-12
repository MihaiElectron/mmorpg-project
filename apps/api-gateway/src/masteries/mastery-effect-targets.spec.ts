import {
  buildMasteryEffectTargets,
  CONTEXTUAL_MASTERY_EFFECT_STATS,
  indexMasteryEffectTargets,
  MASTERY_EFFECT_MODES,
  MasteryTargetSourceDefinition,
} from './mastery-effect-targets';
import { DEFAULT_DERIVED_STAT_DEFINITIONS } from '../derived-stats/derived-stats.constants';

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

  // ── V4-A : armorPenetrationPercent exposée comme target permanent ──────────
  describe('armorPenetrationPercent (V4-A)', () => {
    it('est exposée comme target depuis les defaults système (2 modes)', () => {
      const targets = buildMasteryEffectTargets(DEFAULT_DERIVED_STAT_DEFINITIONS);
      const target = targets.find((t) => t.key === 'armorPenetrationPercent');
      expect(target).toBeDefined();
      expect(target!.allowedModes).toEqual(['percentPerLevel', 'flatPerLevel']);
      expect(target!.runtimeStatus).toBe('implemented');
    });

    it("n'est PAS contextuelle weaponType (contexte réservé à physicalAttack)", () => {
      expect(CONTEXTUAL_MASTERY_EFFECT_STATS).not.toContain('armorPenetrationPercent');
    });

    it("l'ancienne defensePenetration n'est plus une cible (retirée des defaults)", () => {
      const targets = buildMasteryEffectTargets(DEFAULT_DERIVED_STAT_DEFINITIONS);
      expect(targets.find((t) => t.key === 'defensePenetration')).toBeUndefined();
    });
  });

  // ── V4-D : critique exposé comme target permanent ─────────────────────────
  describe('critique (V4-D)', () => {
    const targets = buildMasteryEffectTargets(DEFAULT_DERIVED_STAT_DEFINITIONS);

    it('criticalChance est exposée comme target (2 modes, implemented)', () => {
      const t = targets.find((x) => x.key === 'criticalChance');
      expect(t).toBeDefined();
      expect(t!.runtimeStatus).toBe('implemented');
      expect(t!.allowedModes).toEqual(['percentPerLevel', 'flatPerLevel']);
    });

    it('criticalDamage est exposée comme target (2 modes, implemented)', () => {
      const t = targets.find((x) => x.key === 'criticalDamage');
      expect(t).toBeDefined();
      expect(t!.runtimeStatus).toBe('implemented');
      expect(t!.allowedModes).toEqual(['percentPerLevel', 'flatPerLevel']);
    });

    it("critique n'est PAS contextuel weaponType : contextualStats reste [physicalAttack]", () => {
      expect(CONTEXTUAL_MASTERY_EFFECT_STATS).toEqual(['physicalAttack']);
    });
  });

  // ── V4-F : esquive exposée comme target permanent ─────────────────────────
  describe('esquive (V4-F)', () => {
    const targets = buildMasteryEffectTargets(DEFAULT_DERIVED_STAT_DEFINITIONS);

    it('dodgeChance est exposée comme target (2 modes, implemented)', () => {
      const t = targets.find((x) => x.key === 'dodgeChance');
      expect(t).toBeDefined();
      expect(t!.runtimeStatus).toBe('implemented');
      expect(t!.allowedModes).toEqual(['percentPerLevel', 'flatPerLevel']);
    });

    it("dodgeChance n'est PAS contextuelle weaponType", () => {
      expect(CONTEXTUAL_MASTERY_EFFECT_STATS).not.toContain('dodgeChance');
    });
  });
});
