// apps/api-gateway/src/player-runtime/player-runtime.calculator.ts

import { Character } from '../characters/entities/character.entity';
import {
  BaseStats,
  DerivedStats,
  ModifierApplication,
  ModifierOperation,
  RuntimeModifier,
  RuntimeTrace,
  StatKey,
  StatTrace,
} from './player-runtime.types';

/**
 * Valeur de base de chaque StatKey dérivée depuis BaseStats.
 * Quand une stat n'a pas encore de source dans Character, elle vaut 0.
 */
const DERIVED_BASE: Record<StatKey, (b: BaseStats) => number> = {
  maxHp:         (b) => b.maxHealth,
  attackPower:   (b) => b.attack,
  defenseTotal:  (b) => b.defense,
  speed:         () => 0,
  gatheringRange: () => 0,
  attackRange:   () => 0,
};

const ALL_STAT_KEYS: StatKey[] = [
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
 * Ordre d'application des modifiers (par stat) :
 *   1. flat          : addition directe, trié par priority
 *   2. percent_add   : somme de tous les %, appliquée une fois sur (base + flat)
 *   3. percent_multiply : chaque multiplicateur appliqué séquentiellement
 *
 * Les modifiers disabled sont ignorés silencieusement.
 * Le résultat est arrondi à l'entier.
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
    const result = {} as DerivedStats;
    for (const stat of ALL_STAT_KEYS) {
      result[stat] = PlayerRuntimeCalculator.applyModifiers(
        DERIVED_BASE[stat](base),
        stat,
        modifiers,
      );
    }
    return result;
  }

  /**
   * Calcule DerivedStats et produit une trace complète par stat.
   * Utilisé par l'API /trace et le futur Studio SDK.
   */
  static calculateWithTrace(
    base: BaseStats,
    modifiers: RuntimeModifier[] = [],
  ): { derived: DerivedStats; trace: RuntimeTrace } {
    const derived = {} as DerivedStats;
    const traceStats: Partial<Record<StatKey, StatTrace>> = {};

    for (const stat of ALL_STAT_KEYS) {
      const baseValue = DERIVED_BASE[stat](base);
      const { value, applications } = PlayerRuntimeCalculator.applyModifiersWithTrace(
        baseValue,
        stat,
        modifiers,
      );
      derived[stat] = value;
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

  private static applyModifiers(
    baseValue: number,
    stat: StatKey,
    modifiers: RuntimeModifier[],
  ): number {
    const flats       = PlayerRuntimeCalculator.filterAndSort(modifiers, stat, 'flat');
    const percentAdds = PlayerRuntimeCalculator.filterAndSort(modifiers, stat, 'percent_add');
    const percentMuls = PlayerRuntimeCalculator.filterAndSort(modifiers, stat, 'percent_multiply');

    if (flats.length === 0 && percentAdds.length === 0 && percentMuls.length === 0) {
      return baseValue;
    }

    let value = baseValue;

    for (const m of flats) {
      value += m.value;
    }

    const totalPercentAdd = percentAdds.reduce((sum, m) => sum + m.value, 0);
    value = value * (1 + totalPercentAdd / 100);

    for (const m of percentMuls) {
      value = value * (1 + m.value / 100);
    }

    return Math.round(value);
  }

  private static applyModifiersWithTrace(
    baseValue: number,
    stat: StatKey,
    modifiers: RuntimeModifier[],
  ): { value: number; applications: ModifierApplication[] } {
    const flats       = PlayerRuntimeCalculator.filterAndSort(modifiers, stat, 'flat');
    const percentAdds = PlayerRuntimeCalculator.filterAndSort(modifiers, stat, 'percent_add');
    const percentMuls = PlayerRuntimeCalculator.filterAndSort(modifiers, stat, 'percent_multiply');

    const applications: ModifierApplication[] = [];

    if (flats.length === 0 && percentAdds.length === 0 && percentMuls.length === 0) {
      return { value: baseValue, applications };
    }

    let value = baseValue;

    for (const m of flats) {
      applications.push(PlayerRuntimeCalculator.makeApplication(m, m.value));
      value += m.value;
    }

    const baseAfterFlats = value;
    const totalPercentAdd = percentAdds.reduce((sum, m) => sum + m.value, 0);
    for (const m of percentAdds) {
      const contribution = Math.round(baseAfterFlats * m.value / 100);
      applications.push(PlayerRuntimeCalculator.makeApplication(m, contribution));
    }
    value = value * (1 + totalPercentAdd / 100);

    for (const m of percentMuls) {
      const before = value;
      value = value * (1 + m.value / 100);
      const contribution = Math.round(value - before);
      applications.push(PlayerRuntimeCalculator.makeApplication(m, contribution));
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
