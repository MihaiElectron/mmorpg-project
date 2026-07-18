import { SKILL_MAGIC_SCHOOLS } from '../active-skills/active-skills.constants';
import { computeDerivedFromDefinitions } from '../characters/character-stats-calculator';
import { RuntimeComputeEngine } from '../player-runtime/runtime-compute';
import { RuntimeModifier, StatKey } from '../player-runtime/player-runtime.types';
import { DEFAULT_DERIVED_STAT_DEFINITIONS } from './derived-stats.constants';
import {
  MAGIC_RESISTANCE_GLOBAL_STAT,
  MAGIC_RESISTANCE_STAT_KEYS,
  MAGIC_SCHOOL_RESISTANCE_STAT,
  MagicResistanceReader,
  MagicResistanceStatKey,
  magicResistanceReaderFromStats,
  magicResistanceStatForSchool,
  resolveEffectiveMagicResistance,
} from './magic-resistance';

/** Reader construit à partir d'une carte simple de valeurs résolues. */
function reader(map: Record<string, number>): MagicResistanceReader {
  return magicResistanceReaderFromStats(map);
}

describe("Mapping école → statistique de résistance", () => {
  it("mappe exactement les six écoles", () => {
    expect(MAGIC_SCHOOL_RESISTANCE_STAT).toEqual({
      fire: "magicResistanceFire",
      water: "magicResistanceWater",
      air: "magicResistanceAir",
      earth: "magicResistanceEarth",
      sacred: "magicResistanceSacred",
      poison: "magicResistancePoison",
    });
  });

  it("couvre les six écoles canoniques (SKILL_MAGIC_SCHOOLS)", () => {
    expect(Object.keys(MAGIC_SCHOOL_RESISTANCE_STAT).sort()).toEqual(
      [...SKILL_MAGIC_SCHOOLS].sort(),
    );
  });

  it.each([...SKILL_MAGIC_SCHOOLS])("magicResistanceStatForSchool(%s)", (school) => {
    expect(magicResistanceStatForSchool(school)).toBe(
      MAGIC_SCHOOL_RESISTANCE_STAT[school],
    );
  });

  it("expose la clé globale et 7 clés uniques", () => {
    expect(MAGIC_RESISTANCE_GLOBAL_STAT).toBe("magicResistanceGlobal");
    expect(MAGIC_RESISTANCE_STAT_KEYS).toHaveLength(7);
    expect(new Set(MAGIC_RESISTANCE_STAT_KEYS).size).toBe(7);
  });

  it("n'expose aucune clé générique / école inconnue", () => {
    const forbidden = ["fireResistance", "resistanceFire", "magicRes", "arcane"];
    for (const key of forbidden) {
      expect(MAGIC_RESISTANCE_STAT_KEYS).not.toContain(key as MagicResistanceStatKey);
    }
  });
});

describe("Résolution effective par école (aucun clamp)", () => {
  it("aucune contribution → global 0, école 0, effective 0", () => {
    const res = resolveEffectiveMagicResistance("fire", reader({}));
    expect(res).toEqual({
      school: "fire",
      globalResistance: 0,
      schoolResistance: 0,
      effectiveResistance: 0,
    });
  });

  it("global 10 + fire 20 → effective 30", () => {
    const res = resolveEffectiveMagicResistance(
      "fire",
      reader({ magicResistanceGlobal: 10, magicResistanceFire: 20 }),
    );
    expect(res.effectiveResistance).toBe(30);
  });

  it("global -10 + poison -20 → effective -30 (négatif conservé)", () => {
    const res = resolveEffectiveMagicResistance(
      "poison",
      reader({ magicResistanceGlobal: -10, magicResistancePoison: -20 }),
    );
    expect(res.effectiveResistance).toBe(-30);
  });

  it("global 70 + sacred 50 → effective 120 (aucun clamp à 100)", () => {
    const res = resolveEffectiveMagicResistance(
      "sacred",
      reader({ magicResistanceGlobal: 70, magicResistanceSacred: 50 }),
    );
    expect(res.effectiveResistance).toBe(120);
  });

  it("préserve les fractions (aucun arrondi)", () => {
    const res = resolveEffectiveMagicResistance(
      "fire",
      reader({ magicResistanceGlobal: 2.5, magicResistanceFire: 10 }),
    );
    expect(res.effectiveResistance).toBe(12.5);
  });

  it("ne déduit ni immunité ni multiplicateur (4 champs seulement)", () => {
    const res = resolveEffectiveMagicResistance(
      "fire",
      reader({ magicResistanceGlobal: 100, magicResistanceFire: 100 }),
    );
    expect(Object.keys(res).sort()).toEqual([
      "effectiveResistance",
      "globalResistance",
      "school",
      "schoolResistance",
    ]);
    expect(res).not.toHaveProperty("isImmune");
    expect(res).not.toHaveProperty("damageMultiplier");
  });
});

