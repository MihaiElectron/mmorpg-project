/**
 * resolveCombatHit — couche commune de résolution d'un hit serveur (V5-B0).
 * ---------------------------------------------------------------------------
 * PUR (aucun accès DB/socket/Nest). Centralise le MAPPING stats attaquant /
 * stats défenseur → `CombatDamageInput`, pour que tous les chemins de combat
 * (auto-attaque joueur, riposte créature, contre-attaque, skill) partagent une
 * seule façon d'assembler un hit. Ne change AUCUN comportement : le calcul reste
 * délégué au calculateur pur `calculateCombatDamage`, et le résultat (avec ses
 * flags d'event : isDodged / isCritical / isBlocked / isParried / blockedDamage /
 * finalDamage / hpAfter) est renvoyé tel quel.
 *
 * Ce resolver ne lit jamais l'équipement ni les stats brutes : l'appelant lui
 * fournit des valeurs DÉJÀ calculées (dérivées serveur). L'éligibilité de la
 * parade (`canParry`) est décidée par l'appelant (arme de mêlée, portée…).
 */

import {
  calculateCombatDamage,
  CombatDamageResult,
  DamageType,
} from './combat-damage.calculator';

/** Stats offensives de l'attaquant pour un hit (déjà calculées serveur). */
export interface CombatHitAttacker {
  /** Valeur d'attaque de base (ex. physicalAttack, attackPower créature, montant skill). */
  attackPower: number;
  /** Plancher d'attaque (5 pour l'auto-attaque joueur, 0 sinon). Défaut 0. */
  minimumAttack?: number;
  /** Pénétration d'armure en % (V4-A). Défaut 0. Ignorée en `raw`. */
  armorPenetrationPercent?: number;
  /** Chance de critique en % (V4-D). Défaut 0 → jamais de critique. */
  criticalChancePercent?: number;
  /** Multiplicateur critique total en % (V4-D). Défaut 100 (×1). */
  criticalDamagePercent?: number;
  /** Précision en points de % (V4-G) réduisant l'esquive du défenseur. Défaut 0. */
  accuracyPercent?: number;
}

/** Stats défensives du défenseur pour un hit (déjà calculées serveur). */
export interface CombatHitDefender {
  /** Armure/défense effective. */
  defense: number;
  /** Esquive en % (V4-F). Défaut 0. */
  dodgeChancePercent?: number;
  /** Blocage en % (V4-H). Défaut 0. */
  blockChancePercent?: number;
  /** Réduction appliquée si blocage réussi, en % (V4-H). Défaut 0. */
  blockReductionPercent?: number;
  /** Parade en % (V4-I). Défaut 0. Ignorée si `canParry` ≠ true. */
  parryChancePercent?: number;
  /** Éligibilité parade décidée par l'appelant (arme de mêlée, portée). Défaut false. */
  canParry?: boolean;
  /**
   * Résistance magique EFFECTIVE de la cible (globale + école), déjà résolue par
   * l'appelant via le pipeline générique (ADR-0022). Points de %, non clampée.
   * Consommée uniquement si `damageType === 'magic'`. Défaut 0.
   */
  effectiveMagicResistance?: number;
}

export interface CombatHitInput {
  attacker: CombatHitAttacker;
  defender: CombatHitDefender;
  /** `physical` (défaut, armure + pénétration) ou `raw` (ignore armure/pénétration/blocage). */
  damageType?: DamageType;
  /** Plancher des dégâts finaux. Défaut 1. */
  minimumDamage?: number;
  /** PV de la cible avant le hit. */
  hpBefore: number;
  /** RNG injectable (parade → esquive → critique → blocage). Défaut `Math.random`. */
  rng?: () => number;
}

/**
 * Assemble un `CombatDamageInput` depuis les stats attaquant/défenseur et
 * délègue au calculateur pur. Le résultat porte tous les flags d'event.
 */
export function resolveCombatHit(input: CombatHitInput): CombatDamageResult {
  const { attacker, defender } = input;
  return calculateCombatDamage({
    attackerValue: attacker.attackPower,
    minimumAttack: attacker.minimumAttack ?? 0,
    armorPenetrationPercent: attacker.armorPenetrationPercent,
    criticalChancePercent: attacker.criticalChancePercent,
    criticalDamagePercent: attacker.criticalDamagePercent,
    attackerAccuracyPercent: attacker.accuracyPercent,
    targetDefense: defender.defense,
    defenderDodgeChancePercent: defender.dodgeChancePercent,
    defenderBlockChancePercent: defender.blockChancePercent,
    defenderBlockReductionPercent: defender.blockReductionPercent,
    defenderParryChancePercent: defender.parryChancePercent,
    defenderCanParry: defender.canParry,
    effectiveMagicResistance: defender.effectiveMagicResistance,
    damageType: input.damageType,
    minimumDamage: input.minimumDamage ?? 1,
    hpBefore: input.hpBefore,
    rng: input.rng,
  });
}
