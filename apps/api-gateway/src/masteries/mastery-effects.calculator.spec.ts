import {
  aggregateMasteryStatModifiers,
  computeCombatMasteryEffects,
  MasteryEffectsDefinitionLike,
  MasteryEffectsValidationError,
  MAX_FLAT_PER_LEVEL,
  MAX_PERCENT_PER_LEVEL,
  MAX_TOTAL_FLAT_PER_STAT,
  MAX_TOTAL_PERCENT_PER_STAT,
  sanitizeMasteryEffects,
} from './mastery-effects.calculator';
import { STANDARD_TARGETS } from './mastery-effect-targets.spec';

const T = STANDARD_TARGETS;

// ─── Factories ───────────────────────────────────────────────────────────────

function makeDef(
  overrides: Partial<MasteryEffectsDefinitionLike> = {},
): MasteryEffectsDefinitionLike {
  return {
    key: 'two_handed',
    enabled: true,
    effects: {
      context: { weaponType: 'two_handed_sword' },
      modifiers: [{ stat: 'physicalAttack', mode: 'percentPerLevel', value: 5 }],
    },
    ...overrides,
  };
}

// ─── sanitizeMasteryEffects (écriture stricte) ───────────────────────────────

describe('sanitizeMasteryEffects (V2)', () => {
  it('retourne {} pour undefined et null', () => {
    expect(sanitizeMasteryEffects(undefined, T)).toEqual({});
    expect(sanitizeMasteryEffects(null, T)).toEqual({});
  });

  it('accepte et normalise une structure modifiers valide', () => {
    const result = sanitizeMasteryEffects({
      modifiers: [
        { stat: 'maxHealth', mode: 'percentPerLevel', value: 1 },
        { stat: 'healthRegen', mode: 'flatPerLevel', value: 0.5 },
      ],
    }, T);
    expect(result).toEqual({
      modifiers: [
        { stat: 'maxHealth', mode: 'percentPerLevel', value: 1 },
        { stat: 'healthRegen', mode: 'flatPerLevel', value: 0.5 },
      ],
    });
  });

  it('accepte un effet contextuel physicalAttack', () => {
    const result = sanitizeMasteryEffects({
      context: { weaponType: 'two_handed_sword' },
      modifiers: [{ stat: 'physicalAttack', mode: 'percentPerLevel', value: 5 }],
    }, T);
    expect(result).toEqual({
      context: { weaponType: 'two_handed_sword' },
      modifiers: [{ stat: 'physicalAttack', mode: 'percentPerLevel', value: 5 }],
    });
  });

  it('convertit le legacy combat.damagePercentPerLevel en modifier (écriture nouveau format)', () => {
    const result = sanitizeMasteryEffects({
      context: { weaponType: 'two_handed_sword' },
      combat: { damagePercentPerLevel: 5 },
    }, T);
    expect(result).toEqual({
      context: { weaponType: 'two_handed_sword' },
      modifiers: [{ stat: 'physicalAttack', mode: 'percentPerLevel', value: 5 }],
    });
    expect(result).not.toHaveProperty('combat');
  });

  it('refuse une valeur non-objet et un groupe inconnu', () => {
    expect(() => sanitizeMasteryEffects('x', T)).toThrow(MasteryEffectsValidationError);
    expect(() => sanitizeMasteryEffects([1], T)).toThrow(MasteryEffectsValidationError);
    expect(() => sanitizeMasteryEffects({ crafting: {} }, T)).toThrow(
      MasteryEffectsValidationError,
    );
  });

  it('refuse une stat hors whitelist (crit, stun, block…)', () => {
    for (const stat of ['criticalChance', 'stunChance', 'blockChance', 'movementSpeed']) {
      expect(() =>
        sanitizeMasteryEffects({
          modifiers: [{ stat, mode: 'percentPerLevel', value: 1 }],
        }, T),
      ).toThrow(MasteryEffectsValidationError);
    }
  });

  it('refuse un mode inconnu', () => {
    expect(() =>
      sanitizeMasteryEffects({
        modifiers: [{ stat: 'maxHealth', mode: 'percentTotal', value: 1 }],
      }, T),
    ).toThrow(MasteryEffectsValidationError);
  });

  it('refuse value non finie, négative ou hors borne', () => {
    for (const value of [NaN, Infinity, -1, '5', {}]) {
      expect(() =>
        sanitizeMasteryEffects({
          modifiers: [{ stat: 'maxHealth', mode: 'percentPerLevel', value }],
        }, T),
      ).toThrow(MasteryEffectsValidationError);
    }
    expect(() =>
      sanitizeMasteryEffects({
        modifiers: [
          { stat: 'maxHealth', mode: 'percentPerLevel', value: MAX_PERCENT_PER_LEVEL + 0.1 },
        ],
      }, T),
    ).toThrow(MasteryEffectsValidationError);
    expect(() =>
      sanitizeMasteryEffects({
        modifiers: [
          { stat: 'maxHealth', mode: 'flatPerLevel', value: MAX_FLAT_PER_LEVEL + 1 },
        ],
      }, T),
    ).toThrow(MasteryEffectsValidationError);
  });

  it('refuse une clé inconnue dans une entrée modifier', () => {
    expect(() =>
      sanitizeMasteryEffects({
        modifiers: [{ stat: 'maxHealth', mode: 'percentPerLevel', value: 1, bonus: 2 }],
      }, T),
    ).toThrow(MasteryEffectsValidationError);
  });

  it('refuse les doublons (stat, mode)', () => {
    expect(() =>
      sanitizeMasteryEffects({
        modifiers: [
          { stat: 'maxHealth', mode: 'percentPerLevel', value: 1 },
          { stat: 'maxHealth', mode: 'percentPerLevel', value: 2 },
        ],
      }, T),
    ).toThrow(MasteryEffectsValidationError);
  });

  it("contexte d'arme → seules les stats contextualisables (physicalAttack)", () => {
    expect(() =>
      sanitizeMasteryEffects({
        context: { weaponType: 'two_handed_sword' },
        modifiers: [{ stat: 'maxHealth', mode: 'percentPerLevel', value: 1 }],
      }, T),
    ).toThrow(MasteryEffectsValidationError);
  });

  it('refuse un weaponType hors format', () => {
    expect(() => sanitizeMasteryEffects({ context: { weaponType: 'Épée!' } }, T)).toThrow(
      MasteryEffectsValidationError,
    );
  });

  it('retire un tableau modifiers vide du stockage', () => {
    expect(sanitizeMasteryEffects({ modifiers: [] }, T)).toEqual({});
  });

  it("préséance V2 à l'écriture : modifiers[] gagne, le legacy est ignoré (jamais fusionné)", () => {
    const result = sanitizeMasteryEffects({
      context: { weaponType: 'two_handed_sword' },
      modifiers: [{ stat: 'physicalAttack', mode: 'percentPerLevel', value: 2 }],
      combat: { damagePercentPerLevel: 5 },
    }, T);
    expect(result).toEqual({
      context: { weaponType: 'two_handed_sword' },
      modifiers: [{ stat: 'physicalAttack', mode: 'percentPerLevel', value: 2 }],
    });
    expect(result).not.toHaveProperty('combat');
  });
});

