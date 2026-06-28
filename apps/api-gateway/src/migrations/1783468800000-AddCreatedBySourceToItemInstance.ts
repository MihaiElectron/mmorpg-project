import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatedBySourceToItemInstance1783468800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE item_instance
        ADD COLUMN IF NOT EXISTS created_by_source VARCHAR(30) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE item_instance
        DROP COLUMN IF EXISTS created_by_source
    `);
  }
}
