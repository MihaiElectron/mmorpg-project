/**
 * Mastery Effect Targets (V3-B) — targets construits depuis les
 * DerivedStatDefinition (source de vérité éditable dans le Studio
 * « Stats secondaires »), plus aucune liste statique.
 * ---------------------------------------------------------------------------
 * Consommé par :
 * - `sanitizeMasteryEffects` (validation d'écriture) ;
 * - `GET /admin/mastery-effect-targets` (le Studio ne code aucune liste) ;
 * - la résolution runtime (`MasteryEffectsService`).
 *
 * N'expose QUE les dérivées enabled + masteryEligible + implemented + au
 * moins un mode. Critique / esquive / block / stun / craft / vitesses /
 * résistances restent calculatedOnly → jamais exposées tant que leur hook
 * gameplay n'existe pas.
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

const MIN_BY_MODE = { percentPerLevel: 0, flatPerLevel: 0 } as const;
const MAX_BY_MODE = { percentPerLevel: 5, flatPerLevel: 100 } as const;

/**
 * Vue structurelle minimale d'une DerivedStatDefinition — évite le couplage
 * TypeORM (le builder reste pur).
 */
export interface MasteryTargetSourceDefinition {
  key: string;
  label: string;
  category: string;
  enabled: boolean;
  masteryEligible: boolean;
  allowedModifierModes: MasteryModifierMode[] | null;
  runtimeStatus: string;
  description: string | null;
}

/**
 * V3-B : les targets sont CONSTRUITS depuis les DerivedStatDefinition
 * (éditables dans le Studio « Stats secondaires ») — plus aucune liste
 * statique. Règle d'exposition stricte :
 *   enabled && masteryEligible && runtimeStatus === 'implemented'
 *   && allowedModifierModes non vide.
 * Les stats disabled / calculatedOnly / notHooked / sans mode ne sont JAMAIS
 * exposées (ni ciblables par sanitize, ni visibles dans le Studio).
 * Bornes par mode : percent 0–5, flat 0–100 (invariants serveur).
 */
export function buildMasteryEffectTargets(
  definitions: readonly MasteryTargetSourceDefinition[],
): MasteryEffectTarget[] {
  const targets: MasteryEffectTarget[] = [];
  for (const def of definitions) {
    if (!def?.enabled) continue;
    if (!def.masteryEligible) continue;
    if (def.runtimeStatus !== 'implemented') continue;
    const modes = (def.allowedModifierModes ?? []).filter(
      (m): m is MasteryModifierMode => m === 'percentPerLevel' || m === 'flatPerLevel',
    );
    if (modes.length === 0) continue;
    if (typeof def.key !== 'string' || def.key.length === 0) continue;
    targets.push({
      key: def.key,
      label: def.label,
      category: def.category,
      allowedModes: modes,
      minValueByMode: MIN_BY_MODE,
      maxValueByMode: MAX_BY_MODE,
      runtimeStatus: 'implemented',
      description: def.description ?? '',
    });
  }
  return targets;
}

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

/** Index par key d'une liste de targets (helper des consommateurs). */
export function indexMasteryEffectTargets(
  targets: readonly MasteryEffectTarget[],
): Map<string, MasteryEffectTarget> {
  return new Map(targets.map((t) => [t.key, t]));
}
