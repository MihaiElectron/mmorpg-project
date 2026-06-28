import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddObjectModeToItem1782864000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_objectmode_enum') THEN
          CREATE TYPE "item_objectmode_enum" AS ENUM ('STACKABLE', 'INSTANCE');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "item"
        ADD COLUMN IF NOT EXISTS "objectMode" "item_objectmode_enum" NOT NULL DEFAULT 'STACKABLE'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "item" DROP COLUMN IF EXISTS "objectMode"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "item_objectmode_enum"`);
  }
}
