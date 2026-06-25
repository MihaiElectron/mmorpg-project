// apps/api-gateway/src/player-runtime/player-runtime.calculator.spec.ts

import { PlayerRuntimeCalculator } from './player-runtime.calculator';
import { Character } from '../characters/entities/character.entity';
import { RuntimeModifier } from './player-runtime.types';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return Object.assign(new Character(), {
    id: 'char-1',
    name: 'TestHero',
    level: 5,
    health: 80,
    maxHealth: 100,
    attack: 15,
    defense: 10,
    experience: 450,
    worldX: 1024,
    worldY: 2048,
    mapId: 1,
    positionX: 400,
    positionY: 300,
    sex: 'male',
    userId: 'user-1',
    ...overrides,
  } as Character);
}

function makeModifier(overrides: Partial<RuntimeModifier>): RuntimeModifier {
  return {
    id: 'mod-1',
    sourceType: 'equipment',
    sourceId: 'item-1',
    sourceLabel: 'Iron Sword',
    targetStat: 'attackPower',
    operation: 'flat',
    value: 5,
    priority: 10,
    enabled: true,
    ...overrides,
  };
}

describe('PlayerRuntimeCalculator', () => {
  describe('calculateBaseStats', () => {
    it('extrait les stats de base depuis Character', () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter());

      expect(base.level).toBe(5);
      expect(base.health).toBe(80);
      expect(base.maxHealth).toBe(100);
      expect(base.attack).toBe(15);
      expect(base.defense).toBe(10);
      expect(base.experience).toBe(450);
    });

    it('accepte un personnage niveau 1 avec stats par défaut', () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(
        makeCharacter({ level: 1, health: 100, maxHealth: 100, attack: 0, defense: 0, experience: 0 }),
      );

      expect(base.level).toBe(1);
      expect(base.attack).toBe(0);
    });
  });

  describe('calculateDerivedStats — sans modifiers', () => {
    it('phase 2 sans modifiers : résultat identique à phase 1', () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter());
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, []);

      expect(derived.maxHp).toBe(100);
      expect(derived.attackPower).toBe(15);
      expect(derived.defenseTotal).toBe(10);
    });

    it('speed / gatheringRange / attackRange valent 0 sans modifiers', () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter());
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base);

      expect(derived.speed).toBe(0);
      expect(derived.gatheringRange).toBe(0);
      expect(derived.attackRange).toBe(0);
    });

    it('maxHp reflète maxHealth et non health courant', () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(
        makeCharacter({ health: 50, maxHealth: 120 }),
      );
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base);

      expect(derived.maxHp).toBe(120);
    });
  });

  describe('calculateDerivedStats — flat modifiers', () => {
    it('ajoute un flat modifier sur attackPower', () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter({ attack: 10 }));
      const mod = makeModifier({ targetStat: 'attackPower', operation: 'flat', value: 5 });
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, [mod]);

      expect(derived.attackPower).toBe(15);
    });

    it('somme plusieurs flat modifiers sur la même stat', () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter({ maxHealth: 100 }));
      const mods = [
        makeModifier({ id: 'm1', targetStat: 'maxHp', operation: 'flat', value: 20 }),
        makeModifier({ id: 'm2', targetStat: 'maxHp', operation: 'flat', value: 30 }),
      ];
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, mods);

      expect(derived.maxHp).toBe(150);
    });

    it("n'applique pas un modifier disabled", () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter({ attack: 10 }));
      const mod = makeModifier({ targetStat: 'attackPower', operation: 'flat', value: 99, enabled: false });
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, [mod]);

      expect(derived.attackPower).toBe(10);
    });

    it("n'applique pas un modifier ciblant une autre stat", () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter({ attack: 10 }));
      const mod = makeModifier({ targetStat: 'defenseTotal', operation: 'flat', value: 50 });
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, [mod]);

      expect(derived.attackPower).toBe(10);
      expect(derived.defenseTotal).toBe(60);
    });
  });

  describe('calculateDerivedStats — percent_add modifiers', () => {
    it('applique un percent_add sur maxHp', () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter({ maxHealth: 100 }));
      const mod = makeModifier({ targetStat: 'maxHp', operation: 'percent_add', value: 20 });
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, [mod]);

      expect(derived.maxHp).toBe(120);
    });

    it('somme deux percent_add avant application', () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter({ maxHealth: 100 }));
      const mods = [
        makeModifier({ id: 'm1', targetStat: 'maxHp', operation: 'percent_add', value: 10 }),
        makeModifier({ id: 'm2', targetStat: 'maxHp', operation: 'percent_add', value: 10 }),
      ];
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, mods);

      expect(derived.maxHp).toBe(120);
    });
  });

  describe('calculateDerivedStats — percent_multiply modifiers', () => {
    it('applique un percent_multiply sur defenseTotal', () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter({ defense: 100 }));
      const mod = makeModifier({ targetStat: 'defenseTotal', operation: 'percent_multiply', value: 50 });
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, [mod]);

      expect(derived.defenseTotal).toBe(150);
    });

    it("deux percent_multiply s'appliquent séquentiellement", () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter({ defense: 100 }));
      const mods = [
        makeModifier({ id: 'm1', targetStat: 'defenseTotal', operation: 'percent_multiply', value: 50, priority: 1 }),
        makeModifier({ id: 'm2', targetStat: 'defenseTotal', operation: 'percent_multiply', value: 50, priority: 2 }),
      ];
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, mods);

      expect(derived.defenseTotal).toBe(225);
    });
  });

  describe('calculateDerivedStats — pipeline complet', () => {
    it("applique flat → percent_add → percent_multiply dans l'ordre", () => {
      // base: 100
      // +20 flat → 120
      // +10% percent_add → 132
      // ×20% percent_multiply → 158 (Math.round(132 * 1.2) = 158)
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter({ maxHealth: 100 }));
      const mods = [
        makeModifier({ id: 'm1', targetStat: 'maxHp', operation: 'flat', value: 20 }),
        makeModifier({ id: 'm2', targetStat: 'maxHp', operation: 'percent_add', value: 10 }),
        makeModifier({ id: 'm3', targetStat: 'maxHp', operation: 'percent_multiply', value: 20 }),
      ];
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, mods);

      expect(derived.maxHp).toBe(158);
    });
  });

  describe('calculateWithTrace', () => {
    it('sans modifiers : trace vide pour chaque stat', () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter());
      const { derived, trace } = PlayerRuntimeCalculator.calculateWithTrace(base, []);

      expect(trace.modifierCount).toBe(0);
      expect(trace.stats.maxHp?.baseValue).toBe(100);
      expect(trace.stats.maxHp?.finalValue).toBe(100);
      expect(trace.stats.maxHp?.modifiers).toHaveLength(0);
      expect(derived.maxHp).toBe(100);
    });

    it('trace reflète un flat modifier', () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter({ attack: 10 }));
      const mod = makeModifier({
        id: 'mod-x',
        sourceLabel: 'Iron Sword',
        targetStat: 'attackPower',
        operation: 'flat',
        value: 5,
      });
      const { derived, trace } = PlayerRuntimeCalculator.calculateWithTrace(base, [mod]);

      expect(derived.attackPower).toBe(15);
      expect(trace.stats.attackPower?.baseValue).toBe(10);
      expect(trace.stats.attackPower?.finalValue).toBe(15);
      const app = trace.stats.attackPower?.modifiers[0];
      expect(app?.sourceLabel).toBe('Iron Sword');
      expect(app?.contribution).toBe(5);
      expect(trace.modifierCount).toBe(1);
    });

    it('trace reflète un percent_add — contribution calculée sur base + flats', () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter({ maxHealth: 100 }));
      const mods = [
        makeModifier({ id: 'm1', targetStat: 'maxHp', operation: 'flat', value: 20, priority: 1 }),
        makeModifier({ id: 'm2', targetStat: 'maxHp', operation: 'percent_add', value: 10, priority: 2 }),
      ];
      const { trace } = PlayerRuntimeCalculator.calculateWithTrace(base, mods);

      // base 100 + flat 20 = 120 ; 10% de 120 = 12
      const percentApp = trace.stats.maxHp?.modifiers.find((a) => a.operation === 'percent_add');
      expect(percentApp?.contribution).toBe(12);
      expect(trace.stats.maxHp?.finalValue).toBe(132);
    });

    it('computedAt est une Date', () => {
      const base = PlayerRuntimeCalculator.calculateBaseStats(makeCharacter());
      const { trace } = PlayerRuntimeCalculator.calculateWithTrace(base);

      expect(trace.computedAt).toBeInstanceOf(Date);
    });
  });
});
