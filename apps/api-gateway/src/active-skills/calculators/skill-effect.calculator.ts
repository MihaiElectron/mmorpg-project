/**
 * calculateSkillEffect — calcul de résultat de skill PUR (Skills V1-C, ADR-0019).
 * ---------------------------------------------------------------------------
 * Aucun accès DB, aucun socket, aucune injection NestJS, aucun effet de bord.
 * Le calculateur reçoit des stats DÉJÀ calculées (il n'appelle jamais
 * `CharacterStatsCalculator`) et applique les coefficients de scaling du skill.
 *
 * Formule V1 :
 *   total = Σ(primary[key]  × primaryCoefficients[key])
 *         + Σ(derived[key]  × derivedCoefficients[key])
 *         + Σ(mastery[key]  × masteryCoefficients[key])
 *   amount = clampMin(round(total), minimum)   // minimum = 0 par défaut
 *
 * V1 volontairement simple : pas de hasard, pas de critique, pas de défense
 * cible, pas de coût, pas de cooldown, pas de portée. Ces règles appartiennent
 * à V1-D (validation serveur du cast). Aucun effet temporaire ici.
 *
 * Choix de robustesse (pur & défensif — jamais de throw) :
 *   - clé de coefficient absente des stats fournies  → valeur de stat = 0
 *     (contribution nulle), ignorée silencieusement — jamais rejetée.
 *   - coefficient ou valeur de stat non finie (NaN, Infinity, non-nombre)
 *     → traité comme 0 (contribution nulle, non enregistrée).
 *   - groupe de scaling absent → traité comme {} (aucune contribution).
 *   - coefficient négatif → ACCEPTÉ (contribution négative possible) ; le
 *     plancher final `minimum` (0 par défaut) empêche un amount négatif.
 */

import type { SkillEffectType } from '../active-skills.constants';

/** Coefficients par groupe. Compatible avec `SkillDefinition.scaling`. */
export interface SkillEffectScaling {
  primaryCoefficients?: Record<string, unknown>;
  derivedCoefficients?: Record<string, unknown>;
  masteryCoefficients?: Record<string, unknown>;
}

/** Entrée minimale du skill — compatible avec `SkillDefinition` (structural). */
export interface SkillEffectInput {
  effectType: SkillEffectType;
  scaling?: SkillEffectScaling | null;
}

/** Stats déjà calculées du personnage, fournies par l'appelant. */
export interface SkillEffectStats {
  /** Stats primaires finales (ex: { strength: 42, ... }). */
  primary: Record<string, number>;
  /** Stats dérivées (ex: { physicalAttack: 120, healingPower: 30, ... }). */
  derived: Record<string, number>;
  /** Niveaux de mastery du personnage (ex: { two_handed: 10, ... }). */
  masteryLevels: Record<string, number>;
}

export interface SkillEffectOptions {
  /** Plancher appliqué au montant final. Défaut : 0. */
  minimum?: number;
  /** Mode d'arrondi du total. Défaut : 'round'. */
  rounding?: 'round' | 'floor' | 'ceil';
}

export type SkillEffectContributionSource = 'primary' | 'derived' | 'mastery';

export interface SkillEffectContribution {
  source: SkillEffectContributionSource;
  key: string;
  statValue: number;
  coefficient: number;
  contribution: number;
}

export interface SkillEffectResult {
  effectType: SkillEffectType;
  /** Montant final : total arrondi puis planché à `minimum`. */
  amount: number;
  /** Total brut avant arrondi/plancher — utile pour debug/preview. */
  rawTotal: number;
  /** Détail par contribution non nulle (ordre : primary, derived, mastery). */
  contributions: SkillEffectContribution[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function applyRounding(value: number, mode: SkillEffectOptions['rounding']): number {
  switch (mode) {
    case 'floor':
      return Math.floor(value);
    case 'ceil':
      return Math.ceil(value);
    case 'round':
    default:
      return Math.round(value);
  }
}

/**
 * Agrège une groupe de coefficients contre une carte de stats. Ignore les
 * coefficients non finis. Une clé absente de `stats` donne une valeur 0
 * (contribution 0) mais reste enregistrée si le coefficient est non nul, pour
 * la transparence du preview.
 */
function accumulateGroup(
  source: SkillEffectContributionSource,
  coefficients: Record<string, unknown> | undefined | null,
  stats: Record<string, number>,
  contributions: SkillEffectContribution[],
): number {
  if (!coefficients) return 0;
  let sum = 0;
  for (const [key, rawCoef] of Object.entries(coefficients)) {
    if (!isFiniteNumber(rawCoef)) continue; // coefficient invalide → ignoré
    if (rawCoef === 0) continue; // aucun impact — pas de bruit dans le détail
    const rawStat = stats[key];
    const statValue = isFiniteNumber(rawStat) ? rawStat : 0; // absent/invalide → 0
    const contribution = statValue * rawCoef;
    sum += contribution;
    contributions.push({ source, key, statValue, coefficient: rawCoef, contribution });
  }
  return sum;
}

/**
 * Calcule le résultat instantané d'un skill (dégâts ou soin) à partir des
 * coefficients de scaling et des stats déjà calculées du personnage.
 *
 * Fonction PURE : mêmes entrées → mêmes sorties, sans I/O.
 */
export function calculateSkillEffect(
  skill: SkillEffectInput,
  stats: SkillEffectStats,
  options: SkillEffectOptions = {},
): SkillEffectResult {
  const minimum = isFiniteNumber(options.minimum) ? options.minimum : 0;
  const contributions: SkillEffectContribution[] = [];
  const scaling = skill.scaling ?? {};

  const rawTotal =
    accumulateGroup('primary', scaling.primaryCoefficients, stats.primary, contributions) +
    accumulateGroup('derived', scaling.derivedCoefficients, stats.derived, contributions) +
    accumulateGroup('mastery', scaling.masteryCoefficients, stats.masteryLevels, contributions);

  const rounded = applyRounding(rawTotal, options.rounding);
  const amount = Math.max(minimum, rounded);

  return {
    effectType: skill.effectType,
    amount,
    rawTotal,
    contributions,
  };
}
