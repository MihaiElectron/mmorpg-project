// apps/api-gateway/src/player-runtime/runtime-compute.spec.ts

import { RuntimeComputeEngine } from './runtime-compute';
import {
  RuntimeModifier,
  StatKey,
  StatContributionFilter,
  StatResolutionError,
  StatResolutionErrorCode,
} from './player-runtime.types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface SimpleStats {
  maxHp: number;
  attackPower: number;
  defenseTotal: number;
}

const SIMPLE_KEYS: StatKey[] = ['maxHp', 'attackPower', 'defenseTotal'];

function makeExtractor(base: SimpleStats) {
  return (stat: StatKey): number => {
    if (stat === 'maxHp') return base.maxHp;
    if (stat === 'attackPower') return base.attackPower;
    if (stat === 'defenseTotal') return base.defenseTotal;
    return 0;
  };
}

function makeModifier(overrides: Partial<RuntimeModifier> = {}): RuntimeModifier {
  return {
    id: 'mod-1',
    sourceType: 'debug',
    sourceId: 'debug-registry',
    sourceLabel: 'Test',
    targetStat: 'maxHp',
    operation: 'flat',
    value: 10,
    priority: 10,
    enabled: true,
    ...overrides,
  };
}

// ─── RuntimeComputeEngine.computeWithTrace ────────────────────────────────────

