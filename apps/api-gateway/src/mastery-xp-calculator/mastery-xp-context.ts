export type MasteryDomain =
  | 'combat'
  | 'gathering'
  | 'crafting'
  | 'magic'
  | 'support'
  | 'diplomacy'
  | 'leadership'
  | 'exploration';

/**
 * Contexte transmis par chaque domaine au calculateur d'XP mastery.
 *
 * Le domaine est responsable de :
 *   - résoudre masteryDefinitionKey (arme équipée, type de ressource, catégorie de recette…)
 *   - construire ce contexte
 *
 * Le calculateur est responsable uniquement de :
 *   - calculer xpAmount
 *
 * Aucune logique de résolution de mastery ne figure dans calculateMasteryXp.
 */
export interface MasteryXpContext {
  /** Clé du mastery qui doit progresser — résolue par le domaine appelant, jamais par le calculateur. */
  masteryDefinitionKey: string;

  /** Domaine de l'action — utilisé pour déterminer l'XP de base. */
  domain: MasteryDomain;

  /**
   * Type précis de l'action effectuée.
   * Exemples : 'attack_hit', 'parry', 'block', 'ranged_hit', 'gather', 'craft', 'heal', 'buff', 'persuade'.
   */
  action: string;

  /** L'action a-t-elle réussi ? Les actions échouées n'accordent pas d'XP. */
  success: boolean;

  /**
   * Niveau de difficulté de la cible / ressource / recette (1–100).
   * Influence positivement le montant d'XP accordé.
   */
  difficulty: number;

  /**
   * Qualité du résultat produit (0.0 = minimum, 1.0 = maximum).
   * null si non applicable (combat, exploration…).
   */
  quality: number | null;

  /** Niveau courant du personnage. */
  characterLevel: number;

  /** Niveau courant du mastery concerné. Permet d'ajuster l'XP selon l'écart mastery/difficulté. */
  masteryLevel: number;

  /** Durée de l'action en millisecondes. null si non applicable. */
  duration: number | null;

  /** Dégâts infligés à la cible. null si non applicable. */
  damage: number | null;

  /** Dégâts bloqués (bouclier, parade). null si non applicable. */
  blockedDamage: number | null;

  /** Points de vie soignés. null si non applicable. */
  healedAmount: number | null;

  /** Clés des buffs actifs pouvant influencer le calcul d'XP. */
  buffs: string[];

  /** Clés des debuffs actifs. */
  debuffs: string[];
}
