import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInstanceTypeAndQuantityToItemInstance1783555200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE item_instance
        ADD COLUMN IF NOT EXISTS instance_type VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
        ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE item_instance
        ADD CONSTRAINT chk_instance_type_quantity CHECK (
          (instance_type = 'NORMAL' AND quantity IS NULL) OR
          (instance_type = 'LOT'    AND quantity > 0)
        )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_item_instance_lots
        ON item_instance (item_id, state)
        WHERE instance_type = 'LOT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_item_instance_lots
    `);

    await queryRunner.query(`
      ALTER TABLE item_instance
        DROP CONSTRAINT IF EXISTS chk_instance_type_quantity
    `);

    await queryRunner.query(`
      ALTER TABLE item_instance
        DROP COLUMN IF EXISTS quantity,
        DROP COLUMN IF EXISTS instance_type
    `);
  }
}
