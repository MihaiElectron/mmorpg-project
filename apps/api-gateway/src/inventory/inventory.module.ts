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
import { Item } from '../items/entities/item.entity';

@Module({
  imports: [
    // On importe toutes les entités nécessaires pour le service
    TypeOrmModule.forFeature([Inventory, Character, Item]),
  ],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
