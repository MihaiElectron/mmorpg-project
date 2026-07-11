/**
 * Mastery Effects V2 — sanitization et calcul PURS (modificateurs génériques).
 * ---------------------------------------------------------------------------
 * Aucune dépendance NestJS, aucun accès DB, aucun effet de bord.
 *
 * Modèle (ADR-0020, généralisé) :
 *
 *   {
 *     "context":   { "weaponType": "two_handed_sword" },   // optionnel
 *     "modifiers": [
 *       { "stat": "physicalAttack", "mode": "percentPerLevel", "value": 5 },
 *       { "stat": "maxHealth",      "mode": "percentPerLevel", "value": 1 }
 *     ]
 *   }
 *
 * Sémantique du contexte :
 * - `context.weaponType` présent → modificateurs CONTEXTUELS, consommés
 *   uniquement par les hooks combat weapon-based (auto-attaque, skills) ;
 *   seule la stat `physicalAttack` y est autorisée (pas de hook pour le reste).
 * - pas de contexte → modificateurs PERMANENTS, appliqués aux stats dérivées
 *   du personnage via `CharacterStatsCalculator.compute` (agrégés par
 *   `aggregateMasteryStatModifiers`).
 *
 * Deux stratégies, comme en V1 :
 * - ÉCRITURE (`sanitizeMasteryEffects`) : validation STRICTE — clé inconnue,
 *   stat hors whitelist, mode inconnu, valeur non finie / négative / hors
 *   borne, doublon (stat, mode) → REFUS (`MasteryEffectsValidationError`).
 *   Le format legacy `combat.damagePercentPerLevel` est ACCEPTÉ en entrée et
 *   CONVERTI : le stockage ne produit plus que `modifiers[]`.
 * - LECTURE (compute/aggregate) : défensive — valeur corrompue ignorée ou
 *   clampée, jamais levée. Le legacy est interprété comme un modifier
 *   `physicalAttack / percentPerLevel`.
 *
 * Formule par modifier : `bonus = level × value` (les maîtrises démarrent au
 * niveau 0 : level 0 = aucun bonus, le niveau affiché = coefficients appliqués).
 * Clamps serveur par stat : percent total ≤ 50, flat total ≤ 1000.
 */

export const MASTERY_MODIFIER_MODES = ['percentPerLevel', 'flatPerLevel'] as const;
export type MasteryModifierMode = (typeof MASTERY_MODIFIER_MODES)[number];

// Source serveur UNIQUE des stats ciblables, modes autorisés et bornes :
// `mastery-effect-targets.ts` (V2-E). Importée ici (import de valeurs) tandis
// que targets n'importe que des TYPES d'ici — aucun cycle runtime.
import {
  CONTEXTUAL_MASTERY_EFFECT_STATS,
  getMasteryEffectTarget,
  MASTERY_EFFECT_TARGETS,
} from './mastery-effect-targets';

/** Clés des stats ciblables — dérivées de la source unique (compat tests). */
export const MASTERY_MODIFIER_STATS: readonly string[] =
  MASTERY_EFFECT_TARGETS.map((t) => t.key);

/** Stats autorisées avec un contexte d'arme — ré-export de la source unique. */
export const CONTEXTUAL_MODIFIER_STATS = CONTEXTUAL_MASTERY_EFFECT_STATS;

/** Bornes d'écriture PAR NIVEAU. */
export const MAX_PERCENT_PER_LEVEL = 5;
export const MAX_FLAT_PER_LEVEL = 100;

/** Clamps serveur du bonus TOTAL par stat (lecture). */
export const MAX_TOTAL_PERCENT_PER_STAT = 50;
export const MAX_TOTAL_FLAT_PER_STAT = 1000;

// Compat noms V1 (hooks combat) — même valeur que le clamp percent générique.
export const MAX_TOTAL_COMBAT_DAMAGE_PERCENT = MAX_TOTAL_PERCENT_PER_STAT;

const WEAPON_TYPE_PATTERN = /^[a-z0-9_]+$/;

export interface MasteryEffectsContext {
  weaponType?: string;
}

export interface MasteryStatModifier {
  stat: string;
  mode: MasteryModifierMode;
  value: number;
}

/** Format legacy V1 — accepté en LECTURE et converti en entrée d'écriture. */
export interface LegacyMasteryCombatEffects {
  damagePercentPerLevel?: number;
}

