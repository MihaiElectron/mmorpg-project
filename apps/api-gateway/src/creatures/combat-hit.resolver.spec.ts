import { resolveCombatHit } from "./combat-hit.resolver";
import { calculateCombatDamage } from "./combat-damage.calculator";

// rng déterministe (aucun roll ne réussit : 0.999 ≥ tous les seuils testés).
const RNG = () => 0.999999;

describe("resolveCombatHit (V5-B0) — équivalence stricte avec calculateCombatDamage", () => {
  it("mappe attaquant + défenseur exactement sur les entrées du calculateur", () => {
    const viaResolver = resolveCombatHit({
      attacker: {
        attackPower: 100,
        minimumAttack: 5,
        armorPenetrationPercent: 30,
        criticalChancePercent: 25,
        criticalDamagePercent: 150,
        accuracyPercent: 10,
      },
      defender: {
        defense: 40,
        dodgeChancePercent: 20,
        blockChancePercent: 15,
        blockReductionPercent: 50,
        parryChancePercent: 10,
        canParry: true,
      },
      damageType: "physical",
      minimumDamage: 1,
      hpBefore: 500,
      rng: RNG,
    });

    const viaCalculator = calculateCombatDamage({
      attackerValue: 100,
      minimumAttack: 5,
      armorPenetrationPercent: 30,
      criticalChancePercent: 25,
      criticalDamagePercent: 150,
      attackerAccuracyPercent: 10,
      targetDefense: 40,
      defenderDodgeChancePercent: 20,
      defenderBlockChancePercent: 15,
      defenderBlockReductionPercent: 50,
      defenderParryChancePercent: 10,
      defenderCanParry: true,
      damageType: "physical",
      minimumDamage: 1,
      hpBefore: 500,
      rng: RNG,
    });

    expect(viaResolver).toEqual(viaCalculator);
  });

  it("applique les défauts : minimumAttack 0, minimumDamage 1, physical", () => {
    const viaResolver = resolveCombatHit({
      attacker: { attackPower: 12 },
      defender: { defense: 4 },
      hpBefore: 100,
      rng: RNG,
    });
    const viaCalculator = calculateCombatDamage({
      attackerValue: 12,
      minimumAttack: 0,
      targetDefense: 4,
      minimumDamage: 1,
      hpBefore: 100,
      rng: RNG,
    });
    expect(viaResolver).toEqual(viaCalculator);
    expect(viaResolver.finalDamage).toBe(8); // 12 − 4
  });

  it("propage les flags d'event (esquive → 0 dégât, pas de critique/blocage)", () => {
    const r = resolveCombatHit({
      attacker: { attackPower: 100, criticalChancePercent: 100 },
      defender: { defense: 10, dodgeChancePercent: 100 },
      hpBefore: 100,
      rng: () => 0, // esquive réussie
    });
    expect(r.isDodged).toBe(true);
    expect(r.finalDamage).toBe(0);
    expect(r.isCritical).toBe(false);
    expect(r.isBlocked).toBe(false);
  });

  it("parade non éligible (canParry défaut false) → parryChance ignorée", () => {
    const r = resolveCombatHit({
      attacker: { attackPower: 100 },
      defender: { defense: 0, parryChancePercent: 100 }, // canParry absent
      hpBefore: 100,
      rng: () => 0,
    });
    expect(r.isParried).toBe(false);
    expect(r.finalDamage).toBe(100);
  });
});
