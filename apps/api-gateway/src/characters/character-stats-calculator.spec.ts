import { CharacterStatsCalculator, applyDerivedStatModifiers } from './character-stats-calculator';
import { Character } from './entities/character.entity';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Hero",
    level: 1,
    health: 100,
    maxHealth: 100,
    experience: 0,
    baseAttack: 0,
    baseDefense: 0,
    attack: 10,
    defense: 5,
    baseStrength: 0,
    baseVitality: 0,
    baseEndurance: 0,
    baseAgility: 0,
    baseDexterity: 0,
    baseIntelligence: 0,
    baseWisdom: 0,
    baseSpirit: 0,
    baseWillpower: 0,
    baseCharisma: 0,
    baseCritical: 0,
    unspentStatPoints: 0,
    ...overrides,
  } as Character;
}

describe('CharacterStatsCalculator', () => {
  describe('base / modifiers / final', () => {
    it("reflete les stats principales de base du personnage (10 primaires)", () => {
      const character = makeCharacter({ baseStrength: 3, baseVitality: 4, baseCharisma: 2 });
      const stats = CharacterStatsCalculator.compute(character);

      expect(stats.base.strength).toBe(3);
      expect(stats.base.vitality).toBe(4);
      expect(stats.base.charisma).toBe(2);
      expect(stats.base).not.toHaveProperty('critical');
    });

    it("laisse tous les modifiers a 0 en V1", () => {
      const stats = CharacterStatsCalculator.compute(makeCharacter({ baseStrength: 5 }));

      for (const bucket of ["equipment", "buffs", "passives", "debuffs"] as const) {
        const mod = stats.modifiers[bucket];
        expect(Object.values(mod).every((v) => v === 0)).toBe(true);
      }
    });

    it("final = base tant que les modifiers sont a 0", () => {
      const character = makeCharacter({ baseStrength: 7, baseAgility: 2, baseDexterity: 3 });
      const stats = CharacterStatsCalculator.compute(character);

      expect(stats.final.strength).toBe(7);
      expect(stats.final.agility).toBe(2);
      expect(stats.final.dexterity).toBe(3);
    });
  });

  describe('equipmentModifier (Équipement V1-A)', () => {
    const zeroPrimary = () => ({
      strength: 0, vitality: 0, endurance: 0, agility: 0, dexterity: 0,
      intelligence: 0, wisdom: 0, spirit: 0, willpower: 0, charisma: 0,
    });

    it("sans equipmentModifier → comportement identique (equipment reste a 0)", () => {
      const character = makeCharacter({ baseStrength: 4 });
      const stats = CharacterStatsCalculator.compute(character);
      expect(stats.modifiers.equipment.strength).toBe(0);
      expect(stats.final.strength).toBe(4);
    });

    it("un bonus de force augmente final.strength et physicalAttack derive", () => {
      const character = makeCharacter({ attack: 10, baseStrength: 4 });
      const mod = { ...zeroPrimary(), strength: 5 };
      const stats = CharacterStatsCalculator.compute(character, undefined, mod);
      expect(stats.modifiers.equipment.strength).toBe(5);
      expect(stats.final.strength).toBe(9); // 4 base + 5 equip
      // physicalAttack = attack brut 10 + strength(9)*2 = 28 (vs 18 sans équipement)
      expect(stats.derived.physicalAttack).toBe(28);
    });

    it("un bonus d'intelligence augmente maxMana derive", () => {
      const character = makeCharacter({ baseIntelligence: 2 });
      const mod = { ...zeroPrimary(), intelligence: 3 };
      const stats = CharacterStatsCalculator.compute(character, undefined, mod);
      // maxMana = intelligence*10 + wisdom*5 → final int 5 → 50
      expect(stats.final.intelligence).toBe(5);
      expect(stats.derived.maxMana).toBe(50);
    });
  });

  describe('stats derivees (formules V1)', () => {
    it("maxHealth = maxHealth brut + vitality * 10", () => {
      const stats = CharacterStatsCalculator.compute(makeCharacter({ maxHealth: 100, baseVitality: 5 }));
      expect(stats.derived.maxHealth).toBe(150);
    });

    it("physicalAttack = attack brut + strength * 2", () => {
      const stats = CharacterStatsCalculator.compute(makeCharacter({ attack: 10, baseStrength: 4 }));
      expect(stats.derived.physicalAttack).toBe(18);
    });

    it("defense = defense brut + endurance * 1", () => {
      const stats = CharacterStatsCalculator.compute(makeCharacter({ defense: 5, baseEndurance: 3 }));
      expect(stats.derived.defense).toBe(8);
    });

    it("criticalChance = dexterity * 0.3 + agility * 0.2, cap a 50 (Critique n'est plus une primaire)", () => {
      expect(CharacterStatsCalculator.compute(makeCharacter({ baseDexterity: 10, baseAgility: 5 })).derived.criticalChance).toBe(4);
      expect(CharacterStatsCalculator.compute(makeCharacter({ baseDexterity: 999 })).derived.criticalChance).toBe(50);
    });

    it("criticalDamage = 150 + dexterity * 1", () => {
      expect(CharacterStatsCalculator.compute(makeCharacter({ baseDexterity: 20 })).derived.criticalDamage).toBe(170);
    });

    it("dodgeChance = agility * 0.3 avec cap a 40", () => {
      expect(CharacterStatsCalculator.compute(makeCharacter({ baseAgility: 10 })).derived.dodgeChance).toBe(3);
      expect(CharacterStatsCalculator.compute(makeCharacter({ baseAgility: 999 })).derived.dodgeChance).toBe(40);
    });

    it("accuracy = dexterity * 0.5", () => {
      expect(CharacterStatsCalculator.compute(makeCharacter({ baseDexterity: 8 })).derived.accuracy).toBe(4);
    });

    it("maxMana = intelligence * 10 + wisdom * 5", () => {
      const stats = CharacterStatsCalculator.compute(makeCharacter({ baseIntelligence: 3, baseWisdom: 2 }));
      expect(stats.derived.maxMana).toBe(40);
    });

    it("magicalResistanceFire/Water/Air/Earth utilisent chacune Esprit + une primaire dediee", () => {
      const stats = CharacterStatsCalculator.compute(makeCharacter({
        baseSpirit: 10, baseWisdom: 5, baseIntelligence: 5, baseAgility: 5, baseEndurance: 5,
      }));
      expect(stats.derived.magicalResistanceFire).toBe(6);
      expect(stats.derived.magicalResistanceWater).toBe(6);
      expect(stats.derived.magicalResistanceAir).toBe(6);
      expect(stats.derived.magicalResistanceEarth).toBe(6);
    });

    it("controlResistance = willpower * 0.4 avec cap a 50", () => {
      expect(CharacterStatsCalculator.compute(makeCharacter({ baseWillpower: 10 })).derived.controlResistance).toBe(4);
      expect(CharacterStatsCalculator.compute(makeCharacter({ baseWillpower: 999 })).derived.controlResistance).toBe(50);
    });

    it("threatGeneration = charisma * 0.5 + strength * 0.3", () => {
      const stats = CharacterStatsCalculator.compute(makeCharacter({ baseCharisma: 4, baseStrength: 10 }));
      expect(stats.derived.threatGeneration).toBe(5);
    });

    it("ne modifie pas les valeurs brutes quand toutes les stats sont a 0", () => {
      const stats = CharacterStatsCalculator.compute(makeCharacter({ maxHealth: 120, attack: 15, defense: 7 }));
      expect(stats.derived.maxHealth).toBe(120);
      expect(stats.derived.physicalAttack).toBe(15);
      expect(stats.derived.defense).toBe(7);
    });
  });

  // ─── Modificateurs post-dérivées (Mastery Effects V2) ──────────────────────
  describe("derivedModifiers (post-dérivées)", () => {
    it("applique percent puis flat : stat × (1 + %/100) + flat", () => {
      const stats = CharacterStatsCalculator.compute(
        makeCharacter({ maxHealth: 100, attack: 20, defense: 0 }),
        undefined,
        undefined,
        { percent: { maxHealth: 10, physicalAttack: 50 }, flat: { maxHealth: 5 } },
      );
      // maxHealth : 100 × 1.10 + 5 = 115 ; physicalAttack : 20 × 1.5 = 30.
      expect(stats.derived.maxHealth).toBeCloseTo(115, 9);
      expect(stats.derived.physicalAttack).toBeCloseTo(30, 9);
    });

    it("sans modificateurs : comportement identique à l'historique", () => {
      const withEmpty = CharacterStatsCalculator.compute(
        makeCharacter({ maxHealth: 120, attack: 15, defense: 7 }),
        undefined,
        undefined,
        { percent: {}, flat: {} },
      );
      const without = CharacterStatsCalculator.compute(
        makeCharacter({ maxHealth: 120, attack: 15, defense: 7 }),
      );
      expect(withEmpty.derived).toEqual(without.derived);
    });

    it("applyDerivedStatModifiers est défensif : NaN/Infinity ignorés, plancher 0", () => {
      const derived = CharacterStatsCalculator.compute(
        makeCharacter({ maxHealth: 100 }),
      ).derived;
      const result = applyDerivedStatModifiers(derived, {
        percent: { maxHealth: NaN },
        flat: { maxMana: -99999, defense: Infinity },
      });
      expect(result.maxHealth).toBe(derived.maxHealth); // NaN ignoré
      expect(result.maxMana).toBe(0); // plancher 0, jamais négatif
      expect(result.defense).toBe(derived.defense); // Infinity → inchangé
    });
  });
});
