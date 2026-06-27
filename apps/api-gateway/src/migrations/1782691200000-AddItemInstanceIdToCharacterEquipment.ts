import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddItemInstanceIdToCharacterEquipment1782691200000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'character_equipment',
      new TableColumn({
        name: 'item_instance_id',
        type: 'varchar',
        isNullable: true,
        default: null,
      }),
    );

    await queryRunner.createIndex(
      'character_equipment',
      new TableIndex({
        name: 'IDX_character_equipment_item_instance_id',
        columnNames: ['item_instance_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'character_equipment',
      'IDX_character_equipment_item_instance_id',
    );
    await queryRunner.dropColumn('character_equipment', 'item_instance_id');
  }
}
