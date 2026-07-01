export type SkillDomain =
  | 'combat'
  | 'gathering'
  | 'crafting'
  | 'magic'
  | 'support'
  | 'diplomacy'
  | 'leadership'
  | 'exploration';

/**
 * Contexte transmis par chaque domaine au calculateur d'XP skill.
 *
 * Le domaine est responsable de :
 *   - résoudre skillDefinitionKey (arme équipée, type de ressource, catégorie de recette…)
 *   - construire ce contexte
 *
 * Le calculateur est responsable uniquement de :
 *   - calculer xpAmount
 *
 * Aucune logique de résolution de skill ne figure dans calculateSkillXp.
 */
export interface SkillXpContext {
  /** Clé du skill qui doit progresser — résolue par le domaine appelant, jamais par le calculateur. */
  skillDefinitionKey: string;

  /** Domaine de l'action — utilisé pour déterminer l'XP de base. */
  domain: SkillDomain;

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

  /** Niveau courant du skill concerné. Permet d'ajuster l'XP selon l'écart skill/difficulté. */
  skillLevel: number;

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