// ─── computeCombatMasteryEffects (contextuel, défensif) ──────────────────────

describe('computeCombatMasteryEffects (V2)', () => {
  it('retourne 0 sans weaponType équipé, effects vide ou mastery disabled', () => {
    expect(computeCombatMasteryEffects([makeDef()], { two_handed: 10 }, {}, T)).toEqual({
      damagePercent: 0,
      damageFlat: 0,
    });
    expect(
      computeCombatMasteryEffects(
        [makeDef({ effects: {} })],
        { two_handed: 10 },
        { weaponType: 'two_handed_sword' }, T),
    ).toEqual({ damagePercent: 0, damageFlat: 0 });
    expect(
      computeCombatMasteryEffects(
        [makeDef({ enabled: false })],
        { two_handed: 10 },
        { weaponType: 'two_handed_sword' }, T),
    ).toEqual({ damagePercent: 0, damageFlat: 0 });
  });

  it('level 0 = 0 ; level 1 × 5 %/niveau = +5 % ; level 3 = +15 %', () => {
    expect(
      computeCombatMasteryEffects([makeDef()], { two_handed: 0 }, { weaponType: 'two_handed_sword' }, T),
    ).toEqual({ damagePercent: 0, damageFlat: 0 });
    expect(
      computeCombatMasteryEffects([makeDef()], { two_handed: 1 }, { weaponType: 'two_handed_sword' }, T),
    ).toEqual({ damagePercent: 5, damageFlat: 0 });
    expect(
      computeCombatMasteryEffects([makeDef()], { two_handed: 3 }, { weaponType: 'two_handed_sword' }, T),
    ).toEqual({ damagePercent: 15, damageFlat: 0 });
  });

  it('mismatch weaponType → 0', () => {
    expect(
      computeCombatMasteryEffects([makeDef()], { two_handed: 10 }, { weaponType: 'bow' }, T),
    ).toEqual({ damagePercent: 0, damageFlat: 0 });
  });

  it('lit le legacy combat.damagePercentPerLevel comme physicalAttack percent (lecture défensive)', () => {
    const legacyDef = makeDef({
      effects: {
        context: { weaponType: 'two_handed_sword' },
        combat: { damagePercentPerLevel: 5 },
      },
    });
    expect(
      computeCombatMasteryEffects([legacyDef], { two_handed: 3 }, { weaponType: 'two_handed_sword' }, T),
    ).toEqual({ damagePercent: 15, damageFlat: 0 });
  });

  it('préséance V2 à la lecture : si modifiers[] existe, le legacy est ignoré (pas de cumul)', () => {
    const mixedDef = makeDef({
      effects: {
        context: { weaponType: 'two_handed_sword' },
        modifiers: [{ stat: 'physicalAttack', mode: 'percentPerLevel', value: 2 }],
        combat: { damagePercentPerLevel: 5 },
      },
    });
    // 3 × 2 = 6 % — jamais 3 × (2 + 5) = 21 %.
    expect(
      computeCombatMasteryEffects([mixedDef], { two_handed: 3 }, { weaponType: 'two_handed_sword' }, T),
    ).toEqual({ damagePercent: 6, damageFlat: 0 });
  });

  it('somme percent + flat et clampe les totaux', () => {
    const def = makeDef({
      effects: {
        context: { weaponType: 'two_handed_sword' },
        modifiers: [
          { stat: 'physicalAttack', mode: 'percentPerLevel', value: 5 },
          { stat: 'physicalAttack', mode: 'flatPerLevel', value: 100 },
        ],
      },
    });
    // level 100 → 500 % bruts → 50 ; 10 000 flat bruts → 1 000.
    expect(
      computeCombatMasteryEffects([def], { two_handed: 100 }, { weaponType: 'two_handed_sword' }, T),
    ).toEqual({
      damagePercent: MAX_TOTAL_PERCENT_PER_STAT,
      damageFlat: MAX_TOTAL_FLAT_PER_STAT,
    });
  });

  it('ignore les stats non contextualisables et les valeurs corrompues', () => {
    const def = makeDef({
      effects: {
        context: { weaponType: 'two_handed_sword' },
        modifiers: [
          { stat: 'maxHealth', mode: 'percentPerLevel', value: 5 }, // hors combat
          { stat: 'physicalAttack', mode: 'percentPerLevel', value: NaN as unknown as number },
        ],
      },
    });
    expect(
      computeCombatMasteryEffects([def], { two_handed: 5 }, { weaponType: 'two_handed_sword' }, T),
    ).toEqual({ damagePercent: 0, damageFlat: 0 });
  });
});

