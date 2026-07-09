import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crée la table `character_action_bar_slot` (barre d'action persistante, Skills
 * V1-I-A).
 *
 * Non destructif : CREATE TABLE + index + contraintes uniquement. Aucun DROP,
 * aucune donnée touchée, aucun backfill (les persos démarrent avec 8 slots vides
 * résolus côté service, sans ligne).
 *
 * FK : `characterId` → character(id) ON DELETE CASCADE ; `skillDefinitionId`
 * (nullable) → skill_definition(id) ON DELETE SET NULL (supprimer un skill vide
 * les slots qui le référençaient). Unique (characterId, slotIndex), index sur
 * characterId. `slotIndex` borné 0..7 côté service (pas par le schéma).
 *
 * IMPORTANT — en dev, cette table est déjà créée par `synchronize: true` au
 * premier démarrage : cette migration échouera alors (`relation already
 * exists`). Vérifier l'état réel de la base cible avant toute exécution.
 *
 * Aucun exécuteur de migration n'est câblé dans ce projet (pas de `data-source`
 * CLI, pas de `migration:run`, pas de `migrationsRun`) : ce fichier versionne le
 * changement, il ne s'exécute pas automatiquement.
 */
export class CreateCharacterActionBarSlotTable1784073600000 implements MigrationInterface {
  name = 'CreateCharacterActionBarSlotTable1784073600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "character_action_bar_slot" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "characterId" uuid NOT NULL,
        "slotIndex" integer NOT NULL,
        "skillDefinitionId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_character_action_bar_slot" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_action_bar_slot_char_index" UNIQUE ("characterId", "slotIndex"),
        CONSTRAINT "FK_action_bar_slot_character" FOREIGN KEY ("characterId")
          REFERENCES "character"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_action_bar_slot_skill" FOREIGN KEY ("skillDefinitionId")
          REFERENCES "skill_definition"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_action_bar_slot_characterId" ON "character_action_bar_slot" ("characterId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "character_action_bar_slot"');
  }
}
