import type { MagicSchool } from '../active-skills/active-skills.constants';

/**
 * Résistances magiques par école + globale (ADR-0022 — fondation).
 *
 * Ce module ne fait AUCUNE mitigation : il expose le vocabulaire canonique des
 * stats de résistance et une résolution EFFECTIVE par école (somme non clampée
 * `global + école`). Les valeurs individuelles sont résolues par le pipeline
 * générique de stats (`RuntimeComputeEngine.resolveStat` / calculateurs
 * dérivés) ; ce module se contente de les lire via un accesseur, ce qui le rend
 * commun aux personnages ET aux créatures sans dupliquer la formule.
 *
 * Points de POURCENTAGE. Aucun clamp, aucune conversion en immunité, aucun
 * multiplicateur de dégâts (mitigation = Planned).
 */

/** Contribution transversale commune à toutes les écoles. */
export const MAGIC_RESISTANCE_GLOBAL_STAT = 'magicResistanceGlobal' as const;

/**
 * Mapping canonique et EXHAUSTIF école → clé de stat de résistance. `satisfies
 * Record<MagicSchool, …>` garantit qu'une future école non gérée casse la
 * compilation (contrôle exhaustif). Réutilise le type `MagicSchool` canonique
 * (aucune seconde union).
 */
export const MAGIC_SCHOOL_RESISTANCE_STAT = {
  fire: 'magicResistanceFire',
  water: 'magicResistanceWater',
  air: 'magicResistanceAir',
  earth: 'magicResistanceEarth',
  sacred: 'magicResistanceSacred',
  poison: 'magicResistancePoison',
} as const satisfies Record<MagicSchool, string>;

/** Union des 7 clés de stats de résistance (globale + une par école). */
export type MagicResistanceStatKey =
  | typeof MAGIC_RESISTANCE_GLOBAL_STAT
  | (typeof MAGIC_SCHOOL_RESISTANCE_STAT)[MagicSchool];

/** Les 7 clés canoniques, dans un ordre stable (globale d'abord). */
export const MAGIC_RESISTANCE_STAT_KEYS: readonly MagicResistanceStatKey[] = [
  MAGIC_RESISTANCE_GLOBAL_STAT,
  MAGIC_SCHOOL_RESISTANCE_STAT.fire,
  MAGIC_SCHOOL_RESISTANCE_STAT.water,
  MAGIC_SCHOOL_RESISTANCE_STAT.air,
  MAGIC_SCHOOL_RESISTANCE_STAT.earth,
  MAGIC_SCHOOL_RESISTANCE_STAT.sacred,
  MAGIC_SCHOOL_RESISTANCE_STAT.poison,
];

/** Clé de stat de résistance d'une école (exhaustif, typé). */
export function magicResistanceStatForSchool(
  school: MagicSchool,
): MagicResistanceStatKey {
  return MAGIC_SCHOOL_RESISTANCE_STAT[school];
}

/**
 * Accesseur de valeur résolue d'une stat de résistance pour un acteur donné.
 * Alimenté par le pipeline générique (dérivées personnage résolues, ou
 * `resolveStat` pour une créature). `undefined`/`null` = contribution absente
 * (traité comme `0`, valeur par défaut sûre).
 */
export type MagicResistanceReader = (
  statKey: MagicResistanceStatKey,
) => number | null | undefined;

/**
 * Construit un {@link MagicResistanceReader} à partir d'une carte de stats
 * dérivées déjà résolues (`{ statKey: value }`), utilisable pour un personnage
 * comme pour une créature.
 */
export function magicResistanceReaderFromStats(
  stats: Readonly<Record<string, number>>,
): MagicResistanceReader {
  return (statKey) => stats[statKey];
}

/** Résistance effective résolue pour une école (aucun clamp). */
export interface EffectiveMagicResistance {
  readonly school: MagicSchool;
  /** Résistance magique globale résolue (contribution commune). */
  readonly globalResistance: number;
  /** Résistance résolue propre à l'école. */
  readonly schoolResistance: number;
  /** `globalResistance + schoolResistance` — NON clampé. */
  readonly effectiveResistance: number;
}

/**
 * Lit une valeur résolue de façon SÛRE : `null`/`undefined` → `0` (contribution
 * absente). Une valeur non finie (NaN/Infinity) est une corruption inattendue —
 * remontée en erreur plutôt que masquée en `0`.
 */
function readResolved(read: MagicResistanceReader, key: MagicResistanceStatKey): number {
  const value = read(key);
  if (value === null || value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `Magic resistance stat "${key}" resolved to a non-finite value: ${String(value)}`,
    );
  }
  return value;
}

/**
 * Résout la résistance effective d'une école :
 *   effectiveResistance = globalResistance + schoolResistance
 *
 * AUCUN clamp (négatif conservé, > 100 conservé), aucune immunité déduite,
 * aucun arrondi, aucun multiplicateur de dégâts. La résistance globale est une
 * contribution commune injectée dans chaque école (jamais une seconde
 * mitigation) et n'interfère pas entre écoles (une école ne lit que sa propre
 * stat + la globale).
 */
export function resolveEffectiveMagicResistance(
  school: MagicSchool,
  read: MagicResistanceReader,
): EffectiveMagicResistance {
  const globalResistance = readResolved(read, MAGIC_RESISTANCE_GLOBAL_STAT);
  const schoolResistance = readResolved(read, magicResistanceStatForSchool(school));
  return {
    school,
    globalResistance,
    schoolResistance,
    effectiveResistance: globalResistance + schoolResistance,
  };
}
