import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crée l'association CreatureTemplate 1—N SkillDefinition (V5-A) : table
 * `creature_template_skill`. Config uniquement — aucun déclenchement combat.
 *
 * Non destructif et idempotent (`IF NOT EXISTS`). FK ON DELETE CASCADE vers
 * `creature_template`. Index unique (creatureTemplateId, skillKey) pour empêcher
 * les doublons. `skillKey` référence `skill_definition.key` par convention de
 * clé stable (validée applicativement, pas de FK dure sur la clé).
 *
 * En dev, `synchronize: true` crée déjà la table ; ce fichier versionne le
 * changement pour la prod (aucun runner câblé).
 */
export class AddCreatureTemplateSkill1785542400000 implements MigrationInterface {
  name = 'AddCreatureTemplateSkill1785542400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creature_template_skill" (
        "id" SERIAL PRIMARY KEY,
        "creatureTemplateId" integer NOT NULL,
        "skillKey" character varying(64) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "displayOrder" integer NOT NULL DEFAULT 0,
        CONSTRAINT "fk_creature_template_skill_template"
          FOREIGN KEY ("creatureTemplateId")
          REFERENCES "creature_template"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_creature_template_skill_unique"
        ON "creature_template_skill" ("creatureTemplateId", "skillKey")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_creature_template_skill_unique"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "creature_template_skill"`);
  }
}