// ─── aggregateMasteryStatModifiers (permanent, défensif) ─────────────────────

describe('aggregateMasteryStatModifiers (V2)', () => {
  it('effects {} / disabled / level 0 → agrégat vide', () => {
    const defs = [
      makeDef({ key: 'a', effects: {} }),
      makeDef({
        key: 'b',
        enabled: false,
        effects: { modifiers: [{ stat: 'maxHealth', mode: 'percentPerLevel', value: 5 }] },
      }),
      makeDef({
        key: 'c',
        effects: { modifiers: [{ stat: 'maxHealth', mode: 'percentPerLevel', value: 5 }] },
      }),
    ];
    expect(aggregateMasteryStatModifiers(defs, { c: 0 }, T)).toEqual({ percent: {}, flat: {} });
  });

  it('agrège percent et flat par stat : level 3 × (5 % + 2 flat) = 15 % + 6', () => {
    const defs = [
      makeDef({
        key: 'vitality_training',
        effects: {
          modifiers: [
            { stat: 'maxHealth', mode: 'percentPerLevel', value: 5 },
            { stat: 'healthRegen', mode: 'flatPerLevel', value: 2 },
          ],
        },
      }),
    ];
    expect(aggregateMasteryStatModifiers(defs, { vitality_training: 3 }, T)).toEqual({
      percent: { maxHealth: 15 },
      flat: { healthRegen: 6 },
    });
  });

  it('somme plusieurs maîtrises sur la même stat et clampe les totaux', () => {
    const defs = [
      makeDef({
        key: 'a',
        effects: { modifiers: [{ stat: 'defense', mode: 'percentPerLevel', value: 5 }] },
      }),
      makeDef({
        key: 'b',
        effects: { modifiers: [{ stat: 'defense', mode: 'percentPerLevel', value: 5 }] },
      }),
    ];
    // 10×5 + 10×5 = 100 → clamp 50.
    expect(aggregateMasteryStatModifiers(defs, { a: 10, b: 10 }, T)).toEqual({
      percent: { defense: MAX_TOTAL_PERCENT_PER_STAT },
      flat: {},
    });
  });

  it('EXCLUT les effets contextuels (réservés aux hooks combat)', () => {
    const defs = [makeDef()]; // contexte two_handed_sword
    expect(aggregateMasteryStatModifiers(defs, { two_handed: 10 }, T)).toEqual({
      percent: {},
      flat: {},
    });
  });

  it('ignore les entrées corrompues en base (stat inconnue, value invalide)', () => {
    const defs = [
      makeDef({
        key: 'corrupt',
        effects: {
          modifiers: [
            { stat: 'stunChance', mode: 'percentPerLevel', value: 5 },
            { stat: 'maxHealth', mode: 'percentPerLevel', value: Infinity as unknown as number },
            { stat: 'maxMana', mode: 'percentPerLevel', value: 2 },
          ],
        },
      }),
    ];
    // level 3 × 2 = 6 (les deux entrées corrompues sont ignorées).
    expect(aggregateMasteryStatModifiers(defs, { corrupt: 3 }, T)).toEqual({
      percent: { maxMana: 6 },
      flat: {},
    });
  });
});
