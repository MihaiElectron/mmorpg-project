import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supprime les colonnes pixel legacy rendues obsolètes par la migration WU P7.
 *
 * En développement, synchronize:true gère ces suppressions automatiquement.
 * Ce fichier est destiné à la production (désactiver synchronize, activer migrations).
 *
 * Colonnes supprimées :
 *   character  : positionX, positionY  (remplacées par worldX, worldY, mapId)
 *   creatures  : x, y                  (idem)
 *   resources  : x, y                  (idem)
 *   creature_spawn : spawnX, spawnY    (idem)
 *   respawn_point  : x, y              (idem)
 */
export class DropLegacyPixelColumns1782432000000 implements MigrationInterface {
  name = 'DropLegacyPixelColumns1782432000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "character" DROP COLUMN IF EXISTS "positionX"`);
    await queryRunner.query(`ALTER TABLE "character" DROP COLUMN IF EXISTS "positionY"`);
    await queryRunner.query(`ALTER TABLE "creatures" DROP COLUMN IF EXISTS "x"`);
    await queryRunner.query(`ALTER TABLE "creatures" DROP COLUMN IF EXISTS "y"`);
    await queryRunner.query(`ALTER TABLE "resources" DROP COLUMN IF EXISTS "x"`);
    await queryRunner.query(`ALTER TABLE "resources" DROP COLUMN IF EXISTS "y"`);
    await queryRunner.query(`ALTER TABLE "creature_spawn" DROP COLUMN IF EXISTS "spawnX"`);
    await queryRunner.query(`ALTER TABLE "creature_spawn" DROP COLUMN IF EXISTS "spawnY"`);
    await queryRunner.query(`ALTER TABLE "respawn_point" DROP COLUMN IF EXISTS "x"`);
    await queryRunner.query(`ALTER TABLE "respawn_point" DROP COLUMN IF EXISTS "y"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "character" ADD COLUMN "positionX" integer NOT NULL DEFAULT 400`);
    await queryRunner.query(`ALTER TABLE "character" ADD COLUMN "positionY" integer NOT NULL DEFAULT 300`);
    await queryRunner.query(`ALTER TABLE "creatures" ADD COLUMN "x" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "creatures" ADD COLUMN "y" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "resources" ADD COLUMN "x" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "resources" ADD COLUMN "y" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "creature_spawn" ADD COLUMN "spawnX" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "creature_spawn" ADD COLUMN "spawnY" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "respawn_point" ADD COLUMN "x" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "respawn_point" ADD COLUMN "y" integer NOT NULL DEFAULT 0`);
  }
}
