import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Character } from '../characters/entities/character.entity';
import { CommonModule } from '../common/common.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ItemTransferModule } from '../item-transfer/item-transfer.module';
import { Inventory } from '../inventory/entities/inventory.entity';
import { Item } from '../items/entities/item.entity';
import { WorldItem } from './entities/world-item.entity';
import { WorldItemService } from './world-item.service';
import { WorldItemsGateway } from './world-items.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorldItem, Item, Character, Inventory]),
    CommonModule,
    InventoryModule,
    ItemTransferModule,
  ],
  providers: [WorldItemService, WorldItemsGateway],
  exports: [WorldItemService, TypeOrmModule],
})
export class WorldItemsModule {}
