import { calculateCombatDamage } from './combat-damage.calculator';

describe('calculateCombatDamage', () => {
  it('attaque 10 défense 3 → rawDamage 7, finalDamage 7', () => {
    const r = calculateCombatDamage({
      attackerValue: 10,
      targetDefense: 3,
      minimumAttack: 5,
      minimumDamage: 1,
      hpBefore: 30,
    });
    expect(r.effectiveAttack).toBe(10);
    expect(r.rawDamage).toBe(7);
    expect(r.finalDamage).toBe(7);
    expect(r.hpAfter).toBe(23);
  });

  it('attaque faible (2) avec minimumAttack 5 → effectiveAttack 5', () => {
    const r = calculateCombatDamage({
      attackerValue: 2,
      targetDefense: 2,
      minimumAttack: 5,
      minimumDamage: 1,
      hpBefore: 30,
    });
    // effectiveAttack = max(2,5) = 5 ; raw = 5 - 2 = 3 ; final = 3
    expect(r.effectiveAttack).toBe(5);
    expect(r.finalDamage).toBe(3);
  });

  it('défense supérieure à l\'attaque → finalDamage plafonné au minimum (1)', () => {
    const r = calculateCombatDamage({
      attackerValue: 5,
      targetDefense: 100,
      minimumAttack: 5,
      minimumDamage: 1,
      hpBefore: 30,
    });
    expect(r.rawDamage).toBe(-95);
    expect(r.finalDamage).toBe(1);
    expect(r.hpAfter).toBe(29);
  });

  it('hpBefore 30, finalDamage 8 → hpAfter 22 (cas de référence service)', () => {
    // physicalAttack 10 (max avec 5 = 10), defenseTotal 2 → damage 8
    const r = calculateCombatDamage({
      attackerValue: 10,
      targetDefense: 2,
      minimumAttack: 5,
      minimumDamage: 1,
      hpBefore: 30,
    });
    expect(r.finalDamage).toBe(8);
    expect(r.hpAfter).toBe(22);
  });

  it('hpAfter ne descend jamais sous 0', () => {
    const r = calculateCombatDamage({
      attackerValue: 50,
      targetDefense: 0,
      minimumAttack: 5,
      minimumDamage: 1,
      hpBefore: 5,
    });
    expect(r.finalDamage).toBe(50);
    expect(r.hpAfter).toBe(0);
  });

  it('riposte : minimumAttack 0 → aucun plancher d\'attaque (identique au comportement actuel)', () => {
    // attackPower 5, player defense 3 → raw 2, final 2
    const r = calculateCombatDamage({
      attackerValue: 5,
      targetDefense: 3,
      minimumAttack: 0,
      minimumDamage: 1,
      hpBefore: 100,
    });
    expect(r.effectiveAttack).toBe(5); // max(5, 0) = 5, pas de plancher à 5
    expect(r.finalDamage).toBe(2);
    expect(r.hpAfter).toBe(98);
  });

  it('riposte : défense élevée → dégâts plancher 1', () => {
    const r = calculateCombatDamage({
      attackerValue: 5,
      targetDefense: 13,
      minimumAttack: 0,
      minimumDamage: 1,
      hpBefore: 100,
    });
    expect(r.finalDamage).toBe(1);
    expect(r.hpAfter).toBe(99);
  });

  // ── V4-A : pénétration d'armure en pourcentage ─────────────────────────────
  describe('armorPenetrationPercent (V4-A)', () => {
    // Base commune : rawDamage (attaque) 100, armure 40, minimumDamage 0.
    function physical(pct?: number, extra: Partial<Parameters<typeof calculateCombatDamage>[0]> = {}) {
      return calculateCombatDamage({
        attackerValue: 100,
        targetDefense: 40,
        minimumAttack: 0,
        minimumDamage: 0,
        hpBefore: 1000,
        armorPenetrationPercent: pct,
        ...extra,
      });
    }

    it('sans pénétration (0 %) → armure pleine (100 − 40 = 60)', () => {
      const r = physical(0);
      expect(r.effectiveArmor).toBe(40);
      expect(r.finalDamage).toBe(60);
      // champ omis → identique à 0 %
      expect(physical(undefined).finalDamage).toBe(60);
    });

    it('50 % → armure effective 20, dégâts 80', () => {
      const r = physical(50);
      expect(r.effectiveArmor).toBe(20);
      expect(r.finalDamage).toBe(80);
    });

    it('100 % → armure ignorée, dégâts 100', () => {
      const r = physical(100);
      expect(r.effectiveArmor).toBe(0);
      expect(r.finalDamage).toBe(100);
    });

    it('pénétration > 100 clampée à 100 (armure 0)', () => {
      const r = physical(150);
      expect(r.armorPenetrationPercent).toBe(100);
      expect(r.effectiveArmor).toBe(0);
      expect(r.finalDamage).toBe(100);
    });

    it('pénétration négative ramenée à 0 (armure pleine)', () => {
      const r = physical(-30);
      expect(r.armorPenetrationPercent).toBe(0);
      expect(r.effectiveArmor).toBe(40);
      expect(r.finalDamage).toBe(60);
    });

    it('NaN ignoré → 0 %, aucun NaN/Infinity propagé', () => {
      const r = physical(Number.NaN);
      expect(r.armorPenetrationPercent).toBe(0);
      expect(Number.isFinite(r.effectiveArmor)).toBe(true);
      expect(Number.isFinite(r.finalDamage)).toBe(true);
      expect(r.finalDamage).toBe(60);
    });

    it('armure supérieure aux dégâts → 0 dégât (minimumDamage 0), jamais négatif', () => {
      const r = calculateCombatDamage({
        attackerValue: 30,
        targetDefense: 100,
        minimumAttack: 0,
        minimumDamage: 0,
        hpBefore: 1000,
        armorPenetrationPercent: 50, // armure effective 50 > 30
      });
      expect(r.effectiveArmor).toBe(50);
      expect(r.finalDamage).toBe(0);
    });

    it('arrondi : armure 100, 33 % → armure effective 67 (round)', () => {
      const r = calculateCombatDamage({
        attackerValue: 100,
        targetDefense: 100,
        minimumAttack: 0,
        minimumDamage: 0,
        hpBefore: 1000,
        armorPenetrationPercent: 33,
      });
      expect(r.effectiveArmor).toBe(67); // round(100 × 0.67)
      expect(r.finalDamage).toBe(33);
    });

    it('raw : ignore armure ET pénétration', () => {
      const r = calculateCombatDamage({
        attackerValue: 100,
        targetDefense: 40,
        minimumAttack: 0,
        minimumDamage: 0,
        hpBefore: 1000,
        armorPenetrationPercent: 25,
        damageType: 'raw',
      });
      expect(r.damageType).toBe('raw');
      expect(r.effectiveArmor).toBe(0);
      expect(r.finalDamage).toBe(100);
    });

    it('physical est le défaut (armure appliquée)', () => {
      const r = calculateCombatDamage({
        attackerValue: 100,
        targetDefense: 40,
        minimumAttack: 0,
        minimumDamage: 0,
        hpBefore: 1000,
      });
      expect(r.damageType).toBe('physical');
      expect(r.effectiveArmor).toBe(40);
    });
  });
});
