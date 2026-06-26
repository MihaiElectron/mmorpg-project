// apps/api-gateway/src/creature-runtime/creature-runtime.calculator.ts
//
// Calculs purs pour le Creature Runtime.
// Aucune I/O, aucune dépendance injectable — méthodes statiques uniquement.

import { Creature } from '../creatures/entities/creature.entity';
import { CreatureTemplate } from '../creatures/entities/creature-template.entity';
import {
  ModifierApplication,
  ModifierOperation,
  RuntimeModifier,
  RuntimeTrace,
  StatKey,
  StatTrace,
} from '../player-runtime/player-runtime.types';
import { CreatureBaseStats, CreatureDerivedStats } from './creature-runtime.types';

// Stats dérivées calculées pour une créature (sous-ensemble de StatKey).
// gatheringRange est exclu — les créatures ne récoltent pas.
const CREATURE_STAT_KEYS: StatKey[] = [
  'maxHp',
  'attackPower',
  'defenseTotal',
  'speed',
  'attackRange',
];

type CreatureStatKey = Extract<
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
const CREATURE_DERIVED_BASE: Record<CreatureStatKey, (b: CreatureBaseStats) => number> = {
  maxHp:        (b) => b.baseHealth,
  attackPower:  (b) => b.baseAttack,
  defenseTotal: (b) => b.baseArmor,
  speed:        (b) => b.speedMax,
  attackRange:  () => 0,
};

/**
 * Calculateur du Creature Runtime.
 *
 * Pipeline identique au PlayerRuntimeCalculator :
 *   CreatureBaseStats → RuntimeModifier[] → CreatureDerivedStats + RuntimeTrace
 *
 * Ordre d'application par stat :
 *   1. flat         : addition directe, trié par priority
 *   2. percent_add  : somme de tous les %, appliquée une fois sur (base + flat)
 *   3. percent_multiply : chaque multiplicateur séquentiel
 *
 * Les modifiers disabled sont ignorés silencieusement.
 * Le résultat est arrondi à l'entier.
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
    };
  }

  /**
   * Calcule CreatureDerivedStats + RuntimeTrace depuis les stats de base et les modifiers.
   *
   * Sans modifiers (liste vide), retourne les valeurs base sans modification.
   * La trace inclut uniquement les stats touchées par au moins un modifier.
   */
  static calculateWithTrace(
    base: CreatureBaseStats,
    modifiers: RuntimeModifier[] = [],
  ): { derived: CreatureDerivedStats; trace: RuntimeTrace } {
    const derived = {} as CreatureDerivedStats;
    const traceStats: Partial<Record<StatKey, StatTrace>> = {};

    for (const stat of CREATURE_STAT_KEYS) {
      const statKey = stat as CreatureStatKey;
      const baseValue = CREATURE_DERIVED_BASE[statKey](base);
      const { value, applications } = CreatureRuntimeCalculator.applyModifiersWithTrace(
        baseValue,
        stat,
        modifiers,
      );
      derived[statKey] = value;
      traceStats[stat] = { stat, baseValue, modifiers: applications, finalValue: value };
    }

    const enabledCount = modifiers.filter((m) => m.enabled).length;

    return {
      derived,
      trace: {
        stats: traceStats,
        modifierCount: enabledCount,
        computedAt: new Date(),
      },
    };
  }

  // ─── Méthodes privées ────────────────────────────────────────────────────────

  private static filterAndSort(
    modifiers: RuntimeModifier[],
    stat: StatKey,
    op: ModifierOperation,
  ): RuntimeModifier[] {
    return modifiers
      .filter((m) => m.enabled && m.targetStat === stat && m.operation === op)
      .sort((a, b) => a.priority - b.priority);
  }

  private static applyModifiersWithTrace(
    baseValue: number,
    stat: StatKey,
    modifiers: RuntimeModifier[],
  ): { value: number; applications: ModifierApplication[] } {
    const flats       = CreatureRuntimeCalculator.filterAndSort(modifiers, stat, 'flat');
    const percentAdds = CreatureRuntimeCalculator.filterAndSort(modifiers, stat, 'percent_add');
    const percentMuls = CreatureRuntimeCalculator.filterAndSort(modifiers, stat, 'percent_multiply');

    const applications: ModifierApplication[] = [];

    if (flats.length === 0 && percentAdds.length === 0 && percentMuls.length === 0) {
      return { value: baseValue, applications };
    }

    let value = baseValue;

    for (const m of flats) {
      applications.push(CreatureRuntimeCalculator.makeApplication(m, m.value));
      value += m.value;
    }

    const baseAfterFlats = value;
    const totalPercentAdd = percentAdds.reduce((sum, m) => sum + m.value, 0);
    for (const m of percentAdds) {
      const contribution = Math.round(baseAfterFlats * m.value / 100);
      applications.push(CreatureRuntimeCalculator.makeApplication(m, contribution));
    }
    value = value * (1 + totalPercentAdd / 100);

    for (const m of percentMuls) {
      const before = value;
      value = value * (1 + m.value / 100);
      const contribution = Math.round(value - before);
      applications.push(CreatureRuntimeCalculator.makeApplication(m, contribution));
    }

    return { value: Math.round(value), applications };
  }

  private static makeApplication(
    m: RuntimeModifier,
    contribution: number,
  ): ModifierApplication {
    return {
      modifierId: m.id,
      sourceType: m.sourceType,
      sourceId: m.sourceId,
      sourceLabel: m.sourceLabel,
      operation: m.operation,
      value: m.value,
      contribution,
    };
  }
}
