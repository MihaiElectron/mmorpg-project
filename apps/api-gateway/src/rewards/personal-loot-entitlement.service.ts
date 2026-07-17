import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { PersonalLootEntitlement } from './entities/personal-loot-entitlement.entity';
import { PersonalLootEntitlementStatus } from './enums/personal-loot-entitlement-status.enum';
import {
  PersonalLootEntitlementConflictError,
  PersonalLootEntitlementNotFoundError,
  PersonalLootInvalidQuantityError,
} from './personal-loot-entitlement.errors';
import { evaluateTransition } from './personal-loot-entitlement.transitions';

/** Données immuables d'un droit au sol créé au kill (fournies par le futur Lot 2). */
export interface CreateGroundEntitlementInput {
  /** Jeton stable de résolution de mort (jamais régénéré au retry). */
  killId: string;
  /** Personnage bénéficiaire. */
  characterId: string;
  /** Jeton stable de ligne/tirage de récompense (jamais régénéré au retry). */
  rewardRollId: string;
  /** Objet récompensé (catalogue). */
  itemId: string;
  /** Quantité (entier strictement positif). */
  quantity: number;
  /** Fin de présence au sol (optionnelle — non activée ce lot). */
  groundExpiresAt?: Date | null;
  /** Audit de provenance (entités runtime éphémères). */
  sourceCreatureId?: string | null;
  sourceEncounterId?: string | null;
}

/**
 * Service INTERNE du domaine `rewards`. Aucune méthode n'est exposée au client
 * (pas de controller/gateway/DTO). Il fournit des primitives composables
 * `*WithinManager` : l'appelant ouvre la transaction et passe son
 * {@link EntityManager}, afin que les futurs lots composent dans UNE transaction
 * `entitlement + WorldItem`, `entitlement + Inventory`, `entitlement + MailMessage`.
 *
 * Lot 1 : aucun effet gameplay. `transition*` ne matérialise pas d'objet, ne
 * touche ni inventaire, ni WorldItem, ni mailbox, et n'émet aucun événement.
 */
@Injectable()
export class PersonalLootEntitlementService {
  /**
   * Crée un droit `ground` de façon IDEMPOTENTE sous la clé
   * (killId, characterId, rewardRollId).
   *
   * - première création → insère la ligne ;
   * - retry identique (mêmes données immuables) → retourne la ligne existante ;
   * - collision incohérente (itemId/quantité/source différents) → conflit.
   *
   * L'idempotence repose sur la contrainte UNIQUE PostgreSQL via une insertion
   * `ON CONFLICT DO NOTHING` (`.orIgnore()`). Contrairement à un `INSERT` nu dont
   * la violation `23505` avorterait la transaction fournie (`current transaction
   * is aborted` à la relecture), `ON CONFLICT DO NOTHING` absorbe le conflit sans
   * invalider la transaction : le même `EntityManager` reste utilisable pour
   * relire la ligne gagnante et pour les opérations suivantes (futur Lot 2).
   * Aucune détection de code `23505` n'est utilisée pour le flux idempotent.
   */
  async createGroundEntitlementWithinManager(
    manager: EntityManager,
    input: CreateGroundEntitlementInput,
  ): Promise<PersonalLootEntitlement> {
    this.assertValidQuantity(input.quantity);

    const repo = manager.getRepository(PersonalLootEntitlement);

    // INSERT ... ON CONFLICT ("killId","characterId","rewardRollId") DO NOTHING
    // RETURNING "id". `raw` contient la ligne insérée, ou est vide si un conflit
    // a été ignoré (ligne préexistante). Aucune exception n'est levée sur conflit.
    const insertResult = await repo
      .createQueryBuilder()
      .insert()
      .into(PersonalLootEntitlement)
      .values({
        killId: input.killId,
        characterId: input.characterId,
        rewardRollId: input.rewardRollId,
        itemId: input.itemId,
        quantity: input.quantity,
        status: PersonalLootEntitlementStatus.GROUND,
        groundExpiresAt: input.groundExpiresAt ?? null,
        mailExpiresAt: null,
        claimedAt: null,
        expiredAt: null,
        cancelledAt: null,
        sourceCreatureId: input.sourceCreatureId ?? null,
        sourceEncounterId: input.sourceEncounterId ?? null,
      })
      .orIgnore()
      .returning(['id'])
      .execute();

    const inserted =
      Array.isArray(insertResult.raw) && insertResult.raw.length > 0;

    // Toujours relire l'état persistant réel via la clé unique (même manager) :
    // la ligne existe forcément après un DO NOTHING (insérée ou préexistante).
    const existing = await repo.findOne({
      where: {
        killId: input.killId,
        characterId: input.characterId,
        rewardRollId: input.rewardRollId,
      },
    });
    if (!existing) {
      // Défensif : incohérence inattendue (la ligne devrait exister).
      throw new PersonalLootEntitlementConflictError(
        `Could not load PersonalLootEntitlement after insert on ` +
          `(killId=${input.killId}, characterId=${input.characterId}, ` +
          `rewardRollId=${input.rewardRollId})`,
      );
    }

    // Conflit ignoré → une ligne préexistait : elle doit correspondre aux
    // données immuables (sinon c'est une collision incohérente, pas un retry).
    if (!inserted) {
      this.assertImmutableMatch(existing, input);
    }
    return existing;
  }

