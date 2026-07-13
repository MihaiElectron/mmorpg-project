// apps/api-gateway/src/creature-runtime/creature-runtime.calculator.ts
//
// Calculs purs pour le Creature Runtime.
// Aucune I/O, aucune dépendance injectable — méthodes statiques uniquement.

import { Creature } from '../creatures/entities/creature.entity';
import { CreatureTemplate } from '../creatures/entities/creature-template.entity';
import {
  RuntimeModifier,
  RuntimeTrace,
  StatKey,
} from '../player-runtime/player-runtime.types';
import { RuntimeComputeEngine, BaseValueExtractor } from '../player-runtime/runtime-compute';
import { CreatureBaseStats, CreatureDerivedStats } from './creature-runtime.types';

// Stats dérivées calculées pour une créature (sous-ensemble de StatKey).
// gatheringRange est exclu — les créatures ne récoltent pas.
export const CREATURE_STAT_KEYS: StatKey[] = [
  'maxHp',
  'attackPower',
  'defenseTotal',
  'speed',
  'attackRange',
];

export type CreatureStatKey = Extract<
  StatKey,
  'maxHp' | 'attackPower' | 'defenseTotal' | 'speed' | 'attackRange'
>;

/**
 * Mapping des valeurs de base par stat dérivée.
 *
 * Phase 1 — sources :
 *   maxHp        → baseHealth (template)
 *   attackPower  → baseAttack (template)
 *   defenseTotal → baseArmor (template)
 *   speed        → speedMax (template) — vitesse plafond de patrouille
 *   attackRange  → 0 — MELEE_RANGE_WU est une constante dans CreaturesService,
 *                  pas encore exposée dans CreatureTemplate
 */
export const CREATURE_DERIVED_BASE: Record<CreatureStatKey, (b: CreatureBaseStats) => number> = {
  maxHp:        (b) => b.baseHealth,
  attackPower:  (b) => b.baseAttack,
  defenseTotal: (b) => b.baseArmor,
  speed:        (b) => b.speedMax,
  attackRange:  () => 0,
};

/**
 * Calculateur du Creature Runtime.
 *
 * Pipeline délégué à RuntimeComputeEngine — identique à PlayerRuntimeCalculator :
 *   CreatureBaseStats → RuntimeModifier[] → CreatureDerivedStats + RuntimeTrace
 *
 * Les constantes CREATURE_STAT_KEYS et CREATURE_DERIVED_BASE sont exportées
 * pour permettre une intégration directe depuis CreaturesService (Phase 2B)
 * sans passer par le service async.
 */
export class CreatureRuntimeCalculator {
  /**
   * Extrait les stats de base depuis une instance Creature + son template.
   */
  static calculateBaseStats(creature: Creature, template: CreatureTemplate): CreatureBaseStats {
    return {
      baseHealth:    template.baseHealth,
      baseArmor:     template.baseArmor,
      baseAttack:    template.baseAttack,
      currentHealth: creature.health,
      speedMin:      template.speedMin,
      speedMax:      template.speedMax,
      // Stats de combat avancées (V5-D2-A) — config brute du template.
      // Défauts sûrs si une colonne est absente (base non migrée) : 0, sauf
      // criticalDamage (150 = ×1.5, inerte tant que criticalChance = 0).
      healingPower:            template.healingPower ?? 0,
      criticalChance:          template.criticalChance ?? 0,
      criticalDamage:          template.criticalDamage ?? 150,
      accuracy:                template.accuracy ?? 0,
      armorPenetrationPercent: template.armorPenetrationPercent ?? 0,
    };
  }

  /**
   * Calcule CreatureDerivedStats + RuntimeTrace depuis les stats de base et les modifiers.
   *
   * Sans modifiers (liste vide), retourne les valeurs base sans modification.
   */
  static calculateWithTrace(
    base: CreatureBaseStats,
    modifiers: RuntimeModifier[] = [],
  ): { derived: CreatureDerivedStats; trace: RuntimeTrace } {
    const extract: BaseValueExtractor = (stat) =>
      CREATURE_DERIVED_BASE[stat as CreatureStatKey](base);
    return RuntimeComputeEngine.computeWithTrace<CreatureDerivedStats>(
      CREATURE_STAT_KEYS,
      extract,
      modifiers,
    );
  }
}
