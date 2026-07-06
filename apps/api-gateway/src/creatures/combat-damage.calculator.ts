/**
 * CombatDamageCalculator — calcul de dégâts PUR (Combat V1).
 * ---------------------------------------------------------------------------
 * Aucun accès DB, aucun socket, aucun effet de bord. Reproduit EXACTEMENT le
 * calcul historiquement inline dans `CreaturesService.attack()` :
 *   effectiveAttack = max(attackerValue, minimumAttack)
 *   rawDamage       = effectiveAttack - targetDefense
 *   finalDamage     = max(rawDamage, minimumDamage)
 *   hpAfter         = max(hpBefore - finalDamage, 0)
 *
 * Le détail retourné prépare les futurs logs / formules de combat sans changer
 * le comportement. Les appelants garantissent des nombres finis.
 */

export interface CombatDamageInput {
  /** Valeur d'attaque brute (ex. physicalAttack joueur, attackPower créature). */
  attackerValue: number;
  /** Défense de la cible (ex. creature.defenseTotal, player derived defense). */
  targetDefense: number;
  /** Plancher appliqué à l'attaque (5 pour le joueur, 0 pour la riposte créature). */
  minimumAttack: number;
  /** Plancher appliqué aux dégâts finaux (1 aujourd'hui). */
  minimumDamage: number;
  /** PV de la cible avant l'application des dégâts. */
  hpBefore: number;
}

export interface CombatDamageResult {
  attackerValue: number;
  effectiveAttack: number;
  targetDefense: number;
  rawDamage: number;
  finalDamage: number;
  hpBefore: number;
  hpAfter: number;
}

export function calculateCombatDamage(input: CombatDamageInput): CombatDamageResult {
  const { attackerValue, targetDefense, minimumAttack, minimumDamage, hpBefore } = input;

  const effectiveAttack = Math.max(attackerValue, minimumAttack);
  const rawDamage = effectiveAttack - targetDefense;
  const finalDamage = Math.max(rawDamage, minimumDamage);
  const hpAfter = Math.max(hpBefore - finalDamage, 0);

  return {
    attackerValue,
    effectiveAttack,
    targetDefense,
    rawDamage,
    finalDamage,
    hpBefore,
    hpAfter,
  };
}
