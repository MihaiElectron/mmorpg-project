/**
 * CombatDamageCalculator — calcul de dégâts PUR (Combat V1).
 * ---------------------------------------------------------------------------
 * Aucun accès DB, aucun socket, aucun effet de bord. Contrat de résolution
 * (docs/08_Gameplay/combat-resolution.md) — évitement puis deux blocs séparés :
 *
 *   HIT AVOIDANCE (esquive du DÉFENSEUR, avant tout le reste) :
 *     isDodged = defenderDodgeChancePercent > 0 && rng() < defenderDodgeChancePercent / 100
 *     → si esquivé : dégâts 0, pas de critique, pas d'armure, pas de pénétration.
 *
 *   BLOC ATTAQUE (offensif, critique inclus — seulement si non esquivé) :
 *     effectiveAttack  = max(attackerValue, minimumAttack)
 *     isCritical       = criticalChancePercent > 0 && rng() < criticalChancePercent / 100
 *     attackPowerFinal = isCritical ? round(effectiveAttack × criticalDamagePercent / 100)
 *                                   : effectiveAttack
 *
 *   BLOC DÉFENSE (défensif, pénétration EN DERNIER) :
 *     ratio          = clamp(armorPenetrationPercent, 0, 100) / 100
 *     effectiveArmor = physical ? max(0, round(targetDefense × (1 − ratio))) : 0
 *
 *   RÉSOLUTION :
 *     rawDamage   = attackPowerFinal − effectiveArmor
 *     finalDamage = max(rawDamage, minimumDamage)
 *     hpAfter     = max(hpBefore − finalDamage, 0)
 *
 * `armorPenetrationPercent` défaut 0 et `damageType` défaut `physical` → à 0 %,
 * `effectiveArmor = targetDefense` (comportement historique). `criticalChancePercent`
 * défaut 0 → jamais de critique (`attackPowerFinal = effectiveAttack`, historique
 * inchangé). `damageType: 'raw'` ignore armure + pénétration mais reste soumis au
 * bloc attaque (donc au critique). `rng` injectable (défaut `Math.random`) pour
 * des tests déterministes. Le critique appartient au BLOC ATTAQUE et s'applique
 * AVANT la soustraction d'armure.
 *
 * Note : `armorPenetrationPercent` est une propriété de l'ATTAQUANT / du hit.
 * Un futur `armorReductionPercent` (debuff sur la CIBLE) est hors scope.
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
  /**
   * Chance de critique en POURCENTAGE (stat dérivée `criticalChance`, ex. 25 =
   * 25 %). Clampée 0–100, NaN → 0. Défaut 0 → jamais de critique. Bloc attaque.
   */
  criticalChancePercent?: number;
  /**
   * Multiplicateur critique TOTAL en pourcentage (stat dérivée `criticalDamage`,
   * ex. 150 = ×1.5). Appliqué uniquement si le hit est critique. Défaut 100 (×1).
   */
  criticalDamagePercent?: number;
  /**
   * Chance d'esquive du DÉFENSEUR en POURCENTAGE (stat dérivée `dodgeChance`,
   * ex. 25 = 25 %). Clampée 0–100, NaN → 0. Défaut 0 → jamais d'esquive
   * (comportement historique). Évaluée AVANT le bloc attaque : un hit esquivé
   * n'est ni critique ni mitigé par l'armure et inflige 0 dégât.
   */
  defenderDodgeChancePercent?: number;
  /**
   * Générateur aléatoire injectable renvoyant [0, 1). Défaut `Math.random`.
   * Fourni par les tests pour un roll déterministe (esquive puis critique).
   * Serveur uniquement.
   */
  rng?: () => number;
}

