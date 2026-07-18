import {
  CREATURE_SCALAR_PARAM_KEYS,
  CreatureTemplateOverrides,
  EMPTY_TEMPLATE_OVERRIDES,
  effectiveCoefficientMap,
  effectiveScalar,
  isCreatureScalarParamKey,
  sumPrimaryContributions,
} from './creature-template-overrides.constants';

const overrides = (partial: Partial<CreatureTemplateOverrides>): CreatureTemplateOverrides => ({
  derivedCoefficients: partial.derivedCoefficients ?? {},
  scalarParams: partial.scalarParams ?? {},
});

describe("sumPrimaryContributions", () => {
  const primaries = { strength: 10, agility: 4, spirit: 20, wisdom: 5 };

  it("map vide → 0", () => {
    expect(sumPrimaryContributions({}, primaries)).toBe(0);
  });

  it("plusieurs primaires additionnées", () => {
    expect(sumPrimaryContributions({ strength: 2, agility: 1 }, primaries)).toBe(24);
  });

  it("coefficient négatif → contribution négative", () => {
    expect(sumPrimaryContributions({ spirit: -0.5 }, primaries)).toBe(-10);
  });

  it("primaire absent des stats → 0 pour cette contribution", () => {
    expect(sumPrimaryContributions({ charisma: 5 }, primaries)).toBe(0);
  });
});

describe("effectiveCoefficientMap — provenance (§9)", () => {
  const fallback = { spirit: 0.5, wisdom: 0.2 };

  it("aucun override → fallback + provenance fournie", () => {
    const r = effectiveCoefficientMap(EMPTY_TEMPLATE_OVERRIDES, "magicResistanceFire", fallback, "catalog");
    expect(r.map).toBe(fallback);
    expect(r.source).toBe("catalog");
  });

  it("override présent → map du template + provenance 'template'", () => {
    const ov = overrides({ derivedCoefficients: { magicResistanceFire: { spirit: 1 } } });
    const r = effectiveCoefficientMap(ov, "magicResistanceFire", fallback, "catalog");
    expect(r.map).toEqual({ spirit: 1 });
    expect(r.source).toBe("template");
  });

  it("override MAP VIDE présent → map vide (pas le fallback) + 'template'", () => {
    const ov = overrides({ derivedCoefficients: { magicResistanceFire: {} } });
    const r = effectiveCoefficientMap(ov, "magicResistanceFire", fallback, "catalog");
    expect(r.map).toEqual({});
    expect(r.source).toBe("template");
  });
});

describe("effectiveScalar — provenance", () => {
  it("aucun override → fallback global", () => {
    const r = effectiveScalar(EMPTY_TEMPLATE_OVERRIDES, "secondaryChanceCap", 40);
    expect(r).toEqual({ value: 40, source: "global" });
  });

  it("override présent → valeur template", () => {
    const ov = overrides({ scalarParams: { secondaryChanceCap: 75 } });
    expect(effectiveScalar(ov, "secondaryChanceCap", 40)).toEqual({ value: 75, source: "template" });
  });
});

describe("Résistances magiques par template (résolution comme le service)", () => {
  // Reproduit le calcul de resolveCreatureEffectiveMagicResistance : base +
  // sumPrimaryContributions(effectiveMap, primaries), fallback = catalogue.
  const catalogFire = { spirit: 0.5, wisdom: 0.2 };
  const primariesA = { spirit: 20, wisdom: 5 }; // fallback → 10 + 1 = 11
  const primariesB = { spirit: 20, wisdom: 5 };

  const resolveFire = (ov: CreatureTemplateOverrides, primaries: Record<string, number>) => {
    const { map } = effectiveCoefficientMap(ov, "magicResistanceFire", catalogFire, "catalog");
    return 0 + sumPrimaryContributions(map, primaries);
  };

  it("sans override : valeur catalogue (fallback)", () => {
    expect(resolveFire(EMPTY_TEMPLATE_OVERRIDES, primariesA)).toBe(11);
  });

  it("deux templates : résistances différentes par override", () => {
    const ovA = overrides({ derivedCoefficients: { magicResistanceFire: { spirit: 0.5, wisdom: 0.2 } } });
    const ovB = overrides({ derivedCoefficients: { magicResistanceFire: { spirit: 2 } } });
    expect(resolveFire(ovA, primariesA)).toBe(11); // idem catalogue
    expect(resolveFire(ovB, primariesB)).toBe(40); // 20 × 2
  });
});

describe("clés scalaires canoniques", () => {
  it("liste canonique = blockReductionPercent + secondaryChanceCap", () => {
    expect([...CREATURE_SCALAR_PARAM_KEYS]).toEqual(["blockReductionPercent", "secondaryChanceCap"]);
  });

  it("rejette une clé scalaire arbitraire", () => {
    expect(isCreatureScalarParamKey("secondaryChanceCap")).toBe(true);
    expect(isCreatureScalarParamKey("randomStuff")).toBe(false);
  });
});
