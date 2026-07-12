/**
 * CombatDamageCalculator — calcul de dégâts PUR (Combat V1).
 * ---------------------------------------------------------------------------
 * Aucun accès DB, aucun socket, aucun effet de bord. Contrat de résolution
 * (docs/08_Gameplay/combat-resolution.md) — parade, évitement, puis deux blocs :
 *
 *   PARADE (V4-I, réaction active du DÉFENSEUR, EN PREMIER — avant l'esquive) :
 *     effectiveParry = defenderCanParry ? clamp(defenderParryChancePercent, 0, 100) : 0
 *     isParried      = effectiveParry > 0 && rng() < effectiveParry / 100
 *     → si paré : hit entrant ANNULÉ (0 dégât, pas d'esquive/critique/armure/
 *       blocage). La contre-attaque est déclenchée par le SERVICE (jamais ici).
 *
 *   HIT AVOIDANCE (esquive du DÉFENSEUR, réduite par la précision de
 *   l'ATTAQUANT, avant tout le reste) :
 *     effectiveDodge = clamp(defenderDodgeChancePercent − attackerAccuracyPercent, 0, 100)
 *     isDodged       = effectiveDodge > 0 && rng() < effectiveDodge / 100
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
 *     rawDamage       = attackPowerFinal − effectiveArmor
 *     damageAfterArmor = max(rawDamage, minimumDamage)
 *     BLOCAGE (V4-H, physical, dégâts > 0, après armure) :
 *       si blocage : finalDamage = round(damageAfterArmor × (1 − blockReduction/100))
 *                    blockedDamage = damageAfterArmor − finalDamage
 *       sinon      : finalDamage = damageAfterArmor
 *     hpAfter = max(hpBefore − finalDamage, 0)
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
   * Précision de l'ATTAQUANT en POINTS DE POURCENTAGE (V4-G, stat dérivée
   * offensive `accuracy`). Réduit la chance d'esquive EFFECTIVE du défenseur
   * (`effectiveDodge = clamp(dodge − accuracy, 0, 100)`). NaN/Infinity/négatif
   * → 0. Défaut 0. Ce n'est PAS une chance de toucher séparée : sans esquive
   * défenseur, la précision n'a aucun effet.
   */
  attackerAccuracyPercent?: number;
  /**
   * Chance de blocage du DÉFENSEUR en POURCENTAGE (V4-H, stat dérivée
   * `blockChance`). Évaluée APRÈS esquive, critique et armure, sur les dégâts
   * physiques restants (> 0). Clampée 0–100, NaN → 0. Défaut 0. Ignorée si raw
   * ou si les dégâts après armure sont déjà 0.
   */
  defenderBlockChancePercent?: number;
  /**
   * Pourcentage de réduction appliqué QUAND un blocage réussit (V4-H, stat
   * dérivée `blockReductionPercent`). `finalDamage = round(dmg × (1 − r/100))`.
   * Clampée 0–100, NaN → 0. Défaut 0 (blocage sans effet).
   */
  defenderBlockReductionPercent?: number;
  /**
   * Chance de parade du DÉFENSEUR en POURCENTAGE (V4-I, stat dérivée
   * `parryChance`). Évaluée EN PREMIER, AVANT l'esquive : une parade est une
   * réaction active qui ANNULE le hit entrant et déclenche une contre-attaque
   * (calculée côté service, jamais ici). Clampée 0–100, NaN/Infinity/négatif → 0.
   * Ignorée (effective 0) si `defenderCanParry !== true`.
   */
  defenderParryChancePercent?: number;
  /**
   * Éligibilité de la parade, décidée par le SERVICE (défenseur joueur, attaque
   * corps-à-corps, arme de mêlée équipée, portée suffisante). Le calculateur pur
   * ne lit jamais l'équipement : il reçoit ce booléen. `false`/absent → parade
   * impossible (chance effective 0, aucun roll consommé).
   */
  defenderCanParry?: boolean;
  /**
   * Générateur aléatoire injectable renvoyant [0, 1). Défaut `Math.random`.
   * Fourni par les tests pour un roll déterministe (parade → esquive → critique
   * → blocage). Serveur uniquement.
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
  /**
   * V4-I : true si le défenseur a PARÉ (hit entrant annulé). Prime sur tout :
   * pas d'esquive, pas de critique, pas d'armure, pas de blocage, 0 dégât. La
   * contre-attaque associée est déclenchée par le service.
   */
  isParried: boolean;
  /** V4-I : chance de parade EFFECTIVE appliquée (0 si `defenderCanParry` false). */
  defenderParryChancePercent: number;
  /** V4-F : true si le défenseur a esquivé (aucun dégât, pas de critique). */
  isDodged: boolean;
  defenderDodgeChancePercent: number;
  /** V4-G : précision de l'attaquant appliquée (points de %). */
  attackerAccuracyPercent: number;
  /** V4-G : esquive effective après précision = clamp(dodge − accuracy, 0, 100). */
  effectiveDodgeChancePercent: number;
  /** true si le hit est critique (roll < criticalChancePercent / 100). */
  isCritical: boolean;
  criticalChancePercent: number;
  criticalDamagePercent: number;
  /** Valeur d'attaque après bloc attaque (critique inclus), avant armure. */
  attackPowerFinal: number;
  rawDamage: number;
  /** V4-H : true si le défenseur a bloqué (dégâts réduits). */
  isBlocked: boolean;
  defenderBlockChancePercent: number;
  defenderBlockReductionPercent: number;
  /** V4-H : montant absorbé par le blocage (0 si non bloqué). */
  blockedDamage: number;
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

  // ── Hit avoidance : esquive du défenseur, réduite par la précision (AVANT
  // tout le reste). Défensif : NaN/négatif → 0. La précision de l'attaquant
  // (V4-G) retranche des points à l'esquive : effectiveDodge = clamp(dodge −
  // accuracy, 0, 100). Le roll précède le critique (un hit esquivé ne peut pas
  // être critique). Court-circuit : 0 dégât.
  const rawDodge = input.defenderDodgeChancePercent;
  const defenderDodgeChancePercent =
    typeof rawDodge === 'number' && Number.isFinite(rawDodge)
      ? Math.min(100, Math.max(0, rawDodge))
      : 0;
  const rawAccuracy = input.attackerAccuracyPercent;
  const attackerAccuracyPercent =
    typeof rawAccuracy === 'number' && Number.isFinite(rawAccuracy)
      ? Math.max(0, rawAccuracy)
      : 0;
  const effectiveDodgeChancePercent = Math.min(
    100,
    Math.max(0, defenderDodgeChancePercent - attackerAccuracyPercent),
  );

  // Stats de blocage du défenseur (V4-H) — sanitizées ici, appliquées après
  // l'armure. NaN/Infinity/négatif → 0, bornées 0–100.
  const rawBlockChance = input.defenderBlockChancePercent;
  const defenderBlockChancePercent =
    typeof rawBlockChance === 'number' && Number.isFinite(rawBlockChance)
      ? Math.min(100, Math.max(0, rawBlockChance))
      : 0;
  const rawBlockReduction = input.defenderBlockReductionPercent;
  const defenderBlockReductionPercent =
    typeof rawBlockReduction === 'number' && Number.isFinite(rawBlockReduction)
      ? Math.min(100, Math.max(0, rawBlockReduction))
      : 0;

  // ── Parade (V4-I) : réaction active du défenseur, résolue EN PREMIER (avant
  // l'esquive). L'éligibilité (arme de mêlée, portée, défenseur joueur) est
  // décidée par le service via `defenderCanParry` — le calculateur ne lit jamais
  // l'équipement. Chance effective 0 si non éligible : aucun roll consommé
  // (court-circuit `> 0 &&`), donc les pipelines sans parade sont inchangés.
  const canParry = input.defenderCanParry === true;
  const rawParry = input.defenderParryChancePercent;
  const defenderParryChancePercent =
    canParry && typeof rawParry === 'number' && Number.isFinite(rawParry)
      ? Math.min(100, Math.max(0, rawParry))
      : 0;
  const isParried =
    defenderParryChancePercent > 0 && rng() < defenderParryChancePercent / 100;
  if (isParried) {
    // Hit entrant ANNULÉ : 0 dégât, ni esquive, ni critique, ni armure, ni
    // blocage. La contre-attaque est calculée/appliquée par le service.
    return {
      attackerValue,
      effectiveAttack,
      targetDefense,
      damageType,
      armorPenetrationPercent: 0,
      effectiveArmor: 0,
      isParried: true,
      defenderParryChancePercent,
      isDodged: false,
      defenderDodgeChancePercent,
      attackerAccuracyPercent,
      effectiveDodgeChancePercent,
      isCritical: false,
      criticalChancePercent,
      criticalDamagePercent,
      attackPowerFinal: 0,
      rawDamage: 0,
      isBlocked: false,
      defenderBlockChancePercent,
      defenderBlockReductionPercent,
      blockedDamage: 0,
      finalDamage: 0,
      hpBefore,
      hpAfter: hpBefore,
    };
  }

  const isDodged =
    effectiveDodgeChancePercent > 0 && rng() < effectiveDodgeChancePercent / 100;
  if (isDodged) {
    return {
      attackerValue,
      effectiveAttack,
      targetDefense,
      damageType,
      armorPenetrationPercent: 0,
      effectiveArmor: 0,
      isParried: false,
      defenderParryChancePercent,
      isDodged: true,
      defenderDodgeChancePercent,
      attackerAccuracyPercent,
      effectiveDodgeChancePercent,
      isCritical: false,
      criticalChancePercent,
      criticalDamagePercent,
      attackPowerFinal: 0,
      rawDamage: 0,
      isBlocked: false,
      defenderBlockChancePercent,
      defenderBlockReductionPercent,
      blockedDamage: 0,
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
  const damageAfterArmor = Math.max(rawDamage, minimumDamage);

  // ── Blocage (V4-H) : après esquive + critique + armure, sur les dégâts
  // physiques restants (> 0). raw ignore le blocage. Le roll suit le critique.
  let isBlocked = false;
  let finalDamage = damageAfterArmor;
  let blockedDamage = 0;
  if (
    damageType === 'physical' &&
    damageAfterArmor > 0 &&
    defenderBlockChancePercent > 0 &&
    rng() < defenderBlockChancePercent / 100
  ) {
    isBlocked = true;
    finalDamage = Math.round(damageAfterArmor * (1 - defenderBlockReductionPercent / 100));
    blockedDamage = damageAfterArmor - finalDamage;
  }

  const hpAfter = Math.max(hpBefore - finalDamage, 0);

  return {
    attackerValue,
    effectiveAttack,
    targetDefense,
    damageType,
    armorPenetrationPercent,
    effectiveArmor,
    isParried: false,
    defenderParryChancePercent,
    isDodged: false,
    defenderDodgeChancePercent,
    attackerAccuracyPercent,
    effectiveDodgeChancePercent,
    isCritical,
    criticalChancePercent,
    criticalDamagePercent,
    attackPowerFinal,
    rawDamage,
    isBlocked,
    defenderBlockChancePercent,
    defenderBlockReductionPercent,
    blockedDamage,
    finalDamage,
    hpBefore,
    hpAfter,
  };
}
