import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGuildTable1783209600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE guild (
        id              UUID          NOT NULL DEFAULT gen_random_uuid(),
        name            VARCHAR(60)   NOT NULL,
        owner_character_id VARCHAR     NOT NULL,
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT pk_guild PRIMARY KEY (id),
        CONSTRAINT uq_guild_name UNIQUE (name)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_guild_owner_character_id ON guild (owner_character_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_guild_owner_character_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS guild`);
  }
}
