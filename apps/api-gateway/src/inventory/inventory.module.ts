/**
 * InventoryModule
 * -----------------------------------------------------------------------------
 * Module backend pour gérer l’inventaire et les items équipés des personnages.
 * - Fournit InventoryService pour manipuler l’inventaire
 * - Fournit InventoryController pour exposer les endpoints API
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { Inventory } from './entities/inventory.entity';
import { Character } from '../characters/entities/character.entity';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { ItemInstance } from '../item-instances/entities/item-instance.entity';
import { Item } from '../items/entities/item.entity';
import { InventoryProjectionService } from './projection/inventory-projection.service';
import { InventoryEntryResolverService } from './resolution/inventory-entry-resolver.service';
import { ItemTransferModule } from '../item-transfer/item-transfer.module';
import { WorldModule } from '../world/world.module';
import { DerivedStatsModule } from '../derived-stats/derived-stats.module';
import { MasteriesModule } from '../masteries/masteries.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inventory, Character, Item, ItemInstance, CharacterEquipment]),
    ItemTransferModule,
    WorldModule,
    DerivedStatsModule,
    MasteriesModule,
  ],
  providers: [InventoryService, InventoryProjectionService, InventoryEntryResolverService],
  controllers: [InventoryController],
  exports: [InventoryService, InventoryProjectionService, InventoryEntryResolverService],
})
export class InventoryModule {}
