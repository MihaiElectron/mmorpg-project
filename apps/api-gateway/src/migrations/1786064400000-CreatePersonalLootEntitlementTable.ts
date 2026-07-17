import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crée la table `personal_loot_entitlement` — fondation persistante des droits
 * de butin personnel (Lot 1). Aucune donnée gameplay branchée : le loot ordinaire
 * reste partagé (`world_item.ownerCharacterId = null`).
 *
 * Anti-duplication : UNIQUE (killId, characterId, rewardRollId) — itemId exclu
 * volontairement (un même objet peut provenir de plusieurs tirages du même kill).
 * Intégrité : CHECK quantity > 0. FK item/character en RESTRICT (audit préservé,
 * aucune cascade destructive). Provenance (sourceCreatureId/sourceEncounterId)
 * = scalaires sans FK (entités runtime éphémères).
 *
 * IMPORTANT — en dev, `synchronize: true` crée déjà cette table/enum au premier
 * démarrage : cette migration échouera alors (`already exists`). Vérifier l'état
 * réel de la base cible avant exécution. Aucun exécuteur de migration n'est câblé
 * dans ce projet : ce fichier versionne le changement, il ne s'exécute pas
 * automatiquement.
 */
export class CreatePersonalLootEntitlementTable1786064400000
  implements MigrationInterface
{
  name = 'CreatePersonalLootEntitlementTable1786064400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "personal_loot_entitlement_status_enum" AS ENUM (
        'ground',
        'mailed',
        'claimed',
        'expired',
        'cancelled'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "personal_loot_entitlement" (
        "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
        "killId"            character varying NOT NULL,
        "characterId"       UUID NOT NULL,
        "rewardRollId"      character varying NOT NULL,
        "itemId"            UUID NOT NULL,
        "quantity"          integer NOT NULL,
        "status"            "personal_loot_entitlement_status_enum" NOT NULL DEFAULT 'ground',
        "groundExpiresAt"   TIMESTAMP,
        "mailExpiresAt"     TIMESTAMP,
        "claimedAt"         TIMESTAMP,
        "expiredAt"         TIMESTAMP,
        "cancelledAt"       TIMESTAMP,
        "sourceCreatureId"  character varying,
        "sourceEncounterId" character varying,
        "createdAt"         TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_personal_loot_entitlement" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_personal_loot_entitlement_kill_character_roll"
          UNIQUE ("killId", "characterId", "rewardRollId"),
        CONSTRAINT "CHK_personal_loot_entitlement_quantity_positive"
          CHECK ("quantity" > 0),
        CONSTRAINT "FK_personal_loot_entitlement_character"
          FOREIGN KEY ("characterId") REFERENCES "character"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_personal_loot_entitlement_item"
          FOREIGN KEY ("itemId") REFERENCES "item"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    // Consultation des droits d'un personnage filtrés par état
    // (ex: lister les droits « ground » actifs d'un joueur).
    await queryRunner.query(`
      CREATE INDEX "IDX_personal_loot_entitlement_character_status"
        ON "personal_loot_entitlement" ("characterId", "status")
    `);
    // Recherche des droits au sol arrivés à échéance (futur balayage d'expiration
    // au sol : WHERE status = 'ground' AND groundExpiresAt <= now()).
    await queryRunner.query(`
      CREATE INDEX "IDX_personal_loot_entitlement_status_ground_expires"
        ON "personal_loot_entitlement" ("status", "groundExpiresAt")
    `);
    // Recherche des droits en mailbox arrivés à échéance (futur balayage :
    // WHERE status = 'mailed' AND mailExpiresAt <= now()).
    await queryRunner.query(`
      CREATE INDEX "IDX_personal_loot_entitlement_status_mail_expires"
        ON "personal_loot_entitlement" ("status", "mailExpiresAt")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_personal_loot_entitlement_status_mail_expires"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_personal_loot_entitlement_status_ground_expires"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_personal_loot_entitlement_character_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "personal_loot_entitlement"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "personal_loot_entitlement_status_enum"`,
    );
  }
}
