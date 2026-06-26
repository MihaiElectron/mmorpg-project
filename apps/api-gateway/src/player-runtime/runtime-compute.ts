// apps/api-gateway/src/player-runtime/runtime-compute.ts
//
// Moteur de calcul générique Runtime — pipeline statique sans état ni DI.
//
// Extrait la logique commune à tous les calculateurs Entity Runtime :
//   filterAndSort, applyModifiersWithTrace, applyModifiers, makeApplication.
//
// Utilisé par PlayerRuntimeCalculator et CreatureRuntimeCalculator.
// Prévu pour tout futur Entity Runtime (NPC, Resource, Building).

import {
  ModifierApplication,
  ModifierOperation,
  RuntimeModifier,
  RuntimeTrace,
  StatKey,
  StatTrace,
} from './player-runtime.types';

/**
 * Extrait la valeur de base d'une stat depuis les stats de base de l'entité.
 * Paramétrisée par le type de BaseStats de chaque domaine.
 *
 * Usage :
 *   const extractBase = (stat: StatKey) => DERIVED_BASE[stat as PlayerStatKey](playerBase);
 *   const extractBase = (stat: StatKey) => CREATURE_DERIVED_BASE[stat as CreatureStatKey](creatureBase);
 */
export type BaseValueExtractor = (stat: StatKey) => number;

/**
 * Résultat d'un calcul RuntimeComputeEngine.computeWithTrace().
 */
export interface RuntimeComputeResult<TDerived extends object> {
  readonly derived: TDerived;
  readonly trace: RuntimeTrace;
}

/**
 * Moteur de calcul générique Runtime.
 *
 * Contrat :
 * - Aucune I/O — transformation en mémoire uniquement.
 * - Aucune dépendance injectable — méthodes statiques uniquement.
 * - Paramétrisé par TDerived (DerivedStats, CreatureDerivedStats…).
 * - statKeys détermine quelles stats sont calculées et présentes dans TDerived.
 *
 * Pipeline par stat (ordre invariant) :
 *   1. flat         : addition directe, trié par priority
 *   2. percent_add  : somme de tous les %, appliquée une fois sur (base + flat)
 *   3. percent_multiply : chaque multiplicateur appliqué séquentiellement
 *
 * Les modifiers disabled sont ignorés silencieusement.
 * Le résultat est arrondi à l'entier par stat.
 */
export class RuntimeComputeEngine {
  /**
   * Calcule TDerived avec trace complète.
   *
   * trace.modifierCount = nombre de modifiers enabled (pas seulement appliqués).
   * Utilisé par les endpoints de debug, le Studio SDK, et getRuntimeSnapshot().
   */
  static computeWithTrace<TDerived extends object>(
    statKeys: StatKey[],
    extractBase: BaseValueExtractor,
    modifiers: RuntimeModifier[] = [],
  ): RuntimeComputeResult<TDerived> {
    const traceStats: Partial<Record<StatKey, StatTrace>> = {};
    const derived: Record<string, number> = {};

    for (const stat of statKeys) {
      const baseValue = extractBase(stat);
      const { value, applications } = RuntimeComputeEngine.applyWithTrace(baseValue, stat, modifiers);
      derived[stat] = value;
      traceStats[stat] = { stat, baseValue, modifiers: applications, finalValue: value };
    }

    const trace: RuntimeTrace = {
      stats: traceStats,
      modifierCount: modifiers.filter((m) => m.enabled).length,
      computedAt: new Date(),
    };

    return { derived: derived as unknown as TDerived, trace };
  }

  /**
   * Calcule TDerived sans trace.
   *
   * Plus léger que computeWithTrace — conçu pour les chemins chauds (hot path IA/combat)
   * où la trace n'est pas nécessaire.
   *
   * Produit le même résultat numérique que computeWithTrace().derived.
   */
  static compute<TDerived extends object>(
    statKeys: StatKey[],
    extractBase: BaseValueExtractor,
    modifiers: RuntimeModifier[] = [],
  ): TDerived {
    const derived: Record<string, number> = {};
    for (const stat of statKeys) {
      derived[stat] = RuntimeComputeEngine.apply(extractBase(stat), stat, modifiers);
    }
    return derived as unknown as TDerived;
  }

  // ─── Pipeline interne ─────────────────────────────────────────────────────────

  private static filterAndSort(
    modifiers: RuntimeModifier[],
    stat: StatKey,
    op: ModifierOperation,
  ): RuntimeModifier[] {
    return modifiers
      .filter((m) => m.enabled && m.targetStat === stat && m.operation === op)
      .sort((a, b) => a.priority - b.priority);
  }

  private static applyWithTrace(
    baseValue: number,
    stat: StatKey,
    modifiers: RuntimeModifier[],
  ): { value: number; applications: ModifierApplication[] } {
    const flats       = RuntimeComputeEngine.filterAndSort(modifiers, stat, 'flat');
    const percentAdds = RuntimeComputeEngine.filterAndSort(modifiers, stat, 'percent_add');
    const percentMuls = RuntimeComputeEngine.filterAndSort(modifiers, stat, 'percent_multiply');

    const applications: ModifierApplication[] = [];

    if (flats.length === 0 && percentAdds.length === 0 && percentMuls.length === 0) {
      return { value: baseValue, applications };
    }

    let value = baseValue;

    for (const m of flats) {
      applications.push(RuntimeComputeEngine.makeApplication(m, m.value));
      value += m.value;
    }

    const baseAfterFlats = value;
    const totalPercentAdd = percentAdds.reduce((sum, m) => sum + m.value, 0);
    for (const m of percentAdds) {
      const contribution = Math.round(baseAfterFlats * m.value / 100);
      applications.push(RuntimeComputeEngine.makeApplication(m, contribution));
    }
    value = value * (1 + totalPercentAdd / 100);

    for (const m of percentMuls) {
      const before = value;
      value = value * (1 + m.value / 100);
      const contribution = Math.round(value - before);
      applications.push(RuntimeComputeEngine.makeApplication(m, contribution));
    }

    return { value: Math.round(value), applications };
  }

  private static apply(
    baseValue: number,
    stat: StatKey,
    modifiers: RuntimeModifier[],
  ): number {
    const flats       = RuntimeComputeEngine.filterAndSort(modifiers, stat, 'flat');
    const percentAdds = RuntimeComputeEngine.filterAndSort(modifiers, stat, 'percent_add');
    const percentMuls = RuntimeComputeEngine.filterAndSort(modifiers, stat, 'percent_multiply');

    if (flats.length === 0 && percentAdds.length === 0 && percentMuls.length === 0) {
      return baseValue;
    }

    let value = baseValue;
    for (const m of flats) { value += m.value; }
    const totalPercentAdd = percentAdds.reduce((sum, m) => sum + m.value, 0);
    value = value * (1 + totalPercentAdd / 100);
    for (const m of percentMuls) { value = value * (1 + m.value / 100); }
    return Math.round(value);
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
