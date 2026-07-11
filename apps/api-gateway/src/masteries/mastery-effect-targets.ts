/**
 * Mastery Effect Targets (V2-E) — SOURCE SERVEUR UNIQUE des stats ciblables
 * par les effets de maîtrises, de leurs modes et de leurs bornes.
 * ---------------------------------------------------------------------------
 * Consommée par :
 * - `sanitizeMasteryEffects` (validation d'écriture — aucune whitelist locale
 *   séparée) ;
 * - `GET /admin/mastery-effect-targets` (le Studio ne code plus aucune liste
 *   de stats en dur) ;
 * - les tests.
 *
 * N'expose QUE les stats réellement consommées par un hook serveur
 * (`runtimeStatus: 'implemented'`). Critique / esquive / block / stun / craft /
 * résistances / vitesses : volontairement absentes tant que leur hook gameplay
 * n'existe pas — les statuts `calculatedOnly` / `notHooked` sont prêts pour le
 * jour où on choisira d'exposer des stats non branchées à titre informatif.
 */

import type { MasteryModifierMode } from './mastery-effects.calculator';

export type MasteryEffectRuntimeStatus = 'implemented' | 'calculatedOnly' | 'notHooked';

export interface MasteryEffectTarget {
  key: string;
  label: string;
  category: string;
  allowedModes: readonly MasteryModifierMode[];
  minValueByMode: Readonly<Record<MasteryModifierMode, number>>;
  maxValueByMode: Readonly<Record<MasteryModifierMode, number>>;
  runtimeStatus: MasteryEffectRuntimeStatus;
  description: string;
}

export interface MasteryEffectModeInfo {
  key: MasteryModifierMode;
  label: string;
  description: string;
}

const BOTH_MODES: readonly MasteryModifierMode[] = ['percentPerLevel', 'flatPerLevel'];
const MIN_BY_MODE = { percentPerLevel: 0, flatPerLevel: 0 } as const;
const MAX_BY_MODE = { percentPerLevel: 5, flatPerLevel: 100 } as const;

function target(
  key: string,
  label: string,
  category: string,
  description: string,
): MasteryEffectTarget {
  return {
    key,
    label,
    category,
    allowedModes: BOTH_MODES,
    minValueByMode: MIN_BY_MODE,
    maxValueByMode: MAX_BY_MODE,
    runtimeStatus: 'implemented',
    description,
  };
}

export const MASTERY_EFFECT_TARGETS: readonly MasteryEffectTarget[] = [
  target('physicalAttack', 'Attaque physique', 'combat',
    'Consommée par auto-attaque et skills weapon-based (seule stat autorisée avec un contexte weaponType).'),
  target('defense', 'Défense', 'combat',
    'Réduit les dégâts reçus des créatures (riposte et auto-attaque).'),
  target('maxHealth', 'Vie max', 'ressources',
    'Plafond de PV — respawn, clamp de régénération, coûts de skills.'),
  target('maxMana', 'Mana max', 'ressources',
    'Plafond de mana — coûts de skills et régénération.'),
  target('maxEnergy', 'Énergie max', 'ressources',
    'Plafond d’énergie — coûts de skills et régénération.'),
  target('healthRegen', 'Régénération vie', 'régénération',
    'Points de vie régénérés par seconde (tick serveur).'),
  target('manaRegen', 'Régénération mana', 'régénération',
    'Mana régénéré par seconde (tick serveur).'),
  target('energyRegen', 'Régénération énergie', 'régénération',
    'Énergie régénérée par seconde (tick serveur).'),
  target('healingPower', 'Puissance de soin', 'puissance',
    'Alimente le scaling des skills de soin.'),
  target('magicPower', 'Puissance magique', 'puissance',
    'Alimente le scaling des skills magiques.'),
];

export const MASTERY_EFFECT_MODES: readonly MasteryEffectModeInfo[] = [
  {
    key: 'percentPerLevel',
    label: '% par niveau',
    description: 'Applique un pourcentage par niveau de maîtrise.',
  },
  {
    key: 'flatPerLevel',
    label: 'Valeur fixe par niveau',
    description: 'Ajoute une valeur fixe par niveau de maîtrise.',
  },
];

/**
 * Stats autorisées avec un contexte weaponType (hooks weapon-based).
 * Exposée à l'endpoint admin pour que le Studio n'encode pas cette règle.
 */
export const CONTEXTUAL_MASTERY_EFFECT_STATS: readonly string[] = ['physicalAttack'];

const TARGETS_BY_KEY = new Map(MASTERY_EFFECT_TARGETS.map((t) => [t.key, t]));

/** Target par sa key, ou undefined si la stat n'est pas ciblable. */
export function getMasteryEffectTarget(key: string): MasteryEffectTarget | undefined {
  return TARGETS_BY_KEY.get(key);
}
