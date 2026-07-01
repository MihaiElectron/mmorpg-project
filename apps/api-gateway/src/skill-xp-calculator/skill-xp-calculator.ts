import { SkillDomain, SkillXpContext } from './skill-xp-context';
import { SkillXpResult } from './skill-xp-result';

// ---------------------------------------------------------------------------
// Constantes de calcul d'XP
// ---------------------------------------------------------------------------

/**
 * XP de base accordée par domaine et action.
 * Valeur par défaut si domaine/action non référencé : DEFAULT_BASE_XP.
 */
const BASE_XP: Partial<Record<SkillDomain, Record<string, number>>> = {
  combat: {
    attack_hit: 5,
    ranged_hit: 5,
    parry: 4,
    block: 3,
    heal: 6,
    buff: 3,
    debuff: 3,
  },
  gathering: {
    gather: 10,
  },
  crafting: {
    craft: 15,
  },
  diplomacy: {
    persuade: 12,
  },
  exploration: {
    discover: 20,
  },
};

const DEFAULT_BASE_XP = 5;

/** Diviseur de la difficulté pour le bonus d'XP. difficulty=50 → +5 XP. */
const DIFFICULTY_DIVISOR = 10;

/** Bonus maximum accordé par la qualité. quality=1.0 → +MAX_QUALITY_BONUS XP. */
const MAX_QUALITY_BONUS = 5;

// ---------------------------------------------------------------------------
// Calcul du montant d'XP
// ---------------------------------------------------------------------------

function computeXpAmount(context: SkillXpContext): number {
  if (!context.success) return 0;

  const base = BASE_XP[context.domain]?.[context.action] ?? DEFAULT_BASE_XP;

  const difficultyBonus = Math.floor(
    Math.max(0, context.difficulty) / DIFFICULTY_DIVISOR,
  );

  const qualityBonus =
    context.quality != null
      ? Math.round(Math.max(0, Math.min(1, context.quality)) * MAX_QUALITY_BONUS)
      : 0;

  return Math.max(1, Math.round(base + difficultyBonus + qualityBonus));
}

// ---------------------------------------------------------------------------
// Point d'entrée public
// ---------------------------------------------------------------------------

/**
 * Calcule le montant d'XP à accorder pour une action gameplay.
 *
 * Fonction pure : aucun I/O, aucun effet de bord, aucun accès réseau ou BD.
 * Aucune logique de résolution de skill — le domaine appelant fournit skillDefinitionKey.
 *
 * Retourne null si :
 * - l'action a échoué (success: false)
 * - le calcul produit 0 XP
 */
export function calculateSkillXp(context: SkillXpContext): SkillXpResult | null {
  const xpAmount = computeXpAmount(context);
  if (xpAmount <= 0) return null;

  return { skillDefinitionKey: context.skillDefinitionKey, xpAmount };
}
