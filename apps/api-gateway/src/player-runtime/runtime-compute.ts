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
  AppliedContribution,
  ContributionSign,
  FilteredContribution,
  ModifierApplication,
  ModifierOperation,
  RoundingPolicy,
  RuntimeModifier,
  RuntimeTrace,
  StatContributionFilter,
  StatKey,
  StatResolutionError,
  StatResolutionInput,
  StatResolutionResult,
  StatTrace,
} from './player-runtime.types';

/** Opérations connues du resolver mono-stat (validation runtime défensive). */
const KNOWN_OPERATIONS: ReadonlySet<ModifierOperation> =
  new Set<ModifierOperation>(['flat', 'percent_add', 'percent_multiply', 'override']);

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

  // ─── Resolver mono-stat (Lot 1 — ADR-0021) ──────────────────────────────────
  //
  // Pipeline PUR, déterministe, d'UNE statistique :
  //   base → contributions → filtres → flat → percent_add → percent_multiply
  //   → override → caps → arrondi → résultat + trace enrichie.
  //
  // Indépendant de tout domaine : ne connaît que des contributions déjà
  // collectées. N'altère AUCUN comportement de `compute`/`computeWithTrace`.
  // Les erreurs de CONFIGURATION lèvent une `StatResolutionError` typée (pure,
  // sans dépendance NestJS). Aucun arrondi intermédiaire ; arrondi final unique.

  /**
   * Résout une statistique unique selon le pipeline Lot 1.
   *
   * Déterminisme : flat/percent_add sont sommés (commutatif), percent_multiply
   * est un produit (commutatif), l'override retenu est celui de priorité MAX
   * (égalité au sommet = erreur), les facteurs de filtres sont multipliés
   * (commutatif). Le résultat ne dépend donc pas de l'ordre d'entrée.
   */
  static resolveStat(input: StatResolutionInput): StatResolutionResult {
    const { stat, baseValue } = input;
    const rounding: RoundingPolicy = input.rounding ?? 'none';
    const filters = input.filters ?? [];

    // ── Validation de configuration (déterministe, explicite) ─────────────────
    RuntimeComputeEngine.assertFiniteValue(baseValue, 'baseValue');

    const capMin = input.caps?.min;
    const capMax = input.caps?.max;
    if (capMin !== undefined) {
      RuntimeComputeEngine.assertFiniteValue(capMin, 'caps.min');
    }
    if (capMax !== undefined) {
      RuntimeComputeEngine.assertFiniteValue(capMax, 'caps.max');
    }
    if (capMin !== undefined && capMax !== undefined && capMin > capMax) {
      throw new StatResolutionError(
        'INVALID_CAPS',
        `caps.min (${capMin}) est supérieur à caps.max (${capMax})`,
        { min: capMin, max: capMax },
      );
    }

    for (const f of filters) {
      if (
        typeof f.scale !== 'number' ||
        !Number.isFinite(f.scale) ||
        f.scale < 0
      ) {
        throw new StatResolutionError(
          'INVALID_FILTER_SCALE',
          `Facteur de filtre invalide (${f.scale}) — attendu fini et ≥ 0`,
          { filterId: f.id, scale: f.scale },
        );
      }
    }

    // ── 1. Collecte : contributions enabled visant CETTE stat ─────────────────
    const received = input.contributions.filter(
      (m) => m.enabled && m.targetStat === stat,
    );

    for (const m of received) {
      if (!KNOWN_OPERATIONS.has(m.operation)) {
        throw new StatResolutionError(
          'UNKNOWN_OPERATION',
          `Opération inconnue "${String(m.operation)}" (modifier ${m.id})`,
          { modifierId: m.id, operation: m.operation },
        );
      }
      RuntimeComputeEngine.assertFiniteValue(m.value, `modifier ${m.id} value`);
      if (typeof m.priority !== 'number' || !Number.isFinite(m.priority)) {
        throw new StatResolutionError(
          'INVALID_PRIORITY',
          `Priorité invalide (${m.priority}) pour le modifier ${m.id}`,
          { modifierId: m.id, priority: m.priority },
        );
      }
    }

    // ── 2. Filtres : réduction/exclusion AVANT calcul (jamais la valeur finale)
    const applied: AppliedContribution[] = [];
    const filtered: FilteredContribution[] = [];
    const kept: {
      m: RuntimeModifier;
      effectiveValue: number;
      scale: number;
    }[] = [];

    for (const m of received) {
      const sign = RuntimeComputeEngine.contributionSign(m);
      const matching = filters.filter((f) =>
        RuntimeComputeEngine.filterMatches(f, m, sign),
      );

      if (matching.length === 0) {
        kept.push({ m, effectiveValue: m.value, scale: 1 });
        continue;
      }

      let scale = 1;
      const reasons: string[] = [];
      for (const f of matching) {
        scale *= f.scale;
        reasons.push(f.reason ?? f.id ?? RuntimeComputeEngine.describeFilter(f));
      }

      if (scale === 0) {
        filtered.push({
          modifierId: m.id,
          sourceType: m.sourceType,
          sourceId: m.sourceId,
          operation: m.operation,
          originalValue: m.value,
          scale: 0,
          excluded: true,
          reasons,
        });
        continue;
      }

      // scale > 0 : contribution conservée (réduite pour flat/percent_*, ou
      // inchangée pour un override — pas d'élément neutre pour un remplacement).
      const isOverride = m.operation === 'override';
      const effectiveValue = isOverride ? m.value : m.value * scale;
      kept.push({ m, effectiveValue, scale: isOverride ? 1 : scale });
      if (scale !== 1) {
        filtered.push({
          modifierId: m.id,
          sourceType: m.sourceType,
          sourceId: m.sourceId,
          operation: m.operation,
          originalValue: m.value,
          scale,
          excluded: false,
          reasons,
        });
      }
    }

    // Ordre de trace déterministe au sein de chaque opération : (priority, id).
    const byOp = (op: ModifierOperation) =>
      kept
        .filter((k) => k.m.operation === op)
        .sort(
          (a, b) =>
            a.m.priority - b.m.priority ||
            (a.m.id < b.m.id ? -1 : a.m.id > b.m.id ? 1 : 0),
        );

    const flats = byOp('flat');
    const percentAdds = byOp('percent_add');
    const percentMuls = byOp('percent_multiply');
    const overrides = byOp('override');

    // ── 3. flat ───────────────────────────────────────────────────────────────
    let value = baseValue;
    for (const k of flats) {
      value += k.effectiveValue;
      applied.push(RuntimeComputeEngine.makeApplied(k, k.effectiveValue));
    }
    const afterFlat = value;

    // ── 4. percent_add (sommés puis appliqués UNE fois sur base+flats) ─────────
    const totalPercentAdd = percentAdds.reduce(
      (sum, k) => sum + k.effectiveValue,
      0,
    );
    for (const k of percentAdds) {
      const contribution = afterFlat * (k.effectiveValue / 100);
      applied.push(RuntimeComputeEngine.makeApplied(k, contribution));
    }
    value = afterFlat * (1 + totalPercentAdd / 100);
    const afterPercentAdd = value;

    // ── 5. percent_multiply (produit séquentiel — commutatif) ─────────────────
    for (const k of percentMuls) {
      const before = value;
      value = value * (1 + k.effectiveValue / 100);
      applied.push(RuntimeComputeEngine.makeApplied(k, value - before));
    }
    const afterPercentMultiply = value;

    // ── 6. override (priorité MAX ; égalité au sommet = erreur) ────────────────
    let overrideApplied: StatResolutionResult['overrideApplied'] = null;
    if (overrides.length > 0) {
      const maxPriority = Math.max(...overrides.map((k) => k.m.priority));
      const top = overrides.filter((k) => k.m.priority === maxPriority);
      if (top.length > 1) {
        throw new StatResolutionError(
          'DUPLICATE_OVERRIDE_PRIORITY',
          `Plusieurs overrides actifs de priorité ${maxPriority} pour la stat "${stat}"`,
          { stat, priority: maxPriority, modifierIds: top.map((k) => k.m.id) },
        );
      }
      const winner = top[0];
      overrideApplied = {
        modifierId: winner.m.id,
        priority: winner.m.priority,
        value: winner.effectiveValue,
      };
      applied.push(
        RuntimeComputeEngine.makeApplied(winner, winner.effectiveValue - value),
      );
      value = winner.effectiveValue;
    }
    const afterOverride = value;

    // ── 7. caps (TOUJOURS appliqués, même après override) ─────────────────────
    const beforeCaps = afterOverride;
    if (capMin !== undefined) value = Math.max(value, capMin);
    if (capMax !== undefined) value = Math.min(value, capMax);
    const afterCaps = value;

    // ── 8. arrondi final unique (après caps) ──────────────────────────────────
    const finalValue = RuntimeComputeEngine.applyRounding(afterCaps, rounding);

    return {
      stat,
      baseValue,
      received,
      applied,
      filtered,
      afterFlat,
      afterPercentAdd,
      afterPercentMultiply,
      afterOverride,
      beforeCaps,
      afterCaps,
      finalValue,
      overrideApplied,
      roundingPolicy: rounding,
      caps: { min: capMin ?? null, max: capMax ?? null },
    };
  }

  /** Signe EFFECTIF d'une contribution (override = neutre). */
  private static contributionSign(m: RuntimeModifier): ContributionSign {
    if (m.operation === 'override') return 'neutral';
    if (m.value > 0) return 'positive';
    if (m.value < 0) return 'negative';
    return 'neutral';
  }

  /** Un filtre correspond si TOUS ses critères présents sont satisfaits (ET). */
  private static filterMatches(
    f: StatContributionFilter,
    m: RuntimeModifier,
    sign: ContributionSign,
  ): boolean {
    const match = f.match ?? {};
    if (match.sourceType !== undefined && match.sourceType !== m.sourceType) {
      return false;
    }
    if (match.sourceId !== undefined && match.sourceId !== m.sourceId) {
      return false;
    }
    if (match.tag !== undefined && !(m.tags ?? []).includes(match.tag)) {
      return false;
    }
    if (match.sign !== undefined && match.sign !== sign) return false;
    return true;
  }

  private static describeFilter(f: StatContributionFilter): string {
    const parts: string[] = [];
    if (f.match?.sourceType) parts.push(`sourceType=${f.match.sourceType}`);
    if (f.match?.sourceId) parts.push(`sourceId=${f.match.sourceId}`);
    if (f.match?.tag) parts.push(`tag=${f.match.tag}`);
    if (f.match?.sign) parts.push(`sign=${f.match.sign}`);
    parts.push(`scale=${f.scale}`);
    return parts.join(' ');
  }

  private static makeApplied(
    k: { m: RuntimeModifier; effectiveValue: number; scale: number },
    contribution: number,
  ): AppliedContribution {
    return {
      modifierId: k.m.id,
      sourceType: k.m.sourceType,
      sourceId: k.m.sourceId,
      operation: k.m.operation,
      originalValue: k.m.value,
      effectiveValue: k.effectiveValue,
      scale: k.scale,
      contribution,
      tags: k.m.tags ?? [],
    };
  }

  private static applyRounding(value: number, policy: RoundingPolicy): number {
    switch (policy) {
      case 'floor':
        return Math.floor(value);
      case 'ceil':
        return Math.ceil(value);
      case 'round':
        return Math.round(value);
      case 'none':
      default:
        return value;
    }
  }

  private static assertFiniteValue(value: number, label: string): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new StatResolutionError(
        'NON_FINITE_VALUE',
        `Valeur non finie pour ${label} (${value})`,
        { label, value },
      );
    }
  }
}
