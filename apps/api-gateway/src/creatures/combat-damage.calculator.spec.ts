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
});