  /**
   * Charge un entitlement sous verrou pessimiste d'écriture, dans la transaction
   * fournie. Chargement minimal SANS join (aucune relation nullable) pour éviter
   * « FOR UPDATE cannot be applied to the nullable side of an outer join ».
   */
  findByIdForUpdateWithinManager(
    manager: EntityManager,
    id: string,
  ): Promise<PersonalLootEntitlement | null> {
    return manager
      .getRepository(PersonalLootEntitlement)
      .createQueryBuilder('entitlement')
      .setLock('pessimistic_write')
      .where('entitlement.id = :id', { id })
      .getOne();
  }

  /**
   * Applique une transition d'état dans la transaction fournie :
   * verrou pessimiste → vérification état courant → retry idempotent →
   * politique de transition → estampille temporelle → sauvegarde.
   *
   * Retour idempotent : si l'état courant est déjà l'état demandé, aucune
   * écriture n'est effectuée. AUCUN effet gameplay ce lot.
   */
  async transitionWithinManager(
    manager: EntityManager,
    id: string,
    targetStatus: PersonalLootEntitlementStatus,
  ): Promise<PersonalLootEntitlement> {
    const entity = await this.findByIdForUpdateWithinManager(manager, id);
    if (!entity) {
      throw new PersonalLootEntitlementNotFoundError(id);
    }

    const { noop } = evaluateTransition(entity.status, targetStatus);
    if (noop) {
      return entity;
    }

    entity.status = targetStatus;
    this.stampTransitionTimestamp(entity, targetStatus);
    return manager.getRepository(PersonalLootEntitlement).save(entity);
  }

  private assertValidQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new PersonalLootInvalidQuantityError(quantity);
    }
  }

  private assertImmutableMatch(
    existing: PersonalLootEntitlement,
    input: CreateGroundEntitlementInput,
  ): void {
    const mismatch =
      existing.itemId !== input.itemId ||
      existing.quantity !== input.quantity ||
      existing.sourceCreatureId !== (input.sourceCreatureId ?? null) ||
      existing.sourceEncounterId !== (input.sourceEncounterId ?? null);
    if (mismatch) {
      throw new PersonalLootEntitlementConflictError(
        `PersonalLootEntitlement conflict on (killId=${input.killId}, ` +
          `characterId=${input.characterId}, rewardRollId=${input.rewardRollId}): ` +
          `immutable data differs from the existing entitlement`,
      );
    }
  }

  private stampTransitionTimestamp(
    entity: PersonalLootEntitlement,
    targetStatus: PersonalLootEntitlementStatus,
  ): void {
    const now = new Date();
    switch (targetStatus) {
      case PersonalLootEntitlementStatus.CLAIMED:
        entity.claimedAt = now;
        break;
      case PersonalLootEntitlementStatus.EXPIRED:
        entity.expiredAt = now;
        break;
      case PersonalLootEntitlementStatus.CANCELLED:
        entity.cancelledAt = now;
        break;
      // GROUND / MAILED : pas d'estampille terminale dédiée.
      default:
        break;
    }
  }
}