export interface CombatDamageResult {
  attackerValue: number;
  effectiveAttack: number;
  targetDefense: number;
  damageType: DamageType;
  armorPenetrationPercent: number;
  effectiveArmor: number;
  /** V4-F : true si le défenseur a esquivé (aucun dégât, pas de critique). */
  isDodged: boolean;
  defenderDodgeChancePercent: number;
  /** true si le hit est critique (roll < criticalChancePercent / 100). */
  isCritical: boolean;
  criticalChancePercent: number;
  criticalDamagePercent: number;
  /** Valeur d'attaque après bloc attaque (critique inclus), avant armure. */
  attackPowerFinal: number;
  rawDamage: number;
  finalDamage: number;
  hpBefore: number;
  hpAfter: number;
}

export function calculateCombatDamage(input: CombatDamageInput): CombatDamageResult {
  const { attackerValue, targetDefense, minimumAttack, minimumDamage, hpBefore } = input;
  const damageType: DamageType = input.damageType === 'raw' ? 'raw' : 'physical';
  const rng = input.rng ?? Math.random;

  const effectiveAttack = Math.max(attackerValue, minimumAttack);

  const rawChance = input.criticalChancePercent;
  const criticalChancePercent =
    typeof rawChance === 'number' && Number.isFinite(rawChance)
      ? Math.min(100, Math.max(0, rawChance))
      : 0;
  const rawCritDamage = input.criticalDamagePercent;
  const criticalDamagePercent =
    typeof rawCritDamage === 'number' && Number.isFinite(rawCritDamage)
      ? Math.max(0, rawCritDamage)
      : 100;

  // ── Hit avoidance : esquive du défenseur (AVANT tout le reste) ─────────────
  // Défensif : NaN/négatif → 0, borné 100. Le roll d'esquive précède le critique
  // (un hit esquivé ne peut pas être critique). Court-circuit : 0 dégât.
  const rawDodge = input.defenderDodgeChancePercent;
  const defenderDodgeChancePercent =
    typeof rawDodge === 'number' && Number.isFinite(rawDodge)
      ? Math.min(100, Math.max(0, rawDodge))
      : 0;
  const isDodged = defenderDodgeChancePercent > 0 && rng() < defenderDodgeChancePercent / 100;
  if (isDodged) {
    return {
      attackerValue,
      effectiveAttack,
      targetDefense,
      damageType,
      armorPenetrationPercent: 0,
      effectiveArmor: 0,
      isDodged: true,
      defenderDodgeChancePercent,
      isCritical: false,
      criticalChancePercent,
      criticalDamagePercent,
      attackPowerFinal: 0,
      rawDamage: 0,
      finalDamage: 0,
      hpBefore,
      hpAfter: hpBefore,
    };
  }

  // ── Bloc attaque (offensif) : critique éventuel (si non esquivé) ───────────
  const isCritical = criticalChancePercent > 0 && rng() < criticalChancePercent / 100;
  const attackPowerFinal = isCritical
    ? Math.round(effectiveAttack * (criticalDamagePercent / 100))
    : effectiveAttack;

  // ── Bloc défense : pénétration d'armure appliquée EN DERNIER ───────────────
  // Défensif : NaN/Infinity/négatif → 0, borné à 100.
  const rawPct = input.armorPenetrationPercent;
  const armorPenetrationPercent =
    typeof rawPct === 'number' && Number.isFinite(rawPct)
      ? Math.min(100, Math.max(0, rawPct))
      : 0;
  const ratio = armorPenetrationPercent / 100;
  // Dégâts bruts : ignorent totalement l'armure ET la pénétration.
  const effectiveArmor =
    damageType === 'raw' ? 0 : Math.max(0, Math.round(targetDefense * (1 - ratio)));

  // ── Résolution ─────────────────────────────────────────────────────────────
  const rawDamage = attackPowerFinal - effectiveArmor;
  const finalDamage = Math.max(rawDamage, minimumDamage);
  const hpAfter = Math.max(hpBefore - finalDamage, 0);

  return {
    attackerValue,
    effectiveAttack,
    targetDefense,
    damageType,
    armorPenetrationPercent,
    effectiveArmor,
    isDodged: false,
    defenderDodgeChancePercent,
    isCritical,
    criticalChancePercent,
    criticalDamagePercent,
    attackPowerFinal,
    rawDamage,
    finalDamage,
    hpBefore,
    hpAfter,
  };
}
