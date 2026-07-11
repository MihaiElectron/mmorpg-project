import {
  computeCombatMasteryEffects,
  MasteryEffectsDefinitionLike,
  MasteryEffectsValidationError,
  MAX_PERCENT_PER_LEVEL,
  MAX_TOTAL_COMBAT_DAMAGE_PERCENT,
  sanitizeMasteryEffects,
} from './mastery-effects.calculator';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeDef(
  overrides: Partial<MasteryEffectsDefinitionLike> = {},
): MasteryEffectsDefinitionLike {
  return {
    key: 'dagger',
    enabled: true,
    effects: {
      context: { weaponType: 'dagger' },
      combat: { damagePercentPerLevel: 0.5 },
    },
    ...overrides,
  };
}

// ─── sanitizeMasteryEffects (écriture stricte) ───────────────────────────────

describe('sanitizeMasteryEffects', () => {
  it('retourne {} pour undefined et null', () => {
    expect(sanitizeMasteryEffects(undefined)).toEqual({});
    expect(sanitizeMasteryEffects(null)).toEqual({});
  });

  it('accepte et normalise une structure V1 valide', () => {
    const result = sanitizeMasteryEffects({
      context: { weaponType: 'dagger' },
      combat: { damagePercentPerLevel: 0.5 },
    });
    expect(result).toEqual({
      context: { weaponType: 'dagger' },
      combat: { damagePercentPerLevel: 0.5 },
    });
  });

  it('retire les groupes vides du stockage', () => {
    expect(sanitizeMasteryEffects({ context: {}, combat: {} })).toEqual({});
  });

  it('refuse une valeur non-objet', () => {
    expect(() => sanitizeMasteryEffects('x')).toThrow(MasteryEffectsValidationError);
    expect(() => sanitizeMasteryEffects([1])).toThrow(MasteryEffectsValidationError);
    expect(() => sanitizeMasteryEffects(3)).toThrow(MasteryEffectsValidationError);
  });

  it('refuse un groupe inconnu', () => {
    expect(() => sanitizeMasteryEffects({ crafting: {} })).toThrow(
      MasteryEffectsValidationError,
    );
  });

  it('refuse les effets non whitelistés V1 (stun, knockback, block, craft)', () => {
    for (const key of [
      'stunChancePercentPerLevel',
      'knockbackPowerPercentPerLevel',
      'blockChancePercentPerLevel',
      'successChancePercentPerLevel',
    ]) {
      expect(() =>
        sanitizeMasteryEffects({
          context: { weaponType: 'two_handed_mace' },
          combat: { [key]: 1 },
        }),
      ).toThrow(MasteryEffectsValidationError);
    }
  });

  it('refuse une clé de contexte inconnue', () => {
    expect(() => sanitizeMasteryEffects({ context: { itemCategory: 'sword' } })).toThrow(
      MasteryEffectsValidationError,
    );
  });

  it('refuse un weaponType hors format [a-z0-9_]', () => {
    expect(() => sanitizeMasteryEffects({ context: { weaponType: 'Dagger!' } })).toThrow(
      MasteryEffectsValidationError,
    );
    expect(() => sanitizeMasteryEffects({ context: { weaponType: '' } })).toThrow(
      MasteryEffectsValidationError,
    );
    expect(() => sanitizeMasteryEffects({ context: { weaponType: 42 } })).toThrow(
      MasteryEffectsValidationError,
    );
  });

  it('refuse damagePercentPerLevel non fini (NaN, Infinity, string)', () => {
    for (const bad of [NaN, Infinity, -Infinity, '0.5', {}]) {
      expect(() =>
        sanitizeMasteryEffects({
          context: { weaponType: 'dagger' },
          combat: { damagePercentPerLevel: bad },
        }),
      ).toThrow(MasteryEffectsValidationError);
    }
  });

  it('refuse damagePercentPerLevel négatif ou au-dessus de la borne', () => {
    expect(() =>
      sanitizeMasteryEffects({
        context: { weaponType: 'dagger' },
        combat: { damagePercentPerLevel: -0.1 },
      }),
    ).toThrow(MasteryEffectsValidationError);
    expect(() =>
      sanitizeMasteryEffects({
        context: { weaponType: 'dagger' },
        combat: { damagePercentPerLevel: MAX_PERCENT_PER_LEVEL + 0.1 },
      }),
    ).toThrow(MasteryEffectsValidationError);
  });

  it('accepte les bornes exactes 0 et MAX_PERCENT_PER_LEVEL', () => {
    expect(
      sanitizeMasteryEffects({
        context: { weaponType: 'dagger' },
        combat: { damagePercentPerLevel: 0 },
      }),
    ).toEqual({ context: { weaponType: 'dagger' }, combat: { damagePercentPerLevel: 0 } });
    expect(
      sanitizeMasteryEffects({
        context: { weaponType: 'dagger' },
        combat: { damagePercentPerLevel: MAX_PERCENT_PER_LEVEL },
      }),
    ).toEqual({
      context: { weaponType: 'dagger' },
      combat: { damagePercentPerLevel: MAX_PERCENT_PER_LEVEL },
    });
  });

  it('refuse un effet combat sans context.weaponType (effets V1 contextuels)', () => {
    expect(() =>
      sanitizeMasteryEffects({ combat: { damagePercentPerLevel: 0.5 } }),
    ).toThrow(MasteryEffectsValidationError);
  });

  it('accepte un context seul (sans effet combat)', () => {
    expect(sanitizeMasteryEffects({ context: { weaponType: 'dagger' } })).toEqual({
      context: { weaponType: 'dagger' },
    });
  });
});