describe("Isolation des écoles", () => {
  const stats = { magicResistanceFire: 40, magicResistanceWater: 5 };

  it("resolve fire utilise fire (pas water)", () => {
    const res = resolveEffectiveMagicResistance("fire", reader(stats));
    expect(res.schoolResistance).toBe(40);
    expect(res.effectiveResistance).toBe(40); // global 0
  });

  it("resolve water utilise water (pas fire)", () => {
    const res = resolveEffectiveMagicResistance("water", reader(stats));
    expect(res.schoolResistance).toBe(5);
  });

  it("resolve poison ne réutilise ni fire ni water", () => {
    const res = resolveEffectiveMagicResistance("poison", reader(stats));
    expect(res.schoolResistance).toBe(0);
    expect(res.effectiveResistance).toBe(0);
  });

  it("la globale s'ajoute à chaque école sans contaminer les autres", () => {
    const withGlobal = reader({ ...stats, magicResistanceGlobal: 10 });
    expect(resolveEffectiveMagicResistance("fire", withGlobal).effectiveResistance).toBe(50);
    expect(resolveEffectiveMagicResistance("water", withGlobal).effectiveResistance).toBe(15);
    expect(resolveEffectiveMagicResistance("poison", withGlobal).effectiveResistance).toBe(10);
  });
});

describe("Lecture sûre des valeurs résolues", () => {
  it("null / undefined → 0", () => {
    const res = resolveEffectiveMagicResistance("fire", () => undefined);
    expect(res.effectiveResistance).toBe(0);
    expect(resolveEffectiveMagicResistance("fire", () => null).effectiveResistance).toBe(0);
  });

  it("valeur non finie (corruption) → erreur explicite", () => {
    expect(() => resolveEffectiveMagicResistance("fire", () => NaN)).toThrow(
      /non-finite/,
    );
    expect(() =>
      resolveEffectiveMagicResistance("fire", () => Infinity),
    ).toThrow(/non-finite/);
  });
});

describe("Définitions par défaut (catalogue canonique)", () => {
  const byKey = new Map(DEFAULT_DERIVED_STAT_DEFINITIONS.map((d) => [d.key, d]));

  it.each([...MAGIC_RESISTANCE_STAT_KEYS])(
    "%s : baseValue 0, aucun clamp, calculatedOnly, non mastery",
    (key) => {
      const def = byKey.get(key);
      expect(def).toBeDefined();
      expect(def!.baseValue).toBe(0);
      expect(def!.minValue).toBeNull();
      expect(def!.maxValue).toBeNull();
      expect(def!.runtimeStatus).toBe("calculatedOnly");
      expect(def!.masteryEligible).toBe(false);
    },
  );

  it("global/sacred/poison sont sans coefficient (nouvelles clés)", () => {
    for (const key of ["magicResistanceGlobal", "magicResistanceSacred", "magicResistancePoison"] as const) {
      expect(byKey.get(key)!.primaryCoefficients).toEqual({});
    }
  });

  it("fire/water/air/earth conservent leurs coefficients Esprit (legacy préservé)", () => {
    expect(byKey.get("magicResistanceFire")!.primaryCoefficients).toEqual({ spirit: 0.5, wisdom: 0.2 });
    expect(byKey.get("magicResistanceWater")!.primaryCoefficients).toEqual({ spirit: 0.5, intelligence: 0.2 });
    expect(byKey.get("magicResistanceAir")!.primaryCoefficients).toEqual({ spirit: 0.5, agility: 0.2 });
    expect(byKey.get("magicResistanceEarth")!.primaryCoefficients).toEqual({ spirit: 0.5, endurance: 0.2 });
  });
});

describe("Famille canonique unique (aucun doublon)", () => {
  const keys = DEFAULT_DERIVED_STAT_DEFINITIONS.map((d) => d.key);

  it("aucune clé legacy magicalResistance* dans les defaults", () => {
    for (const legacy of [
      "magicalResistanceFire",
      "magicalResistanceWater",
      "magicalResistanceAir",
      "magicalResistanceEarth",
    ]) {
      expect(keys).not.toContain(legacy);
    }
  });

  it("exactement 7 clés magicResistance*, une par école + globale", () => {
    const resistanceKeys = keys.filter((k) => k.startsWith("magicResistance"));
    expect(resistanceKeys.sort()).toEqual([...MAGIC_RESISTANCE_STAT_KEYS].sort());
    expect(new Set(resistanceKeys).size).toBe(7);
  });

  it("magicResistanceFire est l'unique définition canonique du feu", () => {
    expect(keys.filter((k) => k === "magicResistanceFire")).toHaveLength(1);
    expect(keys).not.toContain("magicalResistanceFire");
  });
});

