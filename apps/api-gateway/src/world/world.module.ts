import { Module } from '@nestjs/common';
import { WorldGateway } from './world.gateway';
import { WorldService } from './world.service';
import { LootService } from './loot.service';
import { InventoryModule } from '../inventory/inventory.module';
import { ResourcesModule } from '../resources/resources.module';

@Module({
  imports: [InventoryModule, ResourcesModule],
  providers: [WorldGateway, WorldService, LootService],
})
export class WorldModule {}
