import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameCreatureTable1782345600000 implements MigrationInterface {
  name = 'RenameCreatureTable1782345600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE animals RENAME TO creatures');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE creatures RENAME TO animals');
  }
}
