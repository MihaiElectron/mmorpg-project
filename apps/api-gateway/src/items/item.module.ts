import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from './entities/item.entity';
import { ItemService } from './item.service';
import { ItemController } from './item.controller';
import { Inventory } from '../inventory/entities/inventory.entity';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Item, Inventory, CharacterEquipment])],
  controllers: [ItemController],
  providers: [ItemService],
  exports: [ItemService, TypeOrmModule],
})
export class ItemModule {}
