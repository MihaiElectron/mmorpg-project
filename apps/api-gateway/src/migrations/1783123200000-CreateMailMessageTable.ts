import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMailMessageTable1783123200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE mail_status AS ENUM (
        'PENDING',
        'CLAIMED',
        'EXPIRED',
        'RETURNED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE mail_message (
        id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_character_id       VARCHAR NOT NULL,
        recipient_character_id    VARCHAR NOT NULL,
        subject                   VARCHAR(120) NOT NULL,
        body                      TEXT NOT NULL DEFAULT '',
        attached_item_instance_id VARCHAR,
        status                    mail_status NOT NULL DEFAULT 'PENDING',
        created_at                TIMESTAMP NOT NULL DEFAULT now(),
        expires_at                TIMESTAMP NOT NULL,
        claimed_at                TIMESTAMP
      )
    `);

    await queryRunner.query(`CREATE INDEX IDX_mail_sender    ON mail_message(sender_character_id)`);
    await queryRunner.query(`CREATE INDEX IDX_mail_recipient ON mail_message(recipient_character_id)`);
    await queryRunner.query(`CREATE INDEX IDX_mail_status    ON mail_message(status)`);
    await queryRunner.query(`CREATE INDEX IDX_mail_expires   ON mail_message(expires_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mail_message`);
    await queryRunner.query(`DROP TYPE IF EXISTS mail_status`);
  }
}
