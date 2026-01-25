import { Module } from '@nestjs/common';
import { WorldGateway } from './world.gateway';
import { WorldService } from './world.service';
import { LootService } from './loot.service';
import { InventoryService } from '../inventory/inventory.service';

@Module({
  providers: [WorldGateway, WorldService, LootService, InventoryService],
})
export class WorldModule {}
