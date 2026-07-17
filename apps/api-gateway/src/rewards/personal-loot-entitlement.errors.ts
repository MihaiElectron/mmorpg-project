import { PersonalLootEntitlementStatus } from './enums/personal-loot-entitlement-status.enum';

/**
 * Codes d'erreur métier stables du domaine `rewards`.
 *
 * Le module est purement interne à ce lot (aucune API HTTP/WebSocket) : les
 * codes ne sont pas exposés au client, mais restent testables et exploitables
 * par les futurs services runtime qui composeront ces primitives.
 */
export enum PersonalLootEntitlementErrorCode {
  NOT_FOUND = 'personal_loot_entitlement_not_found',
  CONFLICT = 'personal_loot_entitlement_conflict',
  INVALID_TRANSITION = 'personal_loot_invalid_transition',
  INVALID_QUANTITY = 'personal_loot_invalid_quantity',
}

/** Base des erreurs métier du domaine `rewards` (porte un `code` stable). */
export class PersonalLootEntitlementError extends Error {
  constructor(
    readonly code: PersonalLootEntitlementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** L'entitlement demandé n'existe pas. */
export class PersonalLootEntitlementNotFoundError extends PersonalLootEntitlementError {
  constructor(id: string) {
    super(
      PersonalLootEntitlementErrorCode.NOT_FOUND,
      `PersonalLootEntitlement ${id} not found`,
    );
  }
}

/**
 * Collision incohérente sur la clé d'idempotence
 * (killId + characterId + rewardRollId) : la ligne existe déjà mais ses
 * données immuables diffèrent de la demande. Jamais un retry légitime.
 */
export class PersonalLootEntitlementConflictError extends PersonalLootEntitlementError {
  constructor(message: string) {
    super(PersonalLootEntitlementErrorCode.CONFLICT, message);
  }
}

/** Transition d'état interdite par la politique. */
export class PersonalLootInvalidTransitionError extends PersonalLootEntitlementError {
  constructor(
    readonly from: PersonalLootEntitlementStatus,
    readonly to: PersonalLootEntitlementStatus,
  ) {
    super(
      PersonalLootEntitlementErrorCode.INVALID_TRANSITION,
      `Invalid PersonalLootEntitlement transition ${from} -> ${to}`,
    );
  }
}

/** Quantité invalide (doit être un entier strictement positif). */
export class PersonalLootInvalidQuantityError extends PersonalLootEntitlementError {
  constructor(quantity: number) {
    super(
      PersonalLootEntitlementErrorCode.INVALID_QUANTITY,
      `PersonalLootEntitlement quantity must be a positive integer, received ${quantity}`,
    );
  }
}
