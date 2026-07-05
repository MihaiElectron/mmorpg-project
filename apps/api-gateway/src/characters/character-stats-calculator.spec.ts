import { CharacterStatsCalculator } from './character-stats-calculator';
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
    baseCritical: 0,
    unspentStatPoints: 0,
    ...overrides,
  } as Character;
}

describe('CharacterStatsCalculator', () => {
  describe('base / modifiers / final', () => {
    it("reflete les stats principales de base du personnage", () => {
      const character = makeCharacter({ baseStrength: 3, baseVitality: 4, baseCritical: 2 });
      const stats = CharacterStatsCalculator.compute(character);

      expect(stats.base.strength).toBe(3);
      expect(stats.base.vitality).toBe(4);
      expect(stats.base.critical).toBe(2);
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

    it("criticalChance = critical * 0.5 avec cap a 50", () => {
      expect(CharacterStatsCalculator.compute(makeCharacter({ baseCritical: 10 })).derived.criticalChance).toBe(5);
      expect(CharacterStatsCalculator.compute(makeCharacter({ baseCritical: 999 })).derived.criticalChance).toBe(50);
    });

    it("criticalDamage = 150 + critical * 1", () => {
      expect(CharacterStatsCalculator.compute(makeCharacter({ baseCritical: 20 })).derived.criticalDamage).toBe(170);
    });

    it("dodgeChance = agility * 0.3 avec cap a 40", () => {
      expect(CharacterStatsCalculator.compute(makeCharacter({ baseAgility: 10 })).derived.dodgeChance).toBe(3);
      expect(CharacterStatsCalculator.compute(makeCharacter({ baseAgility: 999 })).derived.dodgeChance).toBe(40);
    });

    it("accuracy = dexterity * 0.5", () => {
      expect(CharacterStatsCalculator.compute(makeCharacter({ baseDexterity: 8 })).derived.accuracy).toBe(4);
    });

    it("initiative = agility + dexterity", () => {
      const stats = CharacterStatsCalculator.compute(makeCharacter({ baseAgility: 6, baseDexterity: 4 }));
      expect(stats.derived.initiative).toBe(10);
    });

    it("ne modifie pas les valeurs brutes quand toutes les stats sont a 0", () => {
      const stats = CharacterStatsCalculator.compute(makeCharacter({ maxHealth: 120, attack: 15, defense: 7 }));
      expect(stats.derived.maxHealth).toBe(120);
      expect(stats.derived.physicalAttack).toBe(15);
      expect(stats.derived.defense).toBe(7);
    });
  });
});
