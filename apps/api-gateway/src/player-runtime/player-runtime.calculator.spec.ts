// apps/api-gateway/src/player-runtime/player-runtime.calculator.spec.ts

import { PlayerRuntimeCalculator } from './player-runtime.calculator';
import { Character } from '../characters/entities/character.entity';

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

describe('PlayerRuntimeCalculator', () => {
  describe('calculateBaseStats', () => {
    it('extrait les stats de base depuis Character', () => {
      const character = makeCharacter();
      const base = PlayerRuntimeCalculator.calculateBaseStats(character);

      expect(base.level).toBe(5);
      expect(base.health).toBe(80);
      expect(base.maxHealth).toBe(100);
      expect(base.attack).toBe(15);
      expect(base.defense).toBe(10);
      expect(base.experience).toBe(450);
    });

    it('accepte un personnage au niveau 1 avec stats par défaut', () => {
      const character = makeCharacter({
        level: 1,
        health: 100,
        maxHealth: 100,
        attack: 0,
        defense: 0,
        experience: 0,
      });
      const base = PlayerRuntimeCalculator.calculateBaseStats(character);

      expect(base.level).toBe(1);
      expect(base.attack).toBe(0);
      expect(base.defense).toBe(0);
    });
  });

  describe('calculateDerivedStats', () => {
    it('phase 1 : derived = copie des valeurs base', () => {
      const base = {
        level: 5,
        health: 80,
        maxHealth: 100,
        attack: 15,
        defense: 10,
        experience: 450,
      };
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base);

      expect(derived.maxHp).toBe(100);
      expect(derived.attackPower).toBe(15);
      expect(derived.defenseTotal).toBe(10);
    });

    it('phase 1 : speed / gatheringRange / attackRange valent 0', () => {
      const base = {
        level: 1,
        health: 100,
        maxHealth: 100,
        attack: 0,
        defense: 0,
        experience: 0,
      };
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base);

      expect(derived.speed).toBe(0);
      expect(derived.gatheringRange).toBe(0);
      expect(derived.attackRange).toBe(0);
    });

    it('maxHp reflète maxHealth et non health courant', () => {
      const base = {
        level: 3,
        health: 50,    // HP courant bas
        maxHealth: 120,
        attack: 10,
        defense: 5,
        experience: 200,
      };
      const derived = PlayerRuntimeCalculator.calculateDerivedStats(base);

      expect(derived.maxHp).toBe(120);
    });
  });
});
