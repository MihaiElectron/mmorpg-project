import {
  applyMagicResistance,
  calculateCombatDamage,
} from './combat-damage.calculator';

describe("applyMagicResistance (formule pure)", () => {
  const mit = (damage: number, effectiveResistance: number, minimumDamage = 1) =>
    applyMagicResistance({ damage, effectiveResistance, minimumDamage });

  it("résistance 0 → dégâts inchangés (100 → 100)", () => {
    expect(mit(100, 0).finalDamage).toBe(100);
  });

  it("résistance 30 → 70", () => {
    const r = mit(100, 30);
    expect(r.multiplier).toBeCloseTo(0.7, 10);
    expect(r.finalDamage).toBe(70);
  });

  it("résistance -25 (vulnérabilité) → 125 (aucun clamp)", () => {
    const r = mit(100, -25);
    expect(r.multiplier).toBeCloseTo(1.25, 10);
    expect(r.finalDamage).toBe(125);
  });

  it("résistance 120 (≥ 100, pas une immunité) → minimum 1", () => {
    const r = mit(100, 120);
    expect(r.multiplier).toBeCloseTo(-0.2, 10);
    expect(r.damageAfterRounding).toBe(-20);
    expect(r.finalDamage).toBe(1);
  });

  it("résistance 100 → 0 mathématique → minimum 1 (pas d'immunité)", () => {
    expect(mit(100, 100).finalDamage).toBe(1);
  });

  it("dégâts 1, résistance 99 → 1", () => {
    expect(mit(1, 99).finalDamage).toBe(1);
  });

  it("dégâts 0, résistance quelconque → 0 (jamais de minimum sur un non-hit)", () => {
    expect(mit(0, 30).finalDamage).toBe(0);
    expect(mit(0, -50).finalDamage).toBe(0);
    expect(mit(0, 200).finalDamage).toBe(0);
  });

  it("arrondi Math.round (convention moteur) : 100 × (1 − 0.125) = 87.5 → 88", () => {
    const r = mit(100, 12.5);
    expect(r.damageAfterResistanceBeforeRounding).toBeCloseTo(87.5, 10);
    expect(r.finalDamage).toBe(88); // Math.round(87.5) = 88
  });

  it("expose la trace complète", () => {
    const r = mit(100, 30);
    expect(r).toMatchObject({
      damageBeforeResistance: 100,
      effectiveResistance: 30,
      damageAfterRounding: 70,
      finalDamage: 70,
    });
  });
});

describe("calculateCombatDamage — damageType magic", () => {
  const magic = (
    attackerValue: number,
    effectiveMagicResistance: number,
    extra: Partial<Parameters<typeof calculateCombatDamage>[0]> = {},
  ) =>
    calculateCombatDamage({
      attackerValue,
      minimumAttack: 0,
      targetDefense: 999, // ignoré en magic (aucune armure)
      minimumDamage: 1,
      hpBefore: 1000,
      damageType: "magic",
      effectiveMagicResistance,
      ...extra,
    });

  it("ignore l'armure de la cible (targetDefense 999 sans effet)", () => {
    const r = magic(100, 0);
    expect(r.effectiveArmor).toBe(0);
    expect(r.finalDamage).toBe(100);
  });

  it("applique la résistance : 100 dégâts, résistance 30 → 70", () => {
    const r = magic(100, 30);
    expect(r.finalDamage).toBe(70);
    expect(r.effectiveMagicResistance).toBe(30);
    expect(r.magicMultiplier).toBeCloseTo(0.7, 10);
  });

  it("résistance négative -25 → 125", () => {
    expect(magic(100, -25).finalDamage).toBe(125);
  });

  it("résistance 120 → minimum 1", () => {
    expect(magic(100, 120).finalDamage).toBe(1);
  });

  it("aucun blocage physique en magic (blockChance ignoré)", () => {
    const r = magic(100, 0, {
      defenderBlockChancePercent: 100,
      defenderBlockReductionPercent: 100,
      rng: () => 0, // forcerait un blocage en physical
    });
    expect(r.isBlocked).toBe(false);
    expect(r.finalDamage).toBe(100);
  });

  it("magic PEUT être esquivé (court-circuit à 0)", () => {
    const r = magic(100, 30, { defenderDodgeChancePercent: 100, rng: () => 0 });
    expect(r.isDodged).toBe(true);
    expect(r.finalDamage).toBe(0); // esquive → 0, pas de minimum
  });

  it("magic PEUT critiquer (bloc attaque avant mitigation)", () => {
    // crit ×2 : 100 → 200, puis résistance 50 → 100.
    const r = magic(100, 50, {
      criticalChancePercent: 100,
      criticalDamagePercent: 200,
      rng: () => 0,
    });
    expect(r.isCritical).toBe(true);
    expect(r.attackPowerFinal).toBe(200);
    expect(r.finalDamage).toBe(100);
  });

  it("no armorPenetration effect in magic", () => {
    const r = magic(100, 0, { armorPenetrationPercent: 100 });
    expect(r.effectiveArmor).toBe(0);
    expect(r.finalDamage).toBe(100);
  });
});

describe("Non-régression — physical et raw inchangés par les résistances magiques", () => {
  it("physical : résistance magique 500 ignorée (armure seule)", () => {
    const withResist = calculateCombatDamage({
      attackerValue: 100,
      minimumAttack: 0,
      targetDefense: 20,
      minimumDamage: 1,
      hpBefore: 1000,
      damageType: "physical",
      effectiveMagicResistance: 500,
    });
    const withoutResist = calculateCombatDamage({
      attackerValue: 100,
      minimumAttack: 0,
      targetDefense: 20,
      minimumDamage: 1,
      hpBefore: 1000,
      damageType: "physical",
    });
    expect(withResist.finalDamage).toBe(80); // 100 - 20
    expect(withResist.finalDamage).toBe(withoutResist.finalDamage);
    expect(withResist.effectiveMagicResistance).toBe(0);
    expect(withResist.magicMultiplier).toBe(1);
  });

  it("raw : ni armure ni résistance magique (500 ignorée), minimum 1 conservé", () => {
    const r = calculateCombatDamage({
      attackerValue: 100,
      minimumAttack: 0,
      targetDefense: 999,
      minimumDamage: 1,
      hpBefore: 1000,
      damageType: "raw",
      effectiveMagicResistance: 500,
    });
    expect(r.effectiveArmor).toBe(0);
    expect(r.finalDamage).toBe(100);
    expect(r.effectiveMagicResistance).toBe(0);
  });
});
