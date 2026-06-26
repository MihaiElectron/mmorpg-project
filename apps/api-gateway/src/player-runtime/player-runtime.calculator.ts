// apps/api-gateway/src/player-runtime/player-runtime.calculator.ts

import { Character } from '../characters/entities/character.entity';
import {
  BaseStats,
  DerivedStats,
  RuntimeModifier,
  RuntimeTrace,
  StatKey,
} from './player-runtime.types';
import { RuntimeComputeEngine, BaseValueExtractor } from './runtime-compute';

/**
 * Valeur de base de chaque StatKey dérivée depuis BaseStats.
 * Quand une stat n'a pas encore de source dans Character, elle vaut 0.
 */
export const PLAYER_DERIVED_BASE: Record<StatKey, (b: BaseStats) => number> = {
  maxHp:          (b) => b.maxHealth,
  attackPower:    (b) => b.attack,
  defenseTotal:   (b) => b.defense,
  speed:          () => 0,
  gatheringRange: () => 0,
  attackRange:    () => 0,
};

export const PLAYER_STAT_KEYS: StatKey[] = [
  'maxHp',
  'attackPower',
  'defenseTotal',
  'speed',
  'gatheringRange',
  'attackRange',
];

/**
 * Calculs purs — aucune I/O, aucune dépendance injectable.
 * Toutes les méthodes sont statiques et testables en isolation.
 *
 * Pipeline de calcul :
 *   Character → BaseStats → RuntimeModifier[] → DerivedStats
 *
 * Délègue le pipeline de modifiers à RuntimeComputeEngine.
 */
export class PlayerRuntimeCalculator {
  static calculateBaseStats(character: Character): BaseStats {
    return {
      level: character.level,
      health: character.health,
      maxHealth: character.maxHealth,
      attack: character.attack,
      defense: character.defense,
      experience: character.experience,
    };
  }

  /**
   * Calcule DerivedStats depuis BaseStats et une liste de modifiers.
   * Sans modifiers (ou liste vide), produit le même résultat qu'en Phase 1.
   */
  static calculateDerivedStats(
    base: BaseStats,
    modifiers: RuntimeModifier[] = [],
  ): DerivedStats {
    const extract: BaseValueExtractor = (stat) => PLAYER_DERIVED_BASE[stat](base);
    return RuntimeComputeEngine.compute<DerivedStats>(PLAYER_STAT_KEYS, extract, modifiers);
  }

  /**
   * Calcule DerivedStats et produit une trace complète par stat.
   * Utilisé par l'API /trace et le Studio SDK.
   */
  static calculateWithTrace(
    base: BaseStats,
    modifiers: RuntimeModifier[] = [],
  ): { derived: DerivedStats; trace: RuntimeTrace } {
    const extract: BaseValueExtractor = (stat) => PLAYER_DERIVED_BASE[stat](base);
    return RuntimeComputeEngine.computeWithTrace<DerivedStats>(PLAYER_STAT_KEYS, extract, modifiers);
  }
}