describe('RuntimeComputeEngine.computeWithTrace', () => {
  describe('sans modifiers', () => {
    it('retourne les valeurs de base pour chaque stat', () => {
      const { derived } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 100, attackPower: 15, defenseTotal: 10 }),
      );

      expect(derived.maxHp).toBe(100);
      expect(derived.attackPower).toBe(15);
      expect(derived.defenseTotal).toBe(10);
    });

    it('modifierCount vaut 0', () => {
      const { trace } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 100, attackPower: 15, defenseTotal: 10 }),
      );

      expect(trace.modifierCount).toBe(0);
    });

    it('trace.stats contient une entrée par stat avec applications vides', () => {
      const { trace } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 100, attackPower: 0, defenseTotal: 0 }),
      );

      expect(trace.stats.maxHp?.baseValue).toBe(100);
      expect(trace.stats.maxHp?.finalValue).toBe(100);
      expect(trace.stats.maxHp?.modifiers).toHaveLength(0);
    });

    it('computedAt est une Date', () => {
      const { trace } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 100, attackPower: 0, defenseTotal: 0 }),
      );

      expect(trace.computedAt).toBeInstanceOf(Date);
    });
  });

  describe('flat modifiers', () => {
    it('applique un flat modifier sur maxHp', () => {
      const { derived } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 100, attackPower: 0, defenseTotal: 0 }),
        [makeModifier({ targetStat: 'maxHp', operation: 'flat', value: 20 })],
      );

      expect(derived.maxHp).toBe(120);
    });

    it("n'applique pas un modifier disabled", () => {
      const { derived } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 100, attackPower: 0, defenseTotal: 0 }),
        [makeModifier({ targetStat: 'maxHp', operation: 'flat', value: 99, enabled: false })],
      );

      expect(derived.maxHp).toBe(100);
    });

    it('somme plusieurs flat modifiers', () => {
      const { derived } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 100, attackPower: 0, defenseTotal: 0 }),
        [
          makeModifier({ id: 'm1', targetStat: 'maxHp', operation: 'flat', value: 20 }),
          makeModifier({ id: 'm2', targetStat: 'maxHp', operation: 'flat', value: 30 }),
        ],
      );

      expect(derived.maxHp).toBe(150);
    });

    it('trace reflète contribution flat exacte', () => {
      const { trace } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 100, attackPower: 0, defenseTotal: 0 }),
        [makeModifier({ id: 'mod-x', targetStat: 'maxHp', operation: 'flat', value: 25 })],
      );

      const app = trace.stats.maxHp?.modifiers[0];
      expect(app?.modifierId).toBe('mod-x');
      expect(app?.contribution).toBe(25);
      expect(trace.stats.maxHp?.finalValue).toBe(125);
    });

    it('modifierCount = nombre de modifiers enabled (même sans effet sur une stat)', () => {
      const { trace } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 100, attackPower: 0, defenseTotal: 0 }),
        [
          makeModifier({ id: 'm1', targetStat: 'maxHp', operation: 'flat', value: 10 }),
          makeModifier({ id: 'm2', targetStat: 'attackPower', operation: 'flat', value: 5 }),
          makeModifier({ id: 'm3', targetStat: 'maxHp', operation: 'flat', value: 1, enabled: false }),
        ],
      );

      expect(trace.modifierCount).toBe(2);
    });
  });

  describe('percent_add modifiers', () => {
    it('applique un percent_add sur maxHp', () => {
      const { derived } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 100, attackPower: 0, defenseTotal: 0 }),
        [makeModifier({ targetStat: 'maxHp', operation: 'percent_add', value: 20 })],
      );

      expect(derived.maxHp).toBe(120);
    });

    it('somme deux percent_add avant application', () => {
      const { derived } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 100, attackPower: 0, defenseTotal: 0 }),
        [
          makeModifier({ id: 'm1', targetStat: 'maxHp', operation: 'percent_add', value: 10 }),
          makeModifier({ id: 'm2', targetStat: 'maxHp', operation: 'percent_add', value: 10 }),
        ],
      );

      expect(derived.maxHp).toBe(120);
    });

    it('contribution percent_add calculée sur base + flats', () => {
      const { trace } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 100, attackPower: 0, defenseTotal: 0 }),
        [
          makeModifier({ id: 'm1', targetStat: 'maxHp', operation: 'flat', value: 20, priority: 1 }),
          makeModifier({ id: 'm2', targetStat: 'maxHp', operation: 'percent_add', value: 10, priority: 2 }),
        ],
      );

      // base 100 + flat 20 = 120 ; 10% de 120 = 12
      const pctApp = trace.stats.maxHp?.modifiers.find((a) => a.operation === 'percent_add');
      expect(pctApp?.contribution).toBe(12);
      expect(trace.stats.maxHp?.finalValue).toBe(132);
    });
  });

  describe('percent_multiply modifiers', () => {
    it('applique un percent_multiply sur defenseTotal', () => {
      const { derived } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 0, attackPower: 0, defenseTotal: 100 }),
        [makeModifier({ targetStat: 'defenseTotal', operation: 'percent_multiply', value: 50 })],
      );

      expect(derived.defenseTotal).toBe(150);
    });

    it('deux percent_multiply séquentiels', () => {
      const { derived } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 0, attackPower: 0, defenseTotal: 100 }),
        [
          makeModifier({ id: 'm1', targetStat: 'defenseTotal', operation: 'percent_multiply', value: 50, priority: 1 }),
          makeModifier({ id: 'm2', targetStat: 'defenseTotal', operation: 'percent_multiply', value: 50, priority: 2 }),
        ],
      );

      expect(derived.defenseTotal).toBe(225);
    });
  });

  describe('pipeline complet', () => {
    it("applique flat → percent_add → percent_multiply dans l'ordre", () => {
      // base 100 → +20 flat = 120 → +10% = 132 → ×20% = 158
      const { derived } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 100, attackPower: 0, defenseTotal: 0 }),
        [
          makeModifier({ id: 'm1', targetStat: 'maxHp', operation: 'flat', value: 20 }),
          makeModifier({ id: 'm2', targetStat: 'maxHp', operation: 'percent_add', value: 10 }),
          makeModifier({ id: 'm3', targetStat: 'maxHp', operation: 'percent_multiply', value: 20 }),
        ],
      );

      expect(derived.maxHp).toBe(158);
    });

    it('chaque stat est calculée indépendamment', () => {
      const { derived } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 100, attackPower: 10, defenseTotal: 5 }),
        [
          makeModifier({ id: 'm1', targetStat: 'maxHp', operation: 'flat', value: 50 }),
          makeModifier({ id: 'm2', targetStat: 'attackPower', operation: 'flat', value: 5 }),
        ],
      );

      expect(derived.maxHp).toBe(150);
      expect(derived.attackPower).toBe(15);
      expect(derived.defenseTotal).toBe(5);
    });
  });

  describe('subset de stats (scénario créature)', () => {
    interface CreatureStats { maxHp: number; attackPower: number }
    const CREATURE_KEYS: StatKey[] = ['maxHp', 'attackPower'];

    it('calcule uniquement les stats demandées', () => {
      const { derived, trace } = RuntimeComputeEngine.computeWithTrace<CreatureStats>(
        CREATURE_KEYS,
        (stat) => (stat === 'maxHp' ? 200 : stat === 'attackPower' ? 30 : 0),
        [makeModifier({ targetStat: 'maxHp', operation: 'flat', value: 50 })],
      );

      expect(derived.maxHp).toBe(250);
      expect(derived.attackPower).toBe(30);
      expect(trace.stats.defenseTotal).toBeUndefined();
    });
  });
});

