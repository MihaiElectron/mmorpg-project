/**
 * Mastery Effects (Masteries V1-D-A) — sanitization et calcul PURS.
 * ---------------------------------------------------------------------------
 * Aucune dépendance NestJS, aucun accès DB, aucun effet de bord — même style
 * que `calculateSkillEffect` et `computeCraftSuccessRate`.
 *
 * Deux responsabilités, deux stratégies :
 *
 * - ÉCRITURE (`sanitizeMasteryEffects`) : validation STRICTE. Toute clé
 *   inconnue, tout type invalide, toute borne dépassée est REFUSÉE
 *   (`MasteryEffectsValidationError`) — même philosophie que le
 *   ValidationPipe `forbidNonWhitelisted`. Le stockage final est toujours
 *   propre : aucun effet non supporté n'est persisté.
 *
 * - LECTURE (`computeCombatMasteryEffects`) : calcul DÉFENSIF. Une valeur
 *   corrompue en base (non finie, négative, hors borne) est ignorée ou
 *   clampée, jamais levée — un catalogue sale ne doit pas casser un hit.
 *
 * Formule V1 :
 *   bonus = (masteryLevel − 1) × percentPerLevel
 *
 * `PlayerMastery` démarre à level 1 (et `getCharacterMasteries` renvoie
 * level 1 pour toute mastery jamais pratiquée) : le « −1 » garantit qu'une
 * mastery non entraînée n'accorde AUCUN bonus. Le total est clampé à
 * `MAX_TOTAL_COMBAT_DAMAGE_PERCENT` (garde-fou serveur : maxLevel par défaut
 * = 100, et l'ADR-0018 prévoit des caps à 1000 — un clamp dur est
 * indispensable quelle que soit la config).
 *
 * V1-D-A : seul `combat.damagePercentPerLevel` est accepté. Les effets futurs
 * (stun, knockback, block, craft success/quality) seront whitelistés quand
 * leur hook gameplay existera — on ne stocke pas de promesses mortes.
 */

/** Borne d'écriture par niveau (percent). 0–5 : à 5 %/niveau, le clamp total est atteint dès le niveau 11. */
export const MAX_PERCENT_PER_LEVEL = 5;

/** Clamp serveur du bonus de dégâts total, en percent (V1). */
export const MAX_TOTAL_COMBAT_DAMAGE_PERCENT = 50;

/**
 * Format des types d'arme — même contrat que `item.weaponType` (string libre
 * en base : `two_handed_sword`, `bow`, futur `dagger`…). Validation de format,
 * pas d'enum : le catalogue d'armes est extensible sans redéploiement.
 */
const WEAPON_TYPE_PATTERN = /^[a-z0-9_]+$/;

export interface MasteryEffectsContext {
  weaponType?: string;
}

export interface MasteryCombatEffects {
  damagePercentPerLevel?: number;
}

/** Structure persistée dans `mastery_definition.effects` (JSONB). `{}` = aucun effet. */
export interface MasteryEffects {
  context?: MasteryEffectsContext;
  combat?: MasteryCombatEffects;
}

/** Vue structurelle minimale d'une définition — évite le couplage à l'entité TypeORM. */
export interface MasteryEffectsDefinitionLike {
  key: string;
  enabled: boolean;
  effects?: MasteryEffects | null;
}

/** Contexte réel du personnage au moment du calcul (source serveur uniquement). */
export interface CombatMasteryContext {
  weaponType?: string | null;
}

/** Sortie V1 — étendue plus tard (armorPen, stun…) quand les hooks existeront. */
export interface CombatMasteryEffectsResult {
  damagePercent: number;
}

/** Erreur de validation à l'écriture — convertie en BadRequestException par le service. */
export class MasteryEffectsValidationError extends Error {}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new MasteryEffectsValidationError(
        `effects.${path}${key} n'est pas un effet supporté (V1 : ${allowed.join(', ')}).`,
      );
    }
  }
}

/**
 * Valide et normalise un `effects` entrant (CRUD admin). Strict : lève
 * `MasteryEffectsValidationError` sur toute structure non supportée.
 *
 * Règles :
 * - absent / null → `{}` (aucun effet) ;
 * - seuls les groupes `context` et `combat` sont acceptés ;
 * - `context.weaponType` : string non vide au format [a-z0-9_] ;
 * - `combat.damagePercentPerLevel` : nombre fini, 0 ≤ x ≤ MAX_PERCENT_PER_LEVEL ;
 * - un effet combat requiert un `context.weaponType` (les effets V1 sont
 *   contextuels par définition — pas de bonus de dégâts global) ;
 * - les groupes vides sont retirés du stockage.
 */