describe("Résolution via le pipeline générique (personnage)", () => {
  const zeroPrimaries = {
    strength: 0,
    vitality: 0,
    endurance: 0,
    agility: 0,
    dexterity: 0,
    intelligence: 0,
    wisdom: 0,
    spirit: 0,
    willpower: 0,
    charisma: 0,
  } as unknown as Parameters<typeof computeDerivedFromDefinitions>[0];

  it("computeDerivedFromDefinitions résout les 7 résistances à 0 par défaut", () => {
    const derived = computeDerivedFromDefinitions(
      zeroPrimaries,
      { maxHealth: 0, attack: 0, defense: 0 },
      DEFAULT_DERIVED_STAT_DEFINITIONS,
    ) as unknown as Record<string, number>;

    for (const key of MAGIC_RESISTANCE_STAT_KEYS) {
      expect(derived[key]).toBe(0);
    }

    const res = resolveEffectiveMagicResistance(
      "fire",
      magicResistanceReaderFromStats(derived),
    );
    expect(res.effectiveResistance).toBe(0);
  });

  it("des valeurs résolues (équipement/base simulés) alimentent l'effective", () => {
    // Un acteur dont le pipeline a résolu global=15 et fire=25.
    const derived = { magicResistanceGlobal: 15, magicResistanceFire: 25 };
    const res = resolveEffectiveMagicResistance(
      "fire",
      magicResistanceReaderFromStats(derived),
    );
    expect(res).toEqual({
      school: "fire",
      globalResistance: 15,
      schoolResistance: 25,
      effectiveResistance: 40,
    });
  });
});

describe("Contribution générique via le vrai pipeline (RuntimeComputeEngine.resolveStat)", () => {
  /** Modifier additif (flat) — mode réellement appliqué par le resolver. */
  function flatMod(targetStat: string, value: number): RuntimeModifier {
    return {
      id: `mod-${targetStat}-${value}`,
      sourceType: "equipment",
      sourceId: "test-item",
      sourceLabel: "Test",
      targetStat: targetStat as StatKey,
      operation: "flat",
      value,
      priority: 0,
      enabled: true,
    };
  }

  /** Résout une stat de résistance via le pipeline générique (aucun cap). */
  function resolve(statKey: string, baseValue: number, mods: RuntimeModifier[]) {
    return RuntimeComputeEngine.resolveStat({
      stat: statKey as StatKey,
      baseValue,
      contributions: mods,
    });
  }

  it("allowedModifierModes=[]/calculatedOnly n'empêche PAS un modifier flat", () => {
    // global base 0 + flat +5 → 5 (le resolver ne lit ni allowedModifierModes ni runtimeStatus).
    const r = resolve("magicResistanceGlobal", 0, [flatMod("magicResistanceGlobal", 5)]);
    expect(r.finalValue).toBe(5);
    expect(r.applied).toHaveLength(1); // contribution tracée
  });

  it("contribution positive : fire base 10 + flat +12 → 22", () => {
    const r = resolve("magicResistanceFire", 10, [flatMod("magicResistanceFire", 12)]);
    expect(r.finalValue).toBe(22);
  });

  it("contribution négative : poison base 0 + flat -15 → -15 (aucun clamp)", () => {
    const r = resolve("magicResistancePoison", 0, [flatMod("magicResistancePoison", -15)]);
    expect(r.finalValue).toBe(-15);
    expect(r.caps).toEqual({ min: null, max: null });
  });

  it("les valeurs résolues par le pipeline alimentent l'effective (global 5 + fire 22 = 27)", () => {
    const globalR = resolve("magicResistanceGlobal", 0, [flatMod("magicResistanceGlobal", 5)]);
    const fireR = resolve("magicResistanceFire", 10, [flatMod("magicResistanceFire", 12)]);
    const resolved = {
      magicResistanceGlobal: globalR.finalValue,
      magicResistanceFire: fireR.finalValue,
    };
    const eff = resolveEffectiveMagicResistance(
      "fire",
      magicResistanceReaderFromStats(resolved),
    );
    expect(eff.effectiveResistance).toBe(27);
  });
});
