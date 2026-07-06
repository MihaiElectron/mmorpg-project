/**
 * Décision d'auto-attaque (pure, testable) — arrêt du joueur à portée réelle.
 * ---------------------------------------------------------------------------
 * Le serveur reste l'autorité finale de distance. Ce helper décide, côté client,
 * quand cesser d'avancer et quand émettre une attaque, à partir de la portée
 * effective exposée par le serveur (`character.combat.attackRangeWU`).
 *
 * Hystérésis (évite l'oscillation avance/stop sur cible mobile) :
 * - on s'arrête à `stopRangeWU = attackRangeWU - safetyMarginWU` ;
 * - on ne relance la poursuite que si la distance dépasse `attackRangeWU`.
 */

export const DEFAULT_ATTACK_RANGE_WU = 1280; // fallback UI si valeur serveur absente/invalide
export const DEFAULT_SAFETY_MARGIN_WU = 128;

export interface AutoAttackDecisionInput {
  distanceWU: number;
  attackRangeWU?: number | null;
  safetyMarginWU?: number;
}

export interface AutoAttackDecision {
  canAttack: boolean;
  shouldChase: boolean;
  stopRangeWU: number;
  effectiveRangeWU: number;
}

/** Portée effective utilisée par le client : valeur serveur si valide, sinon fallback. */
function resolveEffectiveRangeWU(attackRangeWU?: number | null): number {
  if (typeof attackRangeWU === 'number' && Number.isFinite(attackRangeWU) && attackRangeWU > 0) {
    return attackRangeWU;
  }
  return DEFAULT_ATTACK_RANGE_WU;
}

export function getAutoAttackRangeDecision({
  distanceWU,
  attackRangeWU,
  safetyMarginWU = DEFAULT_SAFETY_MARGIN_WU,
}: AutoAttackDecisionInput): AutoAttackDecision {
  const effectiveRangeWU = resolveEffectiveRangeWU(attackRangeWU);
  const margin = Number.isFinite(safetyMarginWU) && safetyMarginWU > 0 ? safetyMarginWU : 0;
  const stopRangeWU = Math.max(0, effectiveRangeWU - margin);

  // Dans la portée effective → on peut frapper, inutile de poursuivre.
  if (distanceWU <= effectiveRangeWU) {
    return { canAttack: true, shouldChase: false, stopRangeWU, effectiveRangeWU };
  }

  // Hors portée → poursuivre, ne pas frapper (le serveur refuserait de toute façon).
  return { canAttack: false, shouldChase: true, stopRangeWU, effectiveRangeWU };
}