export function sanitizeMasteryEffects(raw: unknown): MasteryEffects {
  if (raw === undefined || raw === null) return {};
  if (!isPlainObject(raw)) {
    throw new MasteryEffectsValidationError('effects doit être un objet.');
  }
  rejectUnknownKeys(raw, ['context', 'combat'], '');

  const out: MasteryEffects = {};

  if (raw.context !== undefined) {
    if (!isPlainObject(raw.context)) {
      throw new MasteryEffectsValidationError('effects.context doit être un objet.');
    }
    rejectUnknownKeys(raw.context, ['weaponType'], 'context.');
    const weaponType = raw.context.weaponType;
    if (weaponType !== undefined) {
      if (typeof weaponType !== 'string' || !WEAPON_TYPE_PATTERN.test(weaponType)) {
        throw new MasteryEffectsValidationError(
          'effects.context.weaponType doit être une string au format [a-z0-9_].',
        );
      }
      out.context = { weaponType };
    }
  }

  if (raw.combat !== undefined) {
    if (!isPlainObject(raw.combat)) {
      throw new MasteryEffectsValidationError('effects.combat doit être un objet.');
    }
    rejectUnknownKeys(raw.combat, ['damagePercentPerLevel'], 'combat.');
    const perLevel = raw.combat.damagePercentPerLevel;
    if (perLevel !== undefined) {
      if (!isFiniteNumber(perLevel)) {
        throw new MasteryEffectsValidationError(
          'effects.combat.damagePercentPerLevel doit être un nombre fini.',
        );
      }
      if (perLevel < 0 || perLevel > MAX_PERCENT_PER_LEVEL) {
        throw new MasteryEffectsValidationError(
          `effects.combat.damagePercentPerLevel doit être entre 0 et ${MAX_PERCENT_PER_LEVEL}.`,
        );
      }
      out.combat = { damagePercentPerLevel: perLevel };
    }
  }

  if (out.combat?.damagePercentPerLevel !== undefined && !out.context?.weaponType) {
    throw new MasteryEffectsValidationError(
      'effects.combat requiert effects.context.weaponType (les effets V1 sont contextuels).',
    );
  }

  return out;
}

/**
 * Calcule le bonus de dégâts combat pour un contexte donné.
 *
 * Fonction PURE et défensive :
 * - pas de weaponType équipé → 0 ;
 * - mastery disabled ou effects vide → ignorée ;
 * - `context.weaponType` de l'effet ≠ weaponType équipé → ignorée ;
 * - level absent / 0 / 1 → 0 (formule `(level − 1) × perLevel`) ;
 * - perLevel corrompu en base (non fini, ≤ 0) → ignoré ; > borne → clampé ;
 * - plusieurs masteries matchées → somme ;
 * - total clampé à MAX_TOTAL_COMBAT_DAMAGE_PERCENT.
 */
export function computeCombatMasteryEffects(
  definitions: readonly MasteryEffectsDefinitionLike[],
  masteryLevels: Record<string, number> | null | undefined,
  context: CombatMasteryContext,
): CombatMasteryEffectsResult {
  const weaponType = context?.weaponType;
  if (!weaponType) return { damagePercent: 0 };

  const levels = masteryLevels ?? {};
  let total = 0;

  for (const def of definitions) {
    if (!def?.enabled) continue;
    const effects = def.effects;
    if (!effects || effects.context?.weaponType !== weaponType) continue;

    const rawPerLevel = effects.combat?.damagePercentPerLevel;
    if (!isFiniteNumber(rawPerLevel) || rawPerLevel <= 0) continue;
    const perLevel = Math.min(rawPerLevel, MAX_PERCENT_PER_LEVEL);

    const rawLevel = levels[def.key];
    const effectiveLevels = isFiniteNumber(rawLevel) ? Math.max(0, rawLevel - 1) : 0;
    if (effectiveLevels === 0) continue;

    total += effectiveLevels * perLevel;
  }

  return { damagePercent: Math.min(total, MAX_TOTAL_COMBAT_DAMAGE_PERCENT) };
}
