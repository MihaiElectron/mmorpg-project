import { calculateCombatDamage } from './combat-damage.calculator';

describe('calculateCombatDamage', () => {
  // Régression : les colonnes health (creature/character) sont INTEGER. Une valeur
  // d'attaque fractionnaire (ex. stat dérivée non arrondie) ne doit jamais produire
  // des dégâts / PV fractionnaires (échec de persistance Postgres 22P02).
  it('valeur d\'attaque fractionnaire → dégâts et PV entiers', () => {
    const r = calculateCombatDamage({
      attackerValue: 4.9, // ex. counterAttackPower dérivé
      minimumAttack: 0,
      targetDefense: 2,
      minimumDamage: 1,
      hpBefore: 30,
    });
    expect(Number.isInteger(r.finalDamage)).toBe(true);
    expect(Number.isInteger(r.hpAfter)).toBe(true);
    expect(r.finalDamage).toBe(3); // round(4.9 - 2) = round(2.9) = 3
    expect(r.hpAfter).toBe(27);
  });

  it('hpBefore fractionnaire (état corrompu antérieur) → hpAfter entier (auto-guérison)', () => {
    const r = calculateCombatDamage({
      attackerValue: 5,
      minimumAttack: 0,
      targetDefense: 0,
      minimumDamage: 1,
      hpBefore: 27170.1,
    });
    expect(Number.isInteger(r.hpAfter)).toBe(true);
    expect(r.hpAfter).toBe(27165); // round(27170.1 - 5)
  });

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

  // ── V4-D : critique (bloc attaque) ─────────────────────────────────────────
  describe('critique (V4-D)', () => {
    const base = {
      attackerValue: 100,
      targetDefense: 40,
      minimumAttack: 0,
      minimumDamage: 0,
      hpBefore: 1000,
    };

    it('criticalChance 0 → jamais de critique (attackPowerFinal = attaque)', () => {
      const r = calculateCombatDamage({ ...base, criticalChancePercent: 0, rng: () => 0 });
      expect(r.isCritical).toBe(false);
      expect(r.attackPowerFinal).toBe(100);
      expect(r.finalDamage).toBe(60); // 100 − 40
    });

    it('critique forcé (roll contrôlé) → multiplicateur criticalDamage', () => {
      const r = calculateCombatDamage({
        ...base,
        criticalChancePercent: 25,
        criticalDamagePercent: 150,
        rng: () => 0, // 0 < 0.25 → critique
      });
      expect(r.isCritical).toBe(true);
      expect(r.attackPowerFinal).toBe(150); // round(100 × 1.5)
    });

    it('roll au-dessus du seuil → pas de critique', () => {
      const r = calculateCombatDamage({
        ...base,
        criticalChancePercent: 25,
        criticalDamagePercent: 150,
        rng: () => 0.5, // 0.5 >= 0.25 → pas de critique
      });
      expect(r.isCritical).toBe(false);
      expect(r.attackPowerFinal).toBe(100);
    });

    it('physical critique : base 100, armure 40, criticalDamage 150 → 110', () => {
      const r = calculateCombatDamage({
        ...base,
        criticalChancePercent: 100,
        criticalDamagePercent: 150,
        rng: () => 0,
      });
      expect(r.isCritical).toBe(true);
      expect(r.finalDamage).toBe(110); // 150 − 40
    });

    it('physical critique + armorPenetration 50 : base 100, armure 40 → 130', () => {
      const r = calculateCombatDamage({
        ...base,
        armorPenetrationPercent: 50,
        criticalChancePercent: 100,
        criticalDamagePercent: 150,
        rng: () => 0,
      });
      // attaque 150 ; armure effective round(40 × 0.5) = 20 ; 150 − 20 = 130.
      expect(r.finalDamage).toBe(130);
    });

    it('raw critique : base 100, criticalDamage 150 → 150 (ignore armure)', () => {
      const r = calculateCombatDamage({
        ...base,
        damageType: 'raw',
        criticalChancePercent: 100,
        criticalDamagePercent: 150,
        rng: () => 0,
      });
      expect(r.isCritical).toBe(true);
      expect(r.finalDamage).toBe(150);
    });

    it('raw sans critique → 100', () => {
      const r = calculateCombatDamage({
        ...base,
        damageType: 'raw',
        criticalChancePercent: 0,
        rng: () => 0,
      });
      expect(r.isCritical).toBe(false);
      expect(r.finalDamage).toBe(100);
    });

    it('criticalChance négative/NaN → 0 (pas de critique)', () => {
      expect(
        calculateCombatDamage({ ...base, criticalChancePercent: -10, rng: () => 0 }).isCritical,
      ).toBe(false);
      expect(
        calculateCombatDamage({ ...base, criticalChancePercent: Number.NaN, rng: () => 0 }).isCritical,
      ).toBe(false);
    });
  });

  // ── V4-F : esquive (hit avoidance, avant le bloc attaque) ──────────────────
  describe('esquive (V4-F)', () => {
    const base = {
      attackerValue: 100,
      targetDefense: 40,
      minimumAttack: 0,
      minimumDamage: 0,
      hpBefore: 1000,
    };

    it('dodgeChance 0 (défaut) → jamais d\'esquive, comportement inchangé', () => {
      const r = calculateCombatDamage({ ...base, rng: () => 0 });
      expect(r.isDodged).toBe(false);
      expect(r.finalDamage).toBe(60);
    });

    it('esquive forcée → 0 dégât, pas de critique, pas d\'armure, PV inchangés', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderDodgeChancePercent: 25,
        armorPenetrationPercent: 50,
        criticalChancePercent: 100, // ne doit PAS s'appliquer (esquive avant critique)
        criticalDamagePercent: 150,
        rng: () => 0, // 0 < 0.25 → esquive
      });
      expect(r.isDodged).toBe(true);
      expect(r.isCritical).toBe(false);
      expect(r.finalDamage).toBe(0);
      expect(r.effectiveArmor).toBe(0);
      expect(r.attackPowerFinal).toBe(0);
      expect(r.hpAfter).toBe(1000);
    });

    it('roll au-dessus du seuil → pas d\'esquive, pipeline normal', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderDodgeChancePercent: 25,
        rng: () => 0.5, // 0.5 >= 0.25 → pas d'esquive
      });
      expect(r.isDodged).toBe(false);
      expect(r.finalDamage).toBe(60);
    });

    it('esquive précède le critique : un hit esquivé n\'est jamais critique', () => {
      // rng constant 0 : sans esquive, chance 100 critiquerait. Avec esquive 100,
      // l'esquive court-circuite → pas de critique.
      const r = calculateCombatDamage({
        ...base,
        defenderDodgeChancePercent: 100,
        criticalChancePercent: 100,
        criticalDamagePercent: 200,
        rng: () => 0,
      });
      expect(r.isDodged).toBe(true);
      expect(r.isCritical).toBe(false);
      expect(r.finalDamage).toBe(0);
    });

    it('dodge > 100 clampé à 100, négatif/NaN → 0', () => {
      expect(
        calculateCombatDamage({ ...base, defenderDodgeChancePercent: 150, rng: () => 0.99 }).isDodged,
      ).toBe(true); // clamp 100 → toujours esquivé
      expect(
        calculateCombatDamage({ ...base, defenderDodgeChancePercent: -10, rng: () => 0 }).isDodged,
      ).toBe(false);
      expect(
        calculateCombatDamage({ ...base, defenderDodgeChancePercent: Number.NaN, rng: () => 0 }).isDodged,
      ).toBe(false);
    });

    it('raw peut aussi être esquivé → 0 dégât', () => {
      const r = calculateCombatDamage({
        ...base,
        damageType: 'raw',
        defenderDodgeChancePercent: 100,
        rng: () => 0,
      });
      expect(r.isDodged).toBe(true);
      expect(r.finalDamage).toBe(0);
    });
  });

  // ── V4-G : précision (accuracy) réduit l'esquive effective ─────────────────
  describe('précision vs esquive (V4-G)', () => {
    const base = {
      attackerValue: 100,
      targetDefense: 40,
      minimumAttack: 0,
      minimumDamage: 0,
      hpBefore: 1000,
    };

    it('dodge 30, accuracy 0, roll 0.29 → esquivé (effective 30)', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderDodgeChancePercent: 30,
        attackerAccuracyPercent: 0,
        rng: () => 0.29,
      });
      expect(r.effectiveDodgeChancePercent).toBe(30);
      expect(r.isDodged).toBe(true);
    });

    it('dodge 30, accuracy 10, roll 0.25 → NON esquivé (effective 20)', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderDodgeChancePercent: 30,
        attackerAccuracyPercent: 10,
        rng: () => 0.25, // 0.25 >= 0.20
      });
      expect(r.effectiveDodgeChancePercent).toBe(20);
      expect(r.isDodged).toBe(false);
      expect(r.finalDamage).toBe(60); // pipeline normal : 100 − 40
    });

    it('dodge 30, accuracy 50 → effective 0, jamais esquivé', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderDodgeChancePercent: 30,
        attackerAccuracyPercent: 50,
        rng: () => 0, // même roll 0 : effective 0 → pas d'esquive
      });
      expect(r.effectiveDodgeChancePercent).toBe(0);
      expect(r.isDodged).toBe(false);
    });

    it('dodge 0, accuracy 50 → effective 0, comportement inchangé', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderDodgeChancePercent: 0,
        attackerAccuracyPercent: 50,
        rng: () => 0,
      });
      expect(r.effectiveDodgeChancePercent).toBe(0);
      expect(r.isDodged).toBe(false);
      expect(r.finalDamage).toBe(60);
    });

    it('accuracy négative / NaN / Infinity → 0 (n\'augmente jamais l\'esquive)', () => {
      const neg = calculateCombatDamage({
        ...base,
        defenderDodgeChancePercent: 30,
        attackerAccuracyPercent: -50,
        rng: () => 0.29,
      });
      expect(neg.attackerAccuracyPercent).toBe(0);
      expect(neg.effectiveDodgeChancePercent).toBe(30);
      expect(
        calculateCombatDamage({ ...base, defenderDodgeChancePercent: 30, attackerAccuracyPercent: Number.NaN, rng: () => 0.29 }).effectiveDodgeChancePercent,
      ).toBe(30);
      expect(
        calculateCombatDamage({ ...base, defenderDodgeChancePercent: 30, attackerAccuracyPercent: Number.POSITIVE_INFINITY, rng: () => 0.29 }).effectiveDodgeChancePercent,
      ).toBe(30);
    });

    it('effective 0 (accuracy annule dodge) → critique et armure fonctionnent', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderDodgeChancePercent: 30,
        attackerAccuracyPercent: 50, // effective 0 → pas d'esquive
        armorPenetrationPercent: 50,
        criticalChancePercent: 100,
        criticalDamagePercent: 150,
        rng: () => 0, // pas d'esquive (effective 0), donc critique s'applique
      });
      expect(r.isDodged).toBe(false);
      expect(r.isCritical).toBe(true);
      // attaque round(100 × 1.5) = 150 ; armure effective round(40 × 0.5) = 20 → 130.
      expect(r.finalDamage).toBe(130);
    });
  });

  // ── V4-H : blocage (après esquive/critique/armure, physical) ───────────────
  describe('blocage (V4-H)', () => {
    const base = {
      attackerValue: 100,
      targetDefense: 40,
      minimumAttack: 0,
      minimumDamage: 0,
      hpBefore: 1000,
    };

    it('blockChance 0 (défaut) → jamais de blocage, dégâts inchangés', () => {
      const r = calculateCombatDamage({ ...base, rng: () => 0 });
      expect(r.isBlocked).toBe(false);
      expect(r.blockedDamage).toBe(0);
      expect(r.finalDamage).toBe(60);
    });

    it('blocage réussi → réduction appliquée sur les dégâts après armure', () => {
      // damageAfterArmor = 100 − 40 = 60 ; blocage 50 % → 30, absorbé 30.
      const r = calculateCombatDamage({
        ...base,
        defenderBlockChancePercent: 100,
        defenderBlockReductionPercent: 50,
        rng: () => 0, // pas d'esquive (0), pas de crit (0), blocage (100 %)
      });
      expect(r.isBlocked).toBe(true);
      expect(r.finalDamage).toBe(30);
      expect(r.blockedDamage).toBe(30);
    });

    it('roll au-dessus du seuil → pas de blocage', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderBlockChancePercent: 25,
        defenderBlockReductionPercent: 50,
        rng: () => 0.5, // 0.5 >= 0.25
      });
      expect(r.isBlocked).toBe(false);
      expect(r.finalDamage).toBe(60);
    });

    it("blocage APRÈS armure : réduit les dégâts déjà mitigés par l'armure", () => {
      // armure effective 20 (pen 50) → damageAfterArmor 80 ; blocage 25 % → 60.
      const r = calculateCombatDamage({
        ...base,
        armorPenetrationPercent: 50,
        defenderBlockChancePercent: 100,
        defenderBlockReductionPercent: 25,
        rng: () => 0,
      });
      expect(r.effectiveArmor).toBe(20);
      expect(r.isBlocked).toBe(true);
      expect(r.finalDamage).toBe(60); // round(80 × 0.75)
      expect(r.blockedDamage).toBe(20);
    });

    it('ne bloque pas les dégâts déjà à 0 (armure ≥ attaque, minimumDamage 0)', () => {
      const r = calculateCombatDamage({
        attackerValue: 30,
        targetDefense: 100,
        minimumAttack: 0,
        minimumDamage: 0,
        hpBefore: 1000,
        defenderBlockChancePercent: 100,
        defenderBlockReductionPercent: 50,
        rng: () => 0,
      });
      expect(r.finalDamage).toBe(0);
      expect(r.isBlocked).toBe(false);
      expect(r.blockedDamage).toBe(0);
    });

    it('raw ignore le blocage', () => {
      const r = calculateCombatDamage({
        ...base,
        damageType: 'raw',
        defenderBlockChancePercent: 100,
        defenderBlockReductionPercent: 50,
        rng: () => 0,
      });
      expect(r.isBlocked).toBe(false);
      expect(r.finalDamage).toBe(100); // raw ignore armure ET blocage
    });

    it('un hit esquivé ne peut pas être bloqué (0 dégât, isBlocked false)', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderDodgeChancePercent: 100,
        defenderBlockChancePercent: 100,
        defenderBlockReductionPercent: 50,
        rng: () => 0, // esquive court-circuite avant le blocage
      });
      expect(r.isDodged).toBe(true);
      expect(r.isBlocked).toBe(false);
      expect(r.finalDamage).toBe(0);
    });

    it('blockReduction 100 % → dégâts entièrement absorbés', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderBlockChancePercent: 100,
        defenderBlockReductionPercent: 100,
        rng: () => 0,
      });
      expect(r.isBlocked).toBe(true);
      expect(r.finalDamage).toBe(0);
      expect(r.blockedDamage).toBe(60);
    });

    it('blockReduction négatif / NaN → 0 (blocage sans effet)', () => {
      const neg = calculateCombatDamage({
        ...base,
        defenderBlockChancePercent: 100,
        defenderBlockReductionPercent: -50,
        rng: () => 0,
      });
      expect(neg.isBlocked).toBe(true);
      expect(neg.finalDamage).toBe(60); // réduction 0
      expect(neg.blockedDamage).toBe(0);
    });
  });

  // ── V4-I : parade (résolue EN PREMIER, avant l'esquive) ────────────────────
  describe('parade (V4-I)', () => {
    const base = {
      attackerValue: 100,
      targetDefense: 40,
      minimumAttack: 0,
      minimumDamage: 1,
      hpBefore: 1000,
    };

    it('defenderCanParry false → pas de parade même avec parryChance 100', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderCanParry: false,
        defenderParryChancePercent: 100,
        rng: () => 0,
      });
      expect(r.isParried).toBe(false);
      expect(r.defenderParryChancePercent).toBe(0); // effective 0 si non éligible
      expect(r.finalDamage).toBe(60);
    });

    it('defenderCanParry true + parryChance 100 → hit paré, 0 dégât', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderCanParry: true,
        defenderParryChancePercent: 100,
        rng: () => 0,
      });
      expect(r.isParried).toBe(true);
      expect(r.finalDamage).toBe(0);
      expect(r.hpAfter).toBe(1000); // PV inchangés
    });

    it('hit paré → ni esquive, ni critique, ni blocage, ni armure', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderCanParry: true,
        defenderParryChancePercent: 100,
        // Toutes ces mécaniques doivent être court-circuitées par la parade.
        defenderDodgeChancePercent: 100,
        criticalChancePercent: 100,
        criticalDamagePercent: 200,
        armorPenetrationPercent: 100,
        defenderBlockChancePercent: 100,
        defenderBlockReductionPercent: 100,
        rng: () => 0,
      });
      expect(r.isParried).toBe(true);
      expect(r.isDodged).toBe(false);
      expect(r.isCritical).toBe(false);
      expect(r.isBlocked).toBe(false);
      expect(r.blockedDamage).toBe(0);
      expect(r.effectiveArmor).toBe(0);
      expect(r.armorPenetrationPercent).toBe(0);
      expect(r.finalDamage).toBe(0);
    });

    it('parryChance 0 → pipeline normal (aucun roll de parade consommé)', () => {
      // rng renvoie toujours 0 : sans parade, le hit passe et applique l'armure.
      const r = calculateCombatDamage({
        ...base,
        defenderCanParry: true,
        defenderParryChancePercent: 0,
        rng: () => 0,
      });
      expect(r.isParried).toBe(false);
      expect(r.finalDamage).toBe(60);
    });

    it('parade prioritaire sur l\'esquive : roll bas → paré, pas esquivé', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderCanParry: true,
        defenderParryChancePercent: 100,
        defenderDodgeChancePercent: 100,
        rng: () => 0,
      });
      expect(r.isParried).toBe(true);
      expect(r.isDodged).toBe(false);
    });

    it('parryChance négative / NaN / Infinity → 0 (safe)', () => {
      for (const bad of [-50, Number.NaN, Number.POSITIVE_INFINITY]) {
        const r = calculateCombatDamage({
          ...base,
          defenderCanParry: true,
          defenderParryChancePercent: bad,
          rng: () => 0,
        });
        expect(r.isParried).toBe(false);
        expect(r.defenderParryChancePercent).toBe(0);
      }
    });

    it('parryChance > 100 clampée à 100', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderCanParry: true,
        defenderParryChancePercent: 150,
        rng: () => 0.99, // 0.99 < 1.0 (100 %) → toujours paré
      });
      expect(r.defenderParryChancePercent).toBe(100);
      expect(r.isParried).toBe(true);
    });

    it('roll au-dessus du seuil → pas de parade', () => {
      const r = calculateCombatDamage({
        ...base,
        defenderCanParry: true,
        defenderParryChancePercent: 25,
        rng: () => 0.5, // 0.5 >= 0.25
      });
      expect(r.isParried).toBe(false);
      expect(r.finalDamage).toBe(60);
    });
  });
});
