import { PersonalLootEntitlementStatus as S } from './enums/personal-loot-entitlement-status.enum';
import { PersonalLootInvalidTransitionError } from './personal-loot-entitlement.errors';

/**
 * Politique de transition PURE du cycle de vie d'un droit de butin personnel.
 *
 * Aucune dépendance NestJS/TypeORM : fonction testable isolément, réutilisée par
 * le service transactionnel. Ne réalise AUCUN effet gameplay (Lot 1).
 *
 * Transitions autorisées :
 *   ground  → claimed | mailed | cancelled
 *   mailed  → claimed | expired | cancelled
 *
 * États terminaux (aucune sortie) : claimed, expired, cancelled.
 *
 * Règle idempotente : état courant === état demandé ⇒ succès sans changement.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<S, readonly S[]>> = {
  [S.GROUND]: [S.CLAIMED, S.MAILED, S.CANCELLED],
  [S.MAILED]: [S.CLAIMED, S.EXPIRED, S.CANCELLED],
  [S.CLAIMED]: [],
  [S.EXPIRED]: [],
  [S.CANCELLED]: [],
};

/** Vrai si `from → to` est une transition explicitement autorisée (hors retry). */
export function isTransitionAllowed(from: S, to: S): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Résultat d'une évaluation de transition.
 * - `noop: true`  → retry idempotent (from === to), rien à persister ;
 * - `noop: false` → transition valide à appliquer.
 * Une transition interdite lève {@link PersonalLootInvalidTransitionError}.
 */
export interface TransitionDecision {
  readonly noop: boolean;
}

/**
 * Évalue une demande de transition selon la politique pure.
 *
 * @throws PersonalLootInvalidTransitionError si `from → to` est interdit.
 */
export function evaluateTransition(from: S, to: S): TransitionDecision {
  if (from === to) {
    return { noop: true };
  }
  if (!isTransitionAllowed(from, to)) {
    throw new PersonalLootInvalidTransitionError(from, to);
  }
  return { noop: false };
}
