import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHouseTable1783296000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE house (
        id                  UUID          NOT NULL DEFAULT gen_random_uuid(),
        name                VARCHAR(80)   NOT NULL,
        owner_character_id  VARCHAR       NOT NULL,
        created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT pk_house PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_house_owner_character_id ON house (owner_character_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_house_owner_character_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS house`);
  }
}
