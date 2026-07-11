import {
  CONTEXTUAL_MASTERY_EFFECT_STATS,
  getMasteryEffectTarget,
  MASTERY_EFFECT_MODES,
  MASTERY_EFFECT_TARGETS,
} from './mastery-effect-targets';
import {
  MASTERY_MODIFIER_STATS,
  MasteryEffectsValidationError,
  sanitizeMasteryEffects,
} from './mastery-effects.calculator';

describe('MASTERY_EFFECT_TARGETS (source serveur unique — V2-E)', () => {
  it('expose exactement les 10 stats branchées gameplay', () => {
    expect(MASTERY_EFFECT_TARGETS.map((t) => t.key).sort()).toEqual(
      [
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
      ].sort(),
    );
  });

  it('chaque target porte key/label/category/allowedModes/bornes/runtimeStatus/description', () => {
    for (const t of MASTERY_EFFECT_TARGETS) {
      expect(t.key).toMatch(/^[a-zA-Z]+$/);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.category.length).toBeGreaterThan(0);
      expect(t.allowedModes).toEqual(['percentPerLevel', 'flatPerLevel']);
      expect(t.minValueByMode).toEqual({ percentPerLevel: 0, flatPerLevel: 0 });
      expect(t.maxValueByMode).toEqual({ percentPerLevel: 5, flatPerLevel: 100 });
      expect(t.runtimeStatus).toBe('implemented');
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it("n'expose aucune stat non branchée (crit/block/stun/vitesses…)", () => {
    for (const forbidden of [
      'criticalChance',
      'blockChance',
      'dodgeChance',
      'attackSpeed',
      'movementSpeed',
    ]) {
      expect(getMasteryEffectTarget(forbidden)).toBeUndefined();
    }
  });

  it('expose les 2 modes avec labels et descriptions', () => {
    expect(MASTERY_EFFECT_MODES.map((m) => m.key)).toEqual([
      'percentPerLevel',
      'flatPerLevel',
    ]);
    for (const m of MASTERY_EFFECT_MODES) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
    }
  });

  it('est LA source de la whitelist sanitize (aucune liste divergente)', () => {
    // MASTERY_MODIFIER_STATS est dérivée des targets — même contenu garanti.
    expect([...MASTERY_MODIFIER_STATS].sort()).toEqual(
      MASTERY_EFFECT_TARGETS.map((t) => t.key).sort(),
    );
    // Toute stat exposée est acceptée par sanitize…
    for (const t of MASTERY_EFFECT_TARGETS) {
      expect(
        sanitizeMasteryEffects({
          modifiers: [{ stat: t.key, mode: 'percentPerLevel', value: 1 }],
        }),
      ).toEqual({ modifiers: [{ stat: t.key, mode: 'percentPerLevel', value: 1 }] });
    }
    // …et une stat absente est refusée.
    expect(() =>
      sanitizeMasteryEffects({
        modifiers: [{ stat: 'criticalChance', mode: 'percentPerLevel', value: 1 }],
      }),
    ).toThrow(MasteryEffectsValidationError);
  });

  it('sanitize applique les bornes par mode du target', () => {
    const t = getMasteryEffectTarget('maxHealth')!;
    expect(() =>
      sanitizeMasteryEffects({
        modifiers: [
          {
            stat: 'maxHealth',
            mode: 'percentPerLevel',
            value: t.maxValueByMode.percentPerLevel + 0.1,
          },
        ],
      }),
    ).toThrow(MasteryEffectsValidationError);
    expect(() =>
      sanitizeMasteryEffects({
        modifiers: [
          { stat: 'maxHealth', mode: 'flatPerLevel', value: t.maxValueByMode.flatPerLevel + 1 },
        ],
      }),
    ).toThrow(MasteryEffectsValidationError);
  });

  it('contexte weaponType : physicalAttack accepté, defense refusée avec message clair', () => {
    expect(CONTEXTUAL_MASTERY_EFFECT_STATS).toEqual(['physicalAttack']);
    expect(
      sanitizeMasteryEffects({
        context: { weaponType: 'two_handed_sword' },
        modifiers: [{ stat: 'physicalAttack', mode: 'percentPerLevel', value: 5 }],
      }),
    ).toEqual({
      context: { weaponType: 'two_handed_sword' },
      modifiers: [{ stat: 'physicalAttack', mode: 'percentPerLevel', value: 5 }],
    });
    expect(() =>
      sanitizeMasteryEffects({
        context: { weaponType: 'two_handed_sword' },
        modifiers: [{ stat: 'defense', mode: 'percentPerLevel', value: 1 }],
      }),
    ).toThrow(/Seule la stat physicalAttack est supportée avec un contexte weaponType/);
  });
});
