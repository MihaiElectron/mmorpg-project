/**
 * Statuts autoritaires d'un {@link PersonalLootEntitlement}.
 *
 * Les valeurs persistées sont explicites et stables (contrainte PostgreSQL —
 * enum dédié). La base refuse toute valeur inconnue : une simple union
 * TypeScript ne suffit pas.
 *
 * Cycle de vie (Lot 1 — socle non branché) :
 *   ground  → droit matérialisable au sol (représentation WorldItem à venir) ;
 *   mailed  → droit basculé vers la mailbox (canal MailMessage à venir) ;
 *   claimed → réclamé (terminal) ;
 *   expired → expiré (terminal) ;
 *   cancelled → annulé (terminal).
 *
 * États terminaux : claimed, expired, cancelled.
 */
export enum PersonalLootEntitlementStatus {
  GROUND = 'ground',
  MAILED = 'mailed',
  CLAIMED = 'claimed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

/** États terminaux : aucune transition sortante autorisée (hors retry idempotent). */
export const TERMINAL_ENTITLEMENT_STATUSES: readonly PersonalLootEntitlementStatus[] = [
  PersonalLootEntitlementStatus.CLAIMED,
  PersonalLootEntitlementStatus.EXPIRED,
  PersonalLootEntitlementStatus.CANCELLED,
];

/** Vrai si le statut est terminal (aucune transition sortante). */
export function isTerminalEntitlementStatus(
  status: PersonalLootEntitlementStatus,
): boolean {
  return TERMINAL_ENTITLEMENT_STATUSES.includes(status);
}