/** Structure persistée dans `mastery_definition.effects`. `{}` = aucun effet. */
export interface MasteryEffects {
  context?: MasteryEffectsContext;
  modifiers?: MasteryStatModifier[];
  /** Legacy V1 — jamais produit à l'écriture, toléré à la lecture. */
  combat?: LegacyMasteryCombatEffects;
}

/** Vue structurelle minimale d'une définition — évite le couplage TypeORM. */
export interface MasteryEffectsDefinitionLike {
  key: string;
  enabled: boolean;
  effects?: MasteryEffects | null;
}

/** Contexte réel du personnage au moment du calcul (source serveur uniquement). */
export interface CombatMasteryContext {
  weaponType?: string | null;
}

/** Bonus combat contextuel (hooks weapon-based). */
export interface CombatMasteryEffectsResult {
  damagePercent: number;
  damageFlat: number;
}

/**
 * Agrégat des modificateurs PERMANENTS par stat — consommé par
 * `CharacterStatsCalculator.compute` (percent puis flat, clamps inclus).
 */
export interface AggregatedStatModifiers {
  percent: Record<string, number>;
  flat: Record<string, number>;
}

export function emptyAggregatedStatModifiers(): AggregatedStatModifiers {
  return { percent: {}, flat: {} };
}

/** Erreur de validation à l'écriture — convertie en BadRequestException par le service. */
export class MasteryEffectsValidationError extends Error {}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉCRITURE — validation stricte
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeContext(raw: unknown): MasteryEffectsContext | undefined {
  if (!isPlainObject(raw)) {
    throw new MasteryEffectsValidationError('effects.context doit être un objet.');
  }
  for (const key of Object.keys(raw)) {
    if (key !== 'weaponType') {
      throw new MasteryEffectsValidationError(
        `effects.context.${key} n'est pas un contexte supporté (V2 : weaponType).`,
      );
    }
  }
  const weaponType = raw.weaponType;
  if (weaponType === undefined) return undefined;
  if (typeof weaponType !== 'string' || !WEAPON_TYPE_PATTERN.test(weaponType)) {
    throw new MasteryEffectsValidationError(
      'effects.context.weaponType doit être une string au format [a-z0-9_].',
    );
  }
  return { weaponType };
}

function sanitizeModifierEntry(raw: unknown, index: number): MasteryStatModifier {
  if (!isPlainObject(raw)) {
    throw new MasteryEffectsValidationError(
      `effects.modifiers[${index}] doit être un objet { stat, mode, value }.`,
    );
  }
  for (const key of Object.keys(raw)) {
    if (!['stat', 'mode', 'value'].includes(key)) {
      throw new MasteryEffectsValidationError(
        `effects.modifiers[${index}].${key} n'est pas supporté (stat, mode, value).`,
      );
    }
  }
  const { stat, mode, value } = raw;
  const targetDef = typeof stat === 'string' ? getMasteryEffectTarget(stat) : undefined;
  if (!targetDef) {
    throw new MasteryEffectsValidationError(
      `effects.modifiers[${index}].stat "${String(stat)}" n'est pas une stat supportée (${MASTERY_MODIFIER_STATS.join(', ')}).`,
    );
  }
  if (typeof mode !== 'string' || !(MASTERY_MODIFIER_MODES as readonly string[]).includes(mode)) {
    throw new MasteryEffectsValidationError(
      `effects.modifiers[${index}].mode "${String(mode)}" n'est pas un mode supporté (${MASTERY_MODIFIER_MODES.join(', ')}).`,
    );
  }
  const typedMode = mode as MasteryModifierMode;
  if (!targetDef.allowedModes.includes(typedMode)) {
    throw new MasteryEffectsValidationError(
      `effects.modifiers[${index}].mode "${typedMode}" n'est pas autorisé pour la stat "${targetDef.key}".`,
    );
  }
  if (!isFiniteNumber(value)) {
    throw new MasteryEffectsValidationError(
      `effects.modifiers[${index}].value doit être un nombre fini.`,
    );
  }
  const min = targetDef.minValueByMode[typedMode];
  const max = targetDef.maxValueByMode[typedMode];
  if (value < min || value > max) {
    throw new MasteryEffectsValidationError(
      `effects.modifiers[${index}].value doit être entre ${min} et ${max} (${typedMode}).`,
    );
  }
  return { stat: targetDef.key, mode: typedMode, value };
}

