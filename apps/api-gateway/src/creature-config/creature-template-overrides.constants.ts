import { PRIMARY_STAT_KEYS } from '../derived-stats/derived-stats.constants';

/**
 * Overrides de dérivation par CreatureTemplate (ADR-0021, sous-lot backend).
 *
 * Objectif : permettre à CHAQUE template d'avoir ses propres coefficients de
 * dérivation (et paramètres scalaires) pour toute statistique dérivée, en
 * conservant EXACTEMENT le comportement actuel tant qu'aucun override n'existe.
 *
 * Ce fichier ne contient AUCUNE copie des valeurs numériques configurables : les
 * maps de fallback sont CONSTRUITES à la volée depuis le singleton global
 * (`CreatureSecondaryCoefficients`) et les `derived_stat_definition` réellement
 * chargées. Seul le MAPPING structurel (quel primaire alimente quelle dérivée
 * combat) est figé ici — il reflète les formules de `resolveCombatStats`.
 */

/** Statistiques dérivées combat résolues par `resolveCombatStats` (clés catalogue). */
export const CREATURE_COMBAT_DERIVED_KEYS = [
  'physicalAttack',
  'defense',
  'accuracy',
  'dodgeChance',
  'blockChance',
  'parryChance',
  'counterAttackPower',
] as const;
export type CreatureCombatDerivedKey = (typeof CREATURE_COMBAT_DERIVED_KEYS)[number];

/**
 * Paramètres SCALAIRES par template (pas des coefficients). Liste canonique
 * serveur — toute autre clé est rejetée. `secondaryChanceCap` n'a
 * volontairement PAS de définition catalogue (c'est un plafond de mécanique,
 * pas une statistique dérivée).
 */
export const CREATURE_SCALAR_PARAM_KEYS = [
  'blockReductionPercent',
  'secondaryChanceCap',
] as const;
export type CreatureScalarParamKey = (typeof CREATURE_SCALAR_PARAM_KEYS)[number];

export function isCreatureScalarParamKey(key: string): key is CreatureScalarParamKey {
  return (CREATURE_SCALAR_PARAM_KEYS as readonly string[]).includes(key);
}

export function isPrimaryStatKey(key: string): boolean {
  return (PRIMARY_STAT_KEYS as readonly string[]).includes(key);
}

/** Coefficients de dérivation d'une stat : { primaryStatKey: coefficient }. */
export type CoefficientMap = Readonly<Record<string, number>>;

/**
 * Overrides résolus d'un template. Une clé PRÉSENTE dans `derivedCoefficients`
 * signifie « cette dérivée est contrôlée par le template » — la map (même VIDE)
 * remplace intégralement le fallback. Idem pour `scalarParams`.
 */
export interface CreatureTemplateOverrides {
  /** derivedStatKey → coefMap du template (présent ⇒ override, `{}` = zéro primaire). */
  readonly derivedCoefficients: Readonly<Record<string, CoefficientMap>>;
  /** scalarParamKey → valeur du template (présent ⇒ override). */
  readonly scalarParams: Readonly<Record<string, number>>;
}

/** Overrides « vides » — aucun override (fallback intégral). */
export const EMPTY_TEMPLATE_OVERRIDES: CreatureTemplateOverrides = {
  derivedCoefficients: {},
  scalarParams: {},
};

/** Provenance d'une résolution (trace) : override template ou fallback. */
export type CoefficientSource = 'template' | 'global' | 'catalog';

/**
 * Map de coefficients EFFECTIVE pour une dérivée : override du template si la
 * clé est présente (même map vide), sinon la map de fallback fournie. Retourne
 * aussi la provenance (trace, §9).
 */
export function effectiveCoefficientMap(
  overrides: CreatureTemplateOverrides,
  derivedStatKey: string,
  fallbackMap: CoefficientMap,
  fallbackSource: CoefficientSource,
): { map: CoefficientMap; source: CoefficientSource } {
  if (Object.prototype.hasOwnProperty.call(overrides.derivedCoefficients, derivedStatKey)) {
    return { map: overrides.derivedCoefficients[derivedStatKey], source: 'template' };
  }
  return { map: fallbackMap, source: fallbackSource };
}

/** Valeur scalaire EFFECTIVE : override du template si présent, sinon fallback. */
export function effectiveScalar(
  overrides: CreatureTemplateOverrides,
  key: CreatureScalarParamKey,
  fallbackValue: number,
): { value: number; source: CoefficientSource } {
  if (Object.prototype.hasOwnProperty.call(overrides.scalarParams, key)) {
    return { value: overrides.scalarParams[key], source: 'template' };
  }
  return { value: fallbackValue, source: 'global' };
}

/**
 * Contribution d'une map de coefficients : `Σ primaire×coef`. PUR. `primaries`
 * = valeurs des stats primaires de l'entité. Une map vide → 0 (aucune
 * contribution primaire).
 */
export function sumPrimaryContributions(
  coefMap: CoefficientMap,
  primaries: Readonly<Record<string, number>>,
): number {
  let total = 0;
  for (const [primaryKey, coef] of Object.entries(coefMap)) {
    total += (primaries[primaryKey] ?? 0) * coef;
  }
  return total;
}