// ─── computeCombatMasteryEffects (lecture défensive) ─────────────────────────

describe('computeCombatMasteryEffects', () => {
  it('retourne 0 sans weaponType équipé', () => {
    expect(computeCombatMasteryEffects([makeDef()], { dagger: 10 }, {})).toEqual({
      damagePercent: 0,
    });
    expect(
      computeCombatMasteryEffects([makeDef()], { dagger: 10 }, { weaponType: null }),
    ).toEqual({ damagePercent: 0 });
  });

  it('retourne 0 pour effects vide ou absent', () => {
    expect(
      computeCombatMasteryEffects(
        [makeDef({ effects: {} }), makeDef({ effects: null })],
        { dagger: 10 },
        { weaponType: 'dagger' },
      ),
    ).toEqual({ damagePercent: 0 });
  });

  it('ignore une mastery disabled', () => {
    expect(
      computeCombatMasteryEffects(
        [makeDef({ enabled: false })],
        { dagger: 10 },
        { weaponType: 'dagger' },
      ),
    ).toEqual({ damagePercent: 0 });
  });

  it('retourne 0 au level 1 (jamais pratiquée) et au level absent', () => {
    expect(
      computeCombatMasteryEffects([makeDef()], { dagger: 1 }, { weaponType: 'dagger' }),
    ).toEqual({ damagePercent: 0 });
    expect(
      computeCombatMasteryEffects([makeDef()], {}, { weaponType: 'dagger' }),
    ).toEqual({ damagePercent: 0 });
    expect(
      computeCombatMasteryEffects([makeDef()], null, { weaponType: 'dagger' }),
    ).toEqual({ damagePercent: 0 });
  });

  it('applique (level − 1) × perLevel : level 5 à 0.5 → 2 %', () => {
    expect(
      computeCombatMasteryEffects([makeDef()], { dagger: 5 }, { weaponType: 'dagger' }),
    ).toEqual({ damagePercent: 2 });
  });

  it('retourne 0 si le weaponType équipé ne matche pas le contexte', () => {
    expect(
      computeCombatMasteryEffects([makeDef()], { dagger: 10 }, { weaponType: 'bow' }),
    ).toEqual({ damagePercent: 0 });
  });

  it('somme plusieurs masteries matchant le même contexte', () => {
    const defs = [
      makeDef({ key: 'dagger' }),
      makeDef({
        key: 'light_blades',
        effects: {
          context: { weaponType: 'dagger' },
          combat: { damagePercentPerLevel: 1 },
        },
      }),
    ];
    // dagger: (5−1)×0.5 = 2 ; light_blades: (3−1)×1 = 2 → 4 %.
    expect(
      computeCombatMasteryEffects(
        defs,
        { dagger: 5, light_blades: 3 },
        { weaponType: 'dagger' },
      ),
    ).toEqual({ damagePercent: 4 });
  });

  it('clampe le bonus total à MAX_TOTAL_COMBAT_DAMAGE_PERCENT', () => {
    // level 101 à 5 %/niveau → 500 % bruts → clampés à 50.
    const def = makeDef({
      effects: {
        context: { weaponType: 'dagger' },
        combat: { damagePercentPerLevel: 5 },
      },
    });
    expect(
      computeCombatMasteryEffects([def], { dagger: 101 }, { weaponType: 'dagger' }),
    ).toEqual({ damagePercent: MAX_TOTAL_COMBAT_DAMAGE_PERCENT });
  });

  it('ignore un perLevel corrompu en base (non fini, négatif, 0)', () => {
    for (const bad of [NaN, Infinity, -1, 0, '0.5' as unknown as number]) {
      const def = makeDef({
        effects: {
          context: { weaponType: 'dagger' },
          combat: { damagePercentPerLevel: bad },
        },
      });
      expect(
        computeCombatMasteryEffects([def], { dagger: 10 }, { weaponType: 'dagger' }),
      ).toEqual({ damagePercent: 0 });
    }
  });

  it('clampe à la lecture un perLevel au-dessus de la borne (base corrompue)', () => {
    const def = makeDef({
      effects: {
        context: { weaponType: 'dagger' },
        combat: { damagePercentPerLevel: 100 },
      },
    });
    // perLevel clampé à 5 : (3−1)×5 = 10, pas (3−1)×100.
    expect(
      computeCombatMasteryEffects([def], { dagger: 3 }, { weaponType: 'dagger' }),
    ).toEqual({ damagePercent: 10 });
  });

  it('ignore un level non fini (donnée corrompue)', () => {
    expect(
      computeCombatMasteryEffects(
        [makeDef()],
        { dagger: NaN },
        { weaponType: 'dagger' },
      ),
    ).toEqual({ damagePercent: 0 });
  });
});
