import {
  calculateSkillEffect,
  SkillEffectInput,
  SkillEffectStats,
} from "./skill-effect.calculator";

function makeStats(overrides: Partial<SkillEffectStats> = {}): SkillEffectStats {
  return {
    primary: { strength: 10, dexterity: 4, ...(overrides.primary ?? {}) },
    derived: { physicalAttack: 100, healingPower: 30, ...(overrides.derived ?? {}) },
    masteryLevels: { two_handed: 5, ...(overrides.masteryLevels ?? {}) },
  };
}

describe("calculateSkillEffect", () => {
  it("calcule des degats bases sur une stat primaire", () => {
    const skill: SkillEffectInput = {
      effectType: "damage",
      scaling: { primaryCoefficients: { strength: 2 } },
    };
    const res = calculateSkillEffect(skill, makeStats());
    // strength 10 × 2 = 20
    expect(res.effectType).toBe("damage");
    expect(res.amount).toBe(20);
    expect(res.rawTotal).toBe(20);
  });

  it("calcule un soin base sur une stat derivee", () => {
    const skill: SkillEffectInput = {
      effectType: "heal",
      scaling: { derivedCoefficients: { healingPower: 1.5 } },
    };
    const res = calculateSkillEffect(skill, makeStats());
    // healingPower 30 × 1.5 = 45
    expect(res.effectType).toBe("heal");
    expect(res.amount).toBe(45);
  });

  it("combine primaire + derivee + mastery", () => {
    const skill: SkillEffectInput = {
      effectType: "damage",
      scaling: {
        primaryCoefficients: { strength: 1 }, // 10
        derivedCoefficients: { physicalAttack: 0.5 }, // 50
        masteryCoefficients: { two_handed: 2 }, // 10
      },
    };
    const res = calculateSkillEffect(skill, makeStats());
    expect(res.rawTotal).toBe(70);
    expect(res.amount).toBe(70);
    expect(res.contributions).toHaveLength(3);
  });

  it("scaling vide => amount 0 et aucune contribution", () => {
    const skill: SkillEffectInput = { effectType: "damage", scaling: {} };
    const res = calculateSkillEffect(skill, makeStats());
    expect(res.amount).toBe(0);
    expect(res.rawTotal).toBe(0);
    expect(res.contributions).toEqual([]);
  });

  it("scaling absent/null => amount 0", () => {
    const skill: SkillEffectInput = { effectType: "heal", scaling: null };
    const res = calculateSkillEffect(skill, makeStats());
    expect(res.amount).toBe(0);
  });

  it("cle inconnue dans les stats => valeur 0 (contribution nulle)", () => {
    const skill: SkillEffectInput = {
      effectType: "damage",
      scaling: { primaryCoefficients: { luck: 5 } }, // 'luck' absent des stats
    };
    const res = calculateSkillEffect(skill, makeStats());
    expect(res.rawTotal).toBe(0);
    expect(res.amount).toBe(0);
    // enregistree pour transparence, mais contribution 0
    expect(res.contributions).toEqual([
      { source: "primary", key: "luck", statValue: 0, coefficient: 5, contribution: 0 },
    ]);
  });

  it("coefficient non numerique => ignore", () => {
    const skill: SkillEffectInput = {
      effectType: "damage",
      scaling: {
        primaryCoefficients: { strength: "high" as unknown as number, dexterity: 3 },
      },
    };
    const res = calculateSkillEffect(skill, makeStats());
    // strength ignore (non numerique), dexterity 4 × 3 = 12
    expect(res.rawTotal).toBe(12);
    expect(res.contributions).toHaveLength(1);
    expect(res.contributions[0].key).toBe("dexterity");
  });

  it("valeur de stat non finie => traitee comme 0", () => {
    const skill: SkillEffectInput = {
      effectType: "damage",
      scaling: { primaryCoefficients: { strength: 2 } },
    };
    const stats = makeStats({ primary: { strength: NaN } });
    const res = calculateSkillEffect(skill, stats);
    expect(res.rawTotal).toBe(0);
    expect(res.amount).toBe(0);
    expect(res.contributions[0].statValue).toBe(0);
  });

  it("coefficient negatif accepte mais amount planche a 0", () => {
    const skill: SkillEffectInput = {
      effectType: "damage",
      scaling: { primaryCoefficients: { strength: -100 } },
    };
    const res = calculateSkillEffect(skill, makeStats());
    // 10 × -100 = -1000 (rawTotal), mais amount >= 0
    expect(res.rawTotal).toBe(-1000);
    expect(res.amount).toBe(0);
  });

  it("coefficient negatif reduit un total positif sans passer sous 0", () => {
    const skill: SkillEffectInput = {
      effectType: "damage",
      scaling: {
        derivedCoefficients: { physicalAttack: 1 }, // +100
        primaryCoefficients: { strength: -3 }, // -30
      },
    };
    const res = calculateSkillEffect(skill, makeStats());
    expect(res.rawTotal).toBe(70);
    expect(res.amount).toBe(70);
  });

  it("arrondit le total (round par defaut)", () => {
    const skill: SkillEffectInput = {
      effectType: "heal",
      scaling: { derivedCoefficients: { healingPower: 0.33 } }, // 30 × 0.33 = 9.9
    };
    const res = calculateSkillEffect(skill, makeStats());
    expect(res.rawTotal).toBeCloseTo(9.9);
    expect(res.amount).toBe(10);
  });

  it("respecte le mode d'arrondi floor", () => {
    const skill: SkillEffectInput = {
      effectType: "heal",
      scaling: { derivedCoefficients: { healingPower: 0.33 } }, // 9.9
    };
    const res = calculateSkillEffect(skill, makeStats(), { rounding: "floor" });
    expect(res.amount).toBe(9);
  });

  it("respecte un plancher minimum personnalise", () => {
    const skill: SkillEffectInput = {
      effectType: "damage",
      scaling: { primaryCoefficients: { strength: 0.1 } }, // 10 × 0.1 = 1
    };
    const res = calculateSkillEffect(skill, makeStats(), { minimum: 5 });
    expect(res.rawTotal).toBe(1);
    expect(res.amount).toBe(5);
  });

  it("un coefficient a 0 n'ajoute aucune contribution (pas de bruit)", () => {
    const skill: SkillEffectInput = {
      effectType: "damage",
      scaling: { primaryCoefficients: { strength: 0, dexterity: 1 } },
    };
    const res = calculateSkillEffect(skill, makeStats());
    expect(res.contributions).toHaveLength(1);
    expect(res.contributions[0].key).toBe("dexterity");
  });

  it("expose le detail des contributions dans l'ordre primary/derived/mastery", () => {
    const skill: SkillEffectInput = {
      effectType: "damage",
      scaling: {
        masteryCoefficients: { two_handed: 1 },
        primaryCoefficients: { strength: 1 },
        derivedCoefficients: { physicalAttack: 1 },
      },
    };
    const res = calculateSkillEffect(skill, makeStats());
    expect(res.contributions.map((c) => c.source)).toEqual([
      "primary",
      "derived",
      "mastery",
    ]);
  });
});
