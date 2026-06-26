// apps/api-gateway/src/player-runtime/runtime-compute.spec.ts

import { RuntimeComputeEngine } from './runtime-compute';
import { RuntimeModifier, StatKey } from './player-runtime.types';

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
