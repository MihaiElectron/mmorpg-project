// apps/api-gateway/src/player-runtime/player-runtime.calculator.ts

import { Character } from '../characters/entities/character.entity';
import { BaseStats, DerivedStats } from './player-runtime.types';

/**
 * Calculs purs — aucune I/O, aucune dépendance injectable.
 * Toutes les méthodes sont statiques et testables en isolation.
 *
 * Phase 1 : DerivedStats = copie directe des BaseStats.
 * Phase suivante : ajouter la contribution Equipment une fois
 * que CharacterService.recalculateStats() sera implémentée.
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
   * Phase 1 : aucune contribution Equipment/Buff/Talent.
   * speed / gatheringRange / attackRange documentés mais pas encore de
   * valeurs dans Character — retournés à 0.
   */
  static calculateDerivedStats(base: BaseStats): DerivedStats {
    return {
      maxHp: base.maxHealth,
      attackPower: base.attack,
      defenseTotal: base.defense,
      speed: 0,
      gatheringRange: 0,
      attackRange: 0,
    };
  }
}
