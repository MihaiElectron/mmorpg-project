import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTradeSessionTable1783382400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE trade_session (
        id               UUID          NOT NULL DEFAULT gen_random_uuid(),
        character_a_id   VARCHAR       NOT NULL,
        character_b_id   VARCHAR       NOT NULL,
        state            VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
        accepted_a       BOOLEAN       NOT NULL DEFAULT false,
        accepted_b       BOOLEAN       NOT NULL DEFAULT false,
        created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT pk_trade_session PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_trade_session_character_a ON trade_session (character_a_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_trade_session_character_b ON trade_session (character_b_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_trade_session_character_b`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_trade_session_character_a`);
    await queryRunner.query(`DROP TABLE IF EXISTS trade_session`);
  }
}
