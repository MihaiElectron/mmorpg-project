import { Module } from '@nestjs/common';
import { WorldGateway } from './world.gateway';
import { WorldService } from './world.service';
import { LootService } from './loot.service';
import { InventoryModule } from '../inventory/inventory.module';
import { ResourcesModule } from '../resources/resources.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Character } from '../characters/entities/character.entity';

@Module({
  imports: [
    InventoryModule,
    ResourcesModule,
    TypeOrmModule.forFeature([Character]),
  ],
  providers: [WorldGateway, WorldService, LootService],
})
export class WorldModule {}
