import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateItemInstanceTable1782604800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'item_instance',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'item_id', type: 'varchar', isNullable: false },
          { name: 'owner_type', type: 'varchar', length: '30', isNullable: false },
          { name: 'owner_id', type: 'varchar', isNullable: true },
          { name: 'state', type: 'varchar', length: '30', isNullable: false },
          { name: 'container_type', type: 'varchar', length: '30', isNullable: false },
          { name: 'container_id', type: 'varchar', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'item_instance',
      new TableIndex({ name: 'IDX_item_instance_item_id', columnNames: ['item_id'] }),
    );

    await queryRunner.createIndex(
      'item_instance',
      new TableIndex({ name: 'IDX_item_instance_owner_id', columnNames: ['owner_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('item_instance', true);
  }
}