// ─── RuntimeComputeEngine.compute ─────────────────────────────────────────────

describe('RuntimeComputeEngine.compute', () => {
  it('produit le même résultat numérique que computeWithTrace', () => {
    const mods = [
      makeModifier({ id: 'm1', targetStat: 'maxHp', operation: 'flat', value: 20 }),
      makeModifier({ id: 'm2', targetStat: 'maxHp', operation: 'percent_add', value: 10 }),
      makeModifier({ id: 'm3', targetStat: 'maxHp', operation: 'percent_multiply', value: 20 }),
      makeModifier({ id: 'm4', targetStat: 'attackPower', operation: 'flat', value: 5 }),
    ];
    const extractor = makeExtractor({ maxHp: 100, attackPower: 15, defenseTotal: 10 });

    const { derived: withTrace } = RuntimeComputeEngine.computeWithTrace<SimpleStats>(SIMPLE_KEYS, extractor, mods);
    const withoutTrace = RuntimeComputeEngine.compute<SimpleStats>(SIMPLE_KEYS, extractor, mods);

    expect(withoutTrace.maxHp).toBe(withTrace.maxHp);
    expect(withoutTrace.attackPower).toBe(withTrace.attackPower);
    expect(withoutTrace.defenseTotal).toBe(withTrace.defenseTotal);
  });

  it('sans modifiers retourne les valeurs de base', () => {
    const result = RuntimeComputeEngine.compute<SimpleStats>(
      SIMPLE_KEYS,
      makeExtractor({ maxHp: 80, attackPower: 12, defenseTotal: 8 }),
    );

    expect(result.maxHp).toBe(80);
    expect(result.attackPower).toBe(12);
    expect(result.defenseTotal).toBe(8);
  });

  it("n'applique pas un modifier disabled", () => {
    const result = RuntimeComputeEngine.compute<SimpleStats>(
      SIMPLE_KEYS,
      makeExtractor({ maxHp: 100, attackPower: 0, defenseTotal: 0 }),
      [makeModifier({ targetStat: 'maxHp', operation: 'flat', value: 999, enabled: false })],
    );

    expect(result.maxHp).toBe(100);
  });
});

// ─── RuntimeComputeEngine.resolveStat (Lot 1 — ADR-0021) ──────────────────────

