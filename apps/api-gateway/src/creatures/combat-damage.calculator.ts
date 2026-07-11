/**
 * CombatDamageCalculator — calcul de dégâts PUR (Combat V1).
 * ---------------------------------------------------------------------------
 * Aucun accès DB, aucun socket, aucun effet de bord. Modèle (V4-A, pénétration
 * d'armure en POURCENTAGE) :
 *   effectiveAttack = max(attackerValue, minimumAttack)
 *   ratio           = clamp(armorPenetrationPercent, 0, 100) / 100
 *   effectiveArmor  = physical ? max(0, round(targetDefense × (1 − ratio))) : 0
 *   rawDamage       = effectiveAttack − effectiveArmor
 *   finalDamage     = max(rawDamage, minimumDamage)
 *   hpAfter         = max(hpBefore − finalDamage, 0)
 *
 * `armorPenetrationPercent` par défaut 0 et `damageType` par défaut `physical`
 * → à 0 %, `effectiveArmor = targetDefense` : comportement STRICTEMENT identique
 * à l'historique (dégâts − armure pleine). `damageType: 'raw'` ignore totalement
 * l'armure ET la pénétration (dégâts bruts). Arrondi : `effectiveArmor` arrondi
 * à l'entier le plus proche (les PV et dégâts restent entiers). Les appelants
 * garantissent des nombres finis pour attackerValue/targetDefense.
 *
 * Note : `armorPenetrationPercent` est une propriété de l'ATTAQUANT / du hit.
 * Un futur `armorReductionPercent` (debuff sur la CIBLE) est hors scope et ne
 * doit pas être confondu avec cette pénétration.
 */

export type DamageType = 'physical' | 'raw';

export interface CombatDamageInput {
  /** Valeur d'attaque brute (ex. physicalAttack joueur, attackPower créature). */
  attackerValue: number;
  /** Armure/défense de la cible (ex. creature.defenseTotal, player derived defense). */
  targetDefense: number;
  /** Plancher appliqué à l'attaque (5 pour le joueur, 0 pour la riposte créature). */
  minimumAttack: number;
  /** Plancher appliqué aux dégâts finaux (1 aujourd'hui). */
  minimumDamage: number;
  /** PV de la cible avant l'application des dégâts. */
  hpBefore: number;
  /**
   * Pénétration d'armure de l'attaquant en POURCENTAGE (V4-A, stat dérivée
   * offensive `armorPenetrationPercent`). Ignore ce % de l'armure de la cible
   * pour ce hit. Clampée 0–100, NaN/Infinity → 0. Défaut 0. Ignorée si raw.
   */
  armorPenetrationPercent?: number;
  /**
   * Type de dégâts. `physical` (défaut) applique l'armure (et la pénétration) ;
   * `raw` ignore totalement armure et pénétration.
   */
  damageType?: DamageType;
}

export interface CombatDamageResult {
  attackerValue: number;
  effectiveAttack: number;
  targetDefense: number;
  damageType: DamageType;
  armorPenetrationPercent: number;
  effectiveArmor: number;
  rawDamage: number;
  finalDamage: number;
  hpBefore: number;
  hpAfter: number;
}

export function calculateCombatDamage(input: CombatDamageInput): CombatDamageResult {
  const { attackerValue, targetDefense, minimumAttack, minimumDamage, hpBefore } = input;
  const damageType: DamageType = input.damageType === 'raw' ? 'raw' : 'physical';

  // Défensif : NaN/Infinity/négatif → 0, borné à 100 (pas de pénétration
  // négative qui augmenterait l'armure, ni > 100 qui la rendrait négative).
  const rawPct = input.armorPenetrationPercent;
  const armorPenetrationPercent =
    typeof rawPct === 'number' && Number.isFinite(rawPct)
      ? Math.min(100, Math.max(0, rawPct))
      : 0;

  const effectiveAttack = Math.max(attackerValue, minimumAttack);

  // Dégâts bruts : ignorent totalement l'armure ET la pénétration.
  // Physiques : armure réduite du % de pénétration, jamais négative.
  const ratio = armorPenetrationPercent / 100;
  const effectiveArmor =
    damageType === 'raw' ? 0 : Math.max(0, Math.round(targetDefense * (1 - ratio)));

  const rawDamage = effectiveAttack - effectiveArmor;
  const finalDamage = Math.max(rawDamage, minimumDamage);
  const hpAfter = Math.max(hpBefore - finalDamage, 0);

  return {
    attackerValue,
    effectiveAttack,
    targetDefense,
    damageType,
    armorPenetrationPercent,
    effectiveArmor,
    rawDamage,
    finalDamage,
    hpBefore,
    hpAfter,
  };
}
