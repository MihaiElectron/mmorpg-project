import { describe, it, expect } from "vitest";
import {
  buildEditorState,
  buildPutPayload,
  cloneEffectiveCoefficients,
  derivedLabel,
  EMPTY_CONTRIBUTIONS_MESSAGE,
  formatEffectiveCoefficients,
  scalarLabel,
  validateEditorState,
  type DerivedEditorState,
} from "./creatureDerivedConfig.helpers";
import type { CreatureDerivedConfiguration } from "./creatureDerivedConfig.types";

function config(): CreatureDerivedConfiguration {
  return {
    templateId: 1,
    templateKey: "turkey",
    derivedStats: [
      {
        derivedStatKey: "physicalAttack",
        overrideState: "none",
        explicitCoefficients: null,
        effectiveCoefficients: [{ primaryStatKey: "strength", coefficient: 2 }],
        source: "global",
        baseSource: "baseAttack",
        label: "Attaque physique",
        category: "offensive",
      },
      {
        derivedStatKey: "magicResistanceFire",
        overrideState: "coefficients",
        explicitCoefficients: [{ primaryStatKey: "spirit", coefficient: 0.5 }],
        effectiveCoefficients: [{ primaryStatKey: "spirit", coefficient: 0.5 }],
        source: "template",
        baseSource: "catalog",
        label: "Résistance feu",
        category: "elemental_resistance",
      },
      {
        derivedStatKey: "defense",
        overrideState: "empty",
        explicitCoefficients: [],
        effectiveCoefficients: [],
        source: "template",
        baseSource: "baseArmor",
        label: "Défense",
        category: "defensive",
      },
    ],
    scalarParams: [
      { scalarParamKey: "blockReductionPercent", explicitValue: null, effectiveValue: 25, source: "global" },
      { scalarParamKey: "secondaryChanceCap", explicitValue: 75, effectiveValue: 75, source: "template" },
    ],
    catalog: {
      primaryStatKeys: ["strength", "spirit"],
      scalarParamKeys: ["blockReductionPercent", "secondaryChanceCap"],
      derivedStatKeys: ["physicalAttack", "magicResistanceFire", "defense"],
    },
  };
}

describe("buildEditorState", () => {
  it("mappe overrideState → overridden et explicit → coefficients (chaînes)", () => {
    const st = buildEditorState(config());
    expect(st.derived[0]).toEqual({ derivedStatKey: "physicalAttack", overridden: false, coefficients: [] });
    expect(st.derived[1]).toEqual({
      derivedStatKey: "magicResistanceFire",
      overridden: true,
      coefficients: [{ primaryStatKey: "spirit", coefficient: "0.5" }],
    });
    expect(st.derived[2]).toEqual({ derivedStatKey: "defense", overridden: true, coefficients: [] });
    expect(st.scalars[0]).toEqual({ scalarParamKey: "blockReductionPercent", overridden: false, value: "25" });
    expect(st.scalars[1]).toEqual({ scalarParamKey: "secondaryChanceCap", overridden: true, value: "75" });
  });
});

describe("formatEffectiveCoefficients (lecture)", () => {
  it("liste vide → message dédié (aucune contribution)", () => {
    expect(formatEffectiveCoefficients([])).toBe(EMPTY_CONTRIBUTIONS_MESSAGE);
    expect(EMPTY_CONTRIBUTIONS_MESSAGE).toBe("Aucune contribution de statistique primaire.");
  });

  it("formate prim × coef (négatif et zéro inclus), sans provenance", () => {
    expect(formatEffectiveCoefficients([{ primaryStatKey: "dexterity", coefficient: 0.5 }])).toBe("dexterity × 0.5");
    expect(
      formatEffectiveCoefficients([
        { primaryStatKey: "strength", coefficient: -1.5 },
        { primaryStatKey: "agility", coefficient: 0 },
      ]),
    ).toBe("strength × -1.5  +  agility × 0");
  });
});

describe("cloneEffectiveCoefficients (clic Edit)", () => {
  it("clone profond en chaînes, sans muter l'entrée du GET", () => {
    const entry = {
      effectiveCoefficients: [
        { primaryStatKey: "dexterity", coefficient: 0.5 },
        { primaryStatKey: "strength", coefficient: -2 },
        { primaryStatKey: "agility", coefficient: 0 },
      ],
    };
    const snapshot = JSON.stringify(entry);
    const cloned = cloneEffectiveCoefficients(entry);
    expect(cloned).toEqual([
      { primaryStatKey: "dexterity", coefficient: "0.5" },
      { primaryStatKey: "strength", coefficient: "-2" },
      { primaryStatKey: "agility", coefficient: "0" },
    ]);
    // Mutation de la copie → l'entrée d'origine reste intacte (aucune référence partagée).
    cloned[0].coefficient = "999";
    cloned[0].primaryStatKey = "muted";
    expect(JSON.stringify(entry)).toBe(snapshot);
  });

  it("effectifs vides → clone vide", () => {
    expect(cloneEffectiveCoefficients({ effectiveCoefficients: [] })).toEqual([]);
  });
});