/**
 * Valide et normalise un `effects` entrant (CRUD admin). Strict : lève
 * `MasteryEffectsValidationError` sur toute structure non supportée.
 *
 * - absent / null → `{}` ;
 * - clés acceptées : `context`, `modifiers`, et `combat` legacy (converti) ;
 * - `modifiers[]` : stat whitelistée, mode whitelisté, value finie 0..borne,
 *   pas de doublon (stat, mode) ;
 * - contexte présent → seules les stats contextualisables (`physicalAttack`)
 *   sont autorisées (les hooks weapon-based ne consomment rien d'autre) ;
 * - le stockage produit UNIQUEMENT le nouveau format (`combat` jamais persisté).
 */
export function sanitizeMasteryEffects(raw: unknown): MasteryEffects {
  if (raw === undefined || raw === null) return {};
  if (!isPlainObject(raw)) {
    throw new MasteryEffectsValidationError('effects doit être un objet.');
  }
  for (const key of Object.keys(raw)) {
    if (!['context', 'modifiers', 'combat'].includes(key)) {
      throw new MasteryEffectsValidationError(
        `effects.${key} n'est pas supporté (context, modifiers).`,
      );
    }
  }

  const out: MasteryEffects = {};

  if (raw.context !== undefined) {
    const context = sanitizeContext(raw.context);
    if (context) out.context = context;
  }

  const modifiers: MasteryStatModifier[] = [];

  if (raw.modifiers !== undefined) {
    if (!Array.isArray(raw.modifiers)) {
      throw new MasteryEffectsValidationError('effects.modifiers doit être un tableau.');
    }
    raw.modifiers.forEach((entry, index) => {
      modifiers.push(sanitizeModifierEntry(entry, index));
    });
  }

  // Legacy V1 : combat.damagePercentPerLevel → modifier physicalAttack percent.
  // PRÉSÉANCE V2 : si `modifiers[]` est fourni, il gagne — le legacy est
  // ignoré (jamais fusionné). Le legacy n'est converti que pour un payload
  // purement V1. Dans tous les cas, seul le format V2 est persisté.
  if (raw.combat !== undefined) {
    if (!isPlainObject(raw.combat)) {
      throw new MasteryEffectsValidationError('effects.combat doit être un objet.');
    }
    for (const key of Object.keys(raw.combat)) {
      if (key !== 'damagePercentPerLevel') {
        throw new MasteryEffectsValidationError(
          `effects.combat.${key} n'est pas un effet supporté.`,
        );
      }
    }
    const legacy = raw.combat.damagePercentPerLevel;
    if (legacy !== undefined && modifiers.length === 0) {
      if (!isFiniteNumber(legacy) || legacy < 0 || legacy > MAX_PERCENT_PER_LEVEL) {
        throw new MasteryEffectsValidationError(
          `effects.combat.damagePercentPerLevel doit être entre 0 et ${MAX_PERCENT_PER_LEVEL}.`,
        );
      }
      modifiers.push({ stat: 'physicalAttack', mode: 'percentPerLevel', value: legacy });
    }
  }

  // Doublons (stat, mode) : configuration illisible → refusée.
  const seen = new Set<string>();
  for (const m of modifiers) {
    const id = `${m.stat}:${m.mode}`;
    if (seen.has(id)) {
      throw new MasteryEffectsValidationError(
        `effects.modifiers contient un doublon pour ${m.stat} / ${m.mode}.`,
      );
    }
    seen.add(id);
  }

  // Contexte d'arme → stats contextualisables uniquement.
  if (out.context?.weaponType) {
    for (const m of modifiers) {
      if (!CONTEXTUAL_MODIFIER_STATS.includes(m.stat)) {
        throw new MasteryEffectsValidationError(
          `Seule la stat ${CONTEXTUAL_MODIFIER_STATS.join(', ')} est supportée avec un contexte weaponType pour le moment (reçu : "${m.stat}").`,
        );
      }
    }
  }

  if (modifiers.length > 0) out.modifiers = modifiers;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// LECTURE — défensive
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Modificateurs valides d'un `effects` stocké, legacy inclus. Jamais de throw :
 * entrée corrompue ignorée, value clampée à la borne par niveau.
 */
function readModifiers(effects: MasteryEffects | null | undefined): MasteryStatModifier[] {
  if (!effects) return [];
  const result: MasteryStatModifier[] = [];

  if (Array.isArray(effects.modifiers)) {
    for (const entry of effects.modifiers) {
      if (!isPlainObject(entry as unknown as Record<string, unknown>)) continue;
      const { stat, mode, value } = entry as MasteryStatModifier;
      const targetDef = typeof stat === 'string' ? getMasteryEffectTarget(stat) : undefined;
      if (!targetDef) continue;
      if (mode !== 'percentPerLevel' && mode !== 'flatPerLevel') continue;
      if (!targetDef.allowedModes.includes(mode)) continue;
      if (!isFiniteNumber(value) || value <= 0) continue;
      result.push({ stat: targetDef.key, mode, value: Math.min(value, targetDef.maxValueByMode[mode]) });
    }
  }

  // Legacy V1 lu comme physicalAttack percent — UNIQUEMENT si aucun
  // modifiers[] valide n'existe (préséance V2 : jamais de cumul legacy + V2).
  if (result.length === 0) {
    const legacy = effects.combat?.damagePercentPerLevel;
    if (isFiniteNumber(legacy) && legacy > 0) {
      result.push({
        stat: 'physicalAttack',
        mode: 'percentPerLevel',
        value: Math.min(legacy, MAX_PERCENT_PER_LEVEL),
      });
    }
  }

  return result;
}

function effectiveLevels(levels: Record<string, number> | null | undefined, key: string): number {
  const raw = (levels ?? {})[key];
  return isFiniteNumber(raw) ? Math.max(0, raw) : 0;
}

/**
 * Bonus combat CONTEXTUELS pour un weaponType équipé (hooks weapon-based).
 * Seule la stat `physicalAttack` est consommée. Percent et flat clampés.
 */
export function computeCombatMasteryEffects(
  definitions: readonly MasteryEffectsDefinitionLike[],
  masteryLevels: Record<string, number> | null | undefined,
  context: CombatMasteryContext,
): CombatMasteryEffectsResult {
  const weaponType = context?.weaponType;
  if (!weaponType) return { damagePercent: 0, damageFlat: 0 };

  let percent = 0;
  let flat = 0;

  for (const def of definitions) {
    if (!def?.enabled) continue;
    if (def.effects?.context?.weaponType !== weaponType) continue;
    const lvl = effectiveLevels(masteryLevels, def.key);
    if (lvl === 0) continue;
    for (const m of readModifiers(def.effects)) {
      if (m.stat !== 'physicalAttack') continue;
      if (m.mode === 'percentPerLevel') percent += lvl * m.value;
      else flat += lvl * m.value;
    }
  }

  return {
    damagePercent: Math.min(percent, MAX_TOTAL_PERCENT_PER_STAT),
    damageFlat: Math.min(flat, MAX_TOTAL_FLAT_PER_STAT),
  };
}

/**
 * Agrège les modificateurs PERMANENTS (effects SANS contexte) d'un personnage,
 * par stat. Consommé par `CharacterStatsCalculator.compute` :
 * `stat = stat × (1 + percent/100) + flat`. Clamps par stat inclus.
 */
export function aggregateMasteryStatModifiers(
  definitions: readonly MasteryEffectsDefinitionLike[],
  masteryLevels: Record<string, number> | null | undefined,
): AggregatedStatModifiers {
  const percent: Record<string, number> = {};
  const flat: Record<string, number> = {};

  for (const def of definitions) {
    if (!def?.enabled) continue;
    // Contexte présent → réservé aux hooks combat, jamais permanent.
    if (def.effects?.context?.weaponType) continue;
    const lvl = effectiveLevels(masteryLevels, def.key);
    if (lvl === 0) continue;
    for (const m of readModifiers(def.effects)) {
      if (m.mode === 'percentPerLevel') {
        percent[m.stat] = (percent[m.stat] ?? 0) + lvl * m.value;
      } else {
        flat[m.stat] = (flat[m.stat] ?? 0) + lvl * m.value;
      }
    }
  }

  for (const stat of Object.keys(percent)) {
    percent[stat] = Math.min(percent[stat], MAX_TOTAL_PERCENT_PER_STAT);
  }
  for (const stat of Object.keys(flat)) {
    flat[stat] = Math.min(flat[stat], MAX_TOTAL_FLAT_PER_STAT);
  }

  return { percent, flat };
}