describe('RuntimeComputeEngine.resolveStat (Lot 1)', () => {
  /** Contribution par défaut (surcharge ciblée). */
  function contrib(overrides: Partial<RuntimeModifier> = {}): RuntimeModifier {
    return {
      id: 'c1',
      sourceType: 'debug',
      sourceId: 'src',
      sourceLabel: 'Test',
      targetStat: 'maxHp',
      operation: 'flat',
      value: 0,
      priority: 10,
      enabled: true,
      ...overrides,
    };
  }

  function resolve(input: {
    baseValue?: number;
    contributions?: RuntimeModifier[];
    filters?: StatContributionFilter[];
    caps?: { min?: number; max?: number };
    rounding?: 'none' | 'floor' | 'round' | 'ceil';
  }) {
    return RuntimeComputeEngine.resolveStat({
      stat: 'maxHp',
      baseValue: input.baseValue ?? 100,
      contributions: input.contributions ?? [],
      filters: input.filters,
      caps: input.caps,
      rounding: input.rounding,
    });
  }

  function expectError(fn: () => unknown, code: StatResolutionErrorCode) {
    expect(fn).toThrow(StatResolutionError);
    try {
      fn();
    } catch (e) {
      expect((e as StatResolutionError).code).toBe(code);
    }
  }

  // ── Compatibilité ───────────────────────────────────────────────────────────
  describe('compatibilité', () => {
    it('1. calcul historique sans nouvelles options (base + flat, rounding none)', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ operation: 'flat', value: 20 })],
      });
      expect(r.finalValue).toBe(120);
      expect(r.overrideApplied).toBeNull();
      expect(r.roundingPolicy).toBe('none');
      expect(r.filtered).toHaveLength(0);
    });

    it('2. reproduit le pipeline historique flat→percent_add→percent_multiply (rounding round)', () => {
      const r = resolve({
        baseValue: 100,
        rounding: 'round',
        contributions: [
          contrib({ id: 'm1', operation: 'flat', value: 20 }),
          contrib({ id: 'm2', operation: 'percent_add', value: 10 }),
          contrib({ id: 'm3', operation: 'percent_multiply', value: 20 }),
        ],
      });
      // 100 +20 = 120 ; ×1.10 = 132 ; ×1.20 = 158.4 → round → 158 (ancien moteur)
      expect(r.afterPercentMultiply).toBeCloseTo(158.4, 6);
      expect(r.finalValue).toBe(158);
    });

    it('3. compute/computeWithTrace historiques restent inchangés (arrondi entier)', () => {
      const mods = [
        makeModifier({ targetStat: 'maxHp', operation: 'percent_multiply', value: 20 }),
      ];
      const legacy = RuntimeComputeEngine.compute<SimpleStats>(
        SIMPLE_KEYS,
        makeExtractor({ maxHp: 132, attackPower: 0, defenseTotal: 0 }),
        mods,
      );
      expect(legacy.maxHp).toBe(158); // 132 × 1.2 = 158.4 → round 158 (legacy)
      const r = resolve({
        baseValue: 132,
        contributions: [contrib({ operation: 'percent_multiply', value: 20 })],
      });
      expect(r.finalValue).toBeCloseTo(158.4, 6); // resolveStat défaut none : pas d'arrondi
    });
  });

  // ── Flat ────────────────────────────────────────────────────────────────────
  describe('flat', () => {
    it('4. bonus plat', () => {
      expect(
        resolve({ baseValue: 100, contributions: [contrib({ value: 20 })] }).finalValue,
      ).toBe(120);
    });
    it('5. malus plat', () => {
      expect(
        resolve({ baseValue: 100, contributions: [contrib({ value: -30 })] }).finalValue,
      ).toBe(70);
    });
    it('6. cumul positif/négatif', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ id: 'a', value: 20 }), contrib({ id: 'b', value: -5 })],
      });
      expect(r.finalValue).toBe(115);
    });
  });

  // ── Percent additif ───────────────────────────────────────────────────────────
  describe('percent_add', () => {
    it('7. plusieurs pourcentages additionnés', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [
          contrib({ id: 'a', operation: 'percent_add', value: 20 }),
          contrib({ id: 'b', operation: 'percent_add', value: 10 }),
        ],
      });
      expect(r.finalValue).toBeCloseTo(130, 6); // ×1.30
    });
    it('8. bonus et malus combinés (+20% -10% = +10%)', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [
          contrib({ id: 'a', operation: 'percent_add', value: 20 }),
          contrib({ id: 'b', operation: 'percent_add', value: -10 }),
        ],
      });
      expect(r.finalValue).toBeCloseTo(110, 6);
    });
    it("9. pas d'application séquentielle erronée (110, jamais 108)", () => {
      const r = resolve({
        baseValue: 100,
        contributions: [
          contrib({ id: 'a', operation: 'percent_add', value: 20 }),
          contrib({ id: 'b', operation: 'percent_add', value: -10 }),
        ],
      });
      expect(r.finalValue).toBeCloseTo(110, 6);
      // Application séquentielle erronée donnerait 100×1.2×0.9 = 108.
      expect(Math.round(r.finalValue)).not.toBe(108);
    });
  });

  // ── Multiplicateurs ─────────────────────────────────────────────────────────
  describe('percent_multiply', () => {
    it('10. plusieurs multiplicateurs (×1.2 × 0.5)', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [
          contrib({ id: 'a', operation: 'percent_multiply', value: 20 }),
          contrib({ id: 'b', operation: 'percent_multiply', value: -50 }),
        ],
      });
      expect(r.finalValue).toBeCloseTo(60, 6); // 100 ×1.2 ×0.5
    });
    it('11. multiplicateur inférieur à 1 (×0.8)', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ operation: 'percent_multiply', value: -20 })],
      });
      expect(r.finalValue).toBeCloseTo(80, 6);
    });
    it('12. réduction partielle d\'un multiplicateur positif (×1.2 → ×1.1)', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [
          contrib({ id: 'm', operation: 'percent_multiply', value: 20, tags: ['t'] }),
        ],
        filters: [{ match: { tag: 't' }, scale: 0.5 }],
      });
      expect(r.finalValue).toBeCloseTo(110, 6);
      const app = r.applied.find((a) => a.modifierId === 'm');
      expect(app?.effectiveValue).toBeCloseTo(10, 6);
      expect(app?.scale).toBeCloseTo(0.5, 6);
    });
    it('13. réduction partielle d\'un multiplicateur négatif (×0.8 → ×0.9)', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [
          contrib({ id: 'm', operation: 'percent_multiply', value: -20, tags: ['t'] }),
        ],
        filters: [{ match: { tag: 't' }, scale: 0.5 }],
      });
      expect(r.finalValue).toBeCloseTo(90, 6); // effectiveValue -10 → ×0.9
    });
  });

  // ── Filtres ───────────────────────────────────────────────────────────────────
  describe('filtres', () => {
    it('14. filtre par sourceType (exclusion)', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ id: 'e', sourceType: 'equipment', value: 50 })],
        filters: [{ match: { sourceType: 'equipment' }, scale: 0 }],
      });
      expect(r.finalValue).toBe(100);
      expect(r.filtered).toHaveLength(1);
      expect(r.filtered[0].excluded).toBe(true);
    });
    it('15. filtre par sourceId', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ id: 'x', sourceId: 'sword-1', value: 50 })],
        filters: [{ match: { sourceId: 'sword-1' }, scale: 0 }],
      });
      expect(r.finalValue).toBe(100);
    });
    it('16. filtre par tag', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ value: 50, tags: ['vitality'] })],
        filters: [{ match: { tag: 'vitality' }, scale: 0 }],
      });
      expect(r.finalValue).toBe(100);
    });
    it('17. supprime uniquement les contributions positives', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ id: 'p', value: 30 }), contrib({ id: 'n', value: -10 })],
        filters: [{ match: { sign: 'positive' }, scale: 0 }],
      });
      expect(r.finalValue).toBe(90); // +30 exclu, -10 conservé
    });
    it('18. supprime uniquement les contributions négatives', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ id: 'p', value: 30 }), contrib({ id: 'n', value: -10 })],
        filters: [{ match: { sign: 'negative' }, scale: 0 }],
      });
      expect(r.finalValue).toBe(130); // -10 exclu, +30 conservé
    });
    it('19. réduction partielle d\'un flat (+20 → +10)', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ id: 'm', value: 20, tags: ['v'] })],
        filters: [{ match: { tag: 'v' }, scale: 0.5 }],
      });
      expect(r.finalValue).toBe(110);
      expect(r.filtered[0].excluded).toBe(false);
      expect(r.filtered[0].scale).toBeCloseTo(0.5, 6);
    });
    it('20. plusieurs filtres combinés (scales multipliés)', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [
          contrib({ id: 'm', sourceType: 'equipment', value: 40, tags: ['a'] }),
        ],
        filters: [
          { match: { tag: 'a' }, scale: 0.5 },
          { match: { sourceType: 'equipment' }, scale: 0.5 },
        ],
      });
      // scale combiné 0.25 → 40 → 10 → 110
      expect(r.finalValue).toBe(110);
      expect(r.applied.find((a) => a.modifierId === 'm')?.scale).toBeCloseTo(0.25, 6);
    });
    it('21. trace des contributions filtrées + raison', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ id: 'e', sourceType: 'equipment', value: 50 })],
        filters: [{ match: { sourceType: 'equipment' }, scale: 0, reason: 'anti-magie' }],
      });
      expect(r.filtered[0].modifierId).toBe('e');
      expect(r.filtered[0].reasons).toContain('anti-magie');
    });
  });

  // ── Override ──────────────────────────────────────────────────────────────────
  describe('override', () => {
    it('22. override unique', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ id: 'o', operation: 'override', value: 1 })],
      });
      expect(r.finalValue).toBe(1);
      expect(r.overrideApplied?.value).toBe(1);
      expect(r.overrideApplied?.modifierId).toBe('o');
    });
    it('23. override de priorité supérieure gagne', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [
          contrib({ id: 'lo', operation: 'override', value: 1, priority: 5 }),
          contrib({ id: 'hi', operation: 'override', value: 100, priority: 10 }),
        ],
      });
      expect(r.finalValue).toBe(100);
      expect(r.overrideApplied?.modifierId).toBe('hi');
    });
    it("24. résultat indépendant de l'ordre d'entrée", () => {
      const a = contrib({ id: 'lo', operation: 'override', value: 1, priority: 5 });
      const b = contrib({ id: 'hi', operation: 'override', value: 100, priority: 10 });
      const r1 = resolve({ baseValue: 100, contributions: [a, b] });
      const r2 = resolve({ baseValue: 100, contributions: [b, a] });
      expect(r1.finalValue).toBe(r2.finalValue);
      expect(r1.finalValue).toBe(100);
    });
    it('25. deux overrides de même priorité rejetés', () => {
      expectError(
        () =>
          resolve({
            baseValue: 100,
            contributions: [
              contrib({ id: 'o1', operation: 'override', value: 1, priority: 10 }),
              contrib({ id: 'o2', operation: 'override', value: 2, priority: 10 }),
            ],
          }),
        'DUPLICATE_OVERRIDE_PRIORITY',
      );
    });
    it('26. override puis caps (caps toujours appliqués après override)', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ id: 'o', operation: 'override', value: 1000 })],
        caps: { max: 100 },
      });
      expect(r.afterOverride).toBe(1000);
      expect(r.finalValue).toBe(100);
    });
    it("27. trace de l'override retenu (priorité)", () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ id: 'o', operation: 'override', value: 5, priority: 42 })],
      });
      expect(r.overrideApplied).toEqual({ modifierId: 'o', priority: 42, value: 5 });
    });
  });

  // ── Caps ──────────────────────────────────────────────────────────────────────
  describe('caps', () => {
    it('28. cap minimum', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ value: -80 })],
        caps: { min: 50 },
      });
      expect(r.beforeCaps).toBe(20);
      expect(r.finalValue).toBe(50);
    });
    it('29. cap maximum', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ value: 80 })],
        caps: { max: 150 },
      });
      expect(r.finalValue).toBe(150);
    });
    it('30. caps après override', () => {
      const r = resolve({
        baseValue: 100,
        contributions: [contrib({ id: 'o', operation: 'override', value: 1 })],
        caps: { min: 10 },
      });
      expect(r.finalValue).toBe(10);
    });
    it('31. min > max rejeté', () => {
      expectError(
        () => resolve({ baseValue: 100, caps: { min: 100, max: 50 } }),
        'INVALID_CAPS',
      );
    });
    it('32. caps absents sans effet', () => {
      const r = resolve({ baseValue: 100, contributions: [contrib({ value: 20 })] });
      expect(r.finalValue).toBe(120);
      expect(r.caps).toEqual({ min: null, max: null });
    });
  });

  // ── Arrondi ───────────────────────────────────────────────────────────────────
  describe('arrondi', () => {
    it('33. none conserve les décimales', () => {
      expect(resolve({ baseValue: 100.4, rounding: 'none' }).finalValue).toBeCloseTo(
        100.4,
        6,
      );
    });
    it('34. floor', () => {
      expect(resolve({ baseValue: 100.4, rounding: 'floor' }).finalValue).toBe(100);
    });
    it('35. round', () => {
      expect(resolve({ baseValue: 100.6, rounding: 'round' }).finalValue).toBe(101);
      expect(resolve({ baseValue: 100.4, rounding: 'round' }).finalValue).toBe(100);
    });
    it('36. ceil', () => {
      expect(resolve({ baseValue: 100.4, rounding: 'ceil' }).finalValue).toBe(101);
    });
    it('37. arrondi appliqué APRÈS les caps', () => {
      const r = resolve({ baseValue: 200, caps: { max: 100.6 }, rounding: 'floor' });
      expect(r.afterCaps).toBeCloseTo(100.6, 6);
      expect(r.finalValue).toBe(100); // floor(100.6), pas floor(200)
    });
    it('38. aucun arrondi intermédiaire', () => {
      const r = resolve({
        baseValue: 10,
        rounding: 'floor',
        contributions: [
          contrib({ id: 'a', operation: 'percent_add', value: 5 }),
          contrib({ id: 'b', operation: 'percent_multiply', value: 10 }),
        ],
      });
      expect(r.afterPercentAdd).toBeCloseTo(10.5, 6); // pas arrondi
      expect(r.afterPercentMultiply).toBeCloseTo(11.55, 6); // pas arrondi
      expect(r.finalValue).toBe(11); // floor UNE seule fois
    });
  });

  // ── Déterminisme ──────────────────────────────────────────────────────────────
  describe('déterminisme', () => {
    it('39. permutations de modificateurs donnent le même résultat', () => {
      const a = contrib({ id: 'a', operation: 'flat', value: 20 });
      const b = contrib({ id: 'b', operation: 'flat', value: -5 });
      const c = contrib({ id: 'c', operation: 'percent_multiply', value: 50 });
      const r1 = resolve({ baseValue: 100, contributions: [a, b, c] });
      const r2 = resolve({ baseValue: 100, contributions: [c, a, b] });
      expect(r1.finalValue).toBeCloseTo(r2.finalValue, 9);
    });
    it('40. combinaison de facteurs de filtres indépendante de leur ordre', () => {
      const f1: StatContributionFilter = { match: { tag: 'a' }, scale: 0.5 };
      const f2: StatContributionFilter = {
        match: { sourceType: 'equipment' },
        scale: 0.25,
      };
      const base = {
        baseValue: 100,
        contributions: [
          contrib({ id: 'm', sourceType: 'equipment' as const, value: 80, tags: ['a'] }),
        ],
      };
      const r1 = resolve({ ...base, filters: [f1, f2] });
      const r2 = resolve({ ...base, filters: [f2, f1] });
      expect(r1.finalValue).toBeCloseTo(r2.finalValue, 9);
      expect(r1.applied.find((x) => x.modifierId === 'm')?.scale).toBeCloseTo(0.125, 9);
    });
  });

  // ── Erreurs ─────────────────────────────────────────────────────────────────
  describe('erreurs de configuration', () => {
    it('41. opération inconnue rejetée', () => {
      expectError(
        () =>
          resolve({
            baseValue: 100,
            contributions: [
              contrib({
                operation: 'bogus' as unknown as RuntimeModifier['operation'],
                value: 1,
              }),
            ],
          }),
        'UNKNOWN_OPERATION',
      );
    });
    it('42. valeur non finie rejetée (base NaN et contribution Infinity)', () => {
      expectError(() => resolve({ baseValue: NaN }), 'NON_FINITE_VALUE');
      expectError(
        () => resolve({ baseValue: 100, contributions: [contrib({ value: Infinity })] }),
        'NON_FINITE_VALUE',
      );
    });
    it('43. facteur de filtre invalide rejeté (négatif et NaN)', () => {
      expectError(
        () => resolve({ baseValue: 100, filters: [{ match: {}, scale: -1 }] }),
        'INVALID_FILTER_SCALE',
      );
      expectError(
        () => resolve({ baseValue: 100, filters: [{ match: {}, scale: NaN }] }),
        'INVALID_FILTER_SCALE',
      );
    });
    it('44. priorité invalide rejetée', () => {
      expectError(
        () => resolve({ baseValue: 100, contributions: [contrib({ value: 1, priority: NaN })] }),
        'INVALID_PRIORITY',
      );
    });
  });
});