describe("labels", () => {
  it("derivedLabel : label serveur sinon la clé", () => {
    expect(derivedLabel({ derivedStatKey: "physicalAttack", label: "Attaque physique" })).toBe("Attaque physique");
    expect(derivedLabel({ derivedStatKey: "foo", label: null })).toBe("foo");
  });
  it("scalarLabel : libellé historique transféré, sinon la clé", () => {
    expect(scalarLabel("blockReductionPercent")).toBe("Réduction blocage");
    expect(scalarLabel("secondaryChanceCap")).toBe("Cap chances secondaires");
    expect(scalarLabel("inconnu")).toBe("inconnu");
  });
});

describe("validateEditorState", () => {
  const base = (): DerivedEditorState => ({
    derived: [{ derivedStatKey: "physicalAttack", overridden: true, coefficients: [{ primaryStatKey: "strength", coefficient: "2" }] }],
    scalars: [],
  });

  it("valide un état correct (null)", () => {
    expect(validateEditorState(base())).toBeNull();
  });

  it("autorise négatif, zéro et map vide", () => {
    expect(validateEditorState({ derived: [{ derivedStatKey: "d", overridden: true, coefficients: [{ primaryStatKey: "s", coefficient: "-1.5" }] }], scalars: [] })).toBeNull();
    expect(validateEditorState({ derived: [{ derivedStatKey: "d", overridden: true, coefficients: [{ primaryStatKey: "s", coefficient: "0" }] }], scalars: [] })).toBeNull();
    expect(validateEditorState({ derived: [{ derivedStatKey: "d", overridden: true, coefficients: [] }], scalars: [] })).toBeNull();
  });

  it("rejette un doublon de primaire", () => {
    const st = base();
    st.derived[0].coefficients.push({ primaryStatKey: "strength", coefficient: "1" });
    expect(validateEditorState(st)).toMatch(/dupliqu/);
  });

  it("rejette coefficient vide / non numérique / NaN / Infinity", () => {
    for (const bad of ["", "abc", "NaN", "Infinity"]) {
      const st = base();
      st.derived[0].coefficients[0].coefficient = bad;
      expect(validateEditorState(st)).toMatch(/coefficient invalide/);
    }
  });

  it("ne valide pas les dérivées non overridées", () => {
    const st = base();
    st.derived[0].overridden = false;
    st.derived[0].coefficients[0].coefficient = "abc"; // ignoré car non overridé
    expect(validateEditorState(st)).toBeNull();
  });

  it("rejette une valeur scalaire non finie (override)", () => {
    expect(validateEditorState({ derived: [], scalars: [{ scalarParamKey: "secondaryChanceCap", overridden: true, value: "Infinity" }] })).toMatch(/valeur invalide/);
  });
});

describe("buildPutPayload", () => {
  it("omet les non-overridés (fallback), envoie les overrides, map vide conservée", () => {
    const st: DerivedEditorState = {
      derived: [
        { derivedStatKey: "physicalAttack", overridden: false, coefficients: [{ primaryStatKey: "strength", coefficient: "2" }] },
        { derivedStatKey: "magicResistanceFire", overridden: true, coefficients: [{ primaryStatKey: "spirit", coefficient: "0.5" }] },
        { derivedStatKey: "defense", overridden: true, coefficients: [] },
      ],
      scalars: [
        { scalarParamKey: "blockReductionPercent", overridden: false, value: "25" },
        { scalarParamKey: "secondaryChanceCap", overridden: true, value: "45" },
      ],
    };
    expect(buildPutPayload(st)).toEqual({
      derivedOverrides: [
        { derivedStatKey: "magicResistanceFire", coefficients: [{ primaryStatKey: "spirit", coefficient: 0.5 }] },
        { derivedStatKey: "defense", coefficients: [] },
      ],
      scalarOverrides: [{ scalarParamKey: "secondaryChanceCap", value: 45 }],
    });
  });

  it("round-trip config → editor → payload ne renvoie pas les effectifs comme overrides", () => {
    const st = buildEditorState(config());
    const payload = buildPutPayload(st);
    // physicalAttack (fallback) absent ; blockReductionPercent (fallback) absent.
    expect(payload.derivedOverrides.map((d) => d.derivedStatKey)).toEqual(["magicResistanceFire", "defense"]);
    expect(payload.scalarOverrides.map((s) => s.scalarParamKey)).toEqual(["secondaryChanceCap"]);
  });
});
