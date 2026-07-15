import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Complète les stats primaires créature (V6-B1) sur `creature_template` avec les
 * 3 dernières pour aligner les créatures sur les 10 primaires joueur :
 * spirit, willpower, charisma.
 *
 * Non destructif et idempotent (`ADD COLUMN IF NOT EXISTS`). **Défaut 0** →
 * créatures existantes strictement inchangées. Ces primaires n'ont AUCUN effet
 * combat (fondation de données ; dérivation prévue V6-B2). Aucune autre table.
 *
 * En dev, `synchronize: true` crée déjà ces colonnes ; ce fichier versionne le
 * changement pour la prod (aucun runner câblé).
 */
export class AddCreatureSpiritWillpowerCharisma1785801600000 implements MigrationInterface {
  name = 'AddCreatureSpiritWillpowerCharisma1785801600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "creature_template"
        ADD COLUMN IF NOT EXISTS "spirit" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "willpower" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "charisma" integer NOT NULL DEFAULT 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "creature_template"
        DROP COLUMN IF EXISTS "charisma",
        DROP COLUMN IF EXISTS "willpower",
        DROP COLUMN IF EXISTS "spirit"
    `);
  }
}
