/**
 * CombatDamageCalculator — calcul de dégâts PUR (Combat V1).
 * ---------------------------------------------------------------------------
 * Aucun accès DB, aucun socket, aucun effet de bord. Reproduit EXACTEMENT le
 * calcul historiquement inline dans `CreaturesService.attack()`, étendu V4-A
 * par la pénétration de défense (attaquant) :
 *   effectiveDefense = max(0, targetDefense - attackerDefensePenetration)
 *   effectiveAttack  = max(attackerValue, minimumAttack)
 *   rawDamage        = effectiveAttack - effectiveDefense
 *   finalDamage      = max(rawDamage, minimumDamage)
 *   hpAfter          = max(hpBefore - finalDamage, 0)
 *
 * `attackerDefensePenetration` par défaut 0 → comportement strictement
 * identique à l'historique. Le détail retourné prépare les futurs logs /
 * formules de combat. Les appelants garantissent des nombres finis.
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
  /**
   * Pénétration de défense de l'attaquant (V4-A, stat dérivée offensive).
   * Réduit la défense effective de la cible, jamais sous 0. Défaut 0.
   */
  attackerDefensePenetration?: number;
}

export interface CombatDamageResult {
  attackerValue: number;
  effectiveAttack: number;
  targetDefense: number;
  attackerDefensePenetration: number;
  effectiveDefense: number;
  rawDamage: number;
  finalDamage: number;
  hpBefore: number;
  hpAfter: number;
}

export function calculateCombatDamage(input: CombatDamageInput): CombatDamageResult {
  const { attackerValue, targetDefense, minimumAttack, minimumDamage, hpBefore } = input;

  // Défensif : une valeur non finie ou négative retombe sur 0 (pas de NaN
  // propagé, pas de pénétration négative qui augmenterait la défense).
  const rawPenetration = input.attackerDefensePenetration;
  const attackerDefensePenetration =
    typeof rawPenetration === 'number' && Number.isFinite(rawPenetration)
      ? Math.max(0, rawPenetration)
      : 0;

  const effectiveDefense = Math.max(0, targetDefense - attackerDefensePenetration);
  const effectiveAttack = Math.max(attackerValue, minimumAttack);
  const rawDamage = effectiveAttack - effectiveDefense;
  const finalDamage = Math.max(rawDamage, minimumDamage);
  const hpAfter = Math.max(hpBefore - finalDamage, 0);

  return {
    attackerValue,
    effectiveAttack,
    targetDefense,
    attackerDefensePenetration,
    effectiveDefense,
    rawDamage,
    finalDamage,
    hpBefore,
    hpAfter,
  };
}
