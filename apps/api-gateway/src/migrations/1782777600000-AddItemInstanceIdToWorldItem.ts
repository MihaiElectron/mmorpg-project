import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddItemInstanceIdToWorldItem1782777600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'world_item',
      new TableColumn({
        name: 'item_instance_id',
        type: 'varchar',
        isNullable: true,
        default: null,
      }),
    );

    await queryRunner.createIndex(
      'world_item',
      new TableIndex({
        name: 'IDX_world_item_item_instance_id',
        columnNames: ['item_instance_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('world_item', 'IDX_world_item_item_instance_id');
    await queryRunner.dropColumn('world_item', 'item_instance_id');
  }
}
