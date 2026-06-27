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

@Module({
  imports: [
    TypeOrmModule.forFeature([Inventory, Character, Item, ItemInstance, CharacterEquipment]),
  ],
  providers: [InventoryService, InventoryProjectionService],
  controllers: [InventoryController],
  exports: [InventoryService, InventoryProjectionService],
})
export class InventoryModule {}
