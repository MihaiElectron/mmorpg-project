import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stats PRIMAIRES créature (V6-B1) sur `creature_template` :
 * strength, vitality, endurance, agility, dexterity, intelligence, wisdom.
 *
 * Non destructif et idempotent (`ADD COLUMN IF NOT EXISTS`). **Défaut 0** pour
 * chaque colonne → toutes les créatures existantes restent strictement
 * inchangées. V6-B1 = fondation de données uniquement : ces primaires ne sont
 * PAS branchées au combat (aucune dérivation, aucun effet sur
 * attackPower/defenseTotal/maxHealth). La dérivation primaires → secondaires
 * viendra en V6-B2.
 *
 * En dev, `synchronize: true` crée déjà ces colonnes ; ce fichier versionne le
 * changement pour la prod (aucun runner câblé). Aucune autre table touchée.
 */
export class AddCreaturePrimaryStats1785715200000 implements MigrationInterface {
  name = 'AddCreaturePrimaryStats1785715200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "creature_template"
        ADD COLUMN IF NOT EXISTS "strength" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "vitality" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "endurance" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "agility" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "dexterity" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "intelligence" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "wisdom" integer NOT NULL DEFAULT 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "creature_template"
        DROP COLUMN IF EXISTS "wisdom",
        DROP COLUMN IF EXISTS "intelligence",
        DROP COLUMN IF EXISTS "dexterity",
        DROP COLUMN IF EXISTS "agility",
        DROP COLUMN IF EXISTS "endurance",
        DROP COLUMN IF EXISTS "vitality",
        DROP COLUMN IF EXISTS "strength"
    `);
  }
}
