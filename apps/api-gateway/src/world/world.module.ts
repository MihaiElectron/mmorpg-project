import { Module } from '@nestjs/common';
import { WorldGateway } from './world.gateway';
import { WorldService } from './world.service';
import { LootService } from './loot.service';
import { InventoryModule } from '../inventory/inventory.module';
import { ResourcesModule } from '../resources/resources.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Character } from '../characters/entities/character.entity';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    InventoryModule,
    ResourcesModule,
    TypeOrmModule.forFeature([Character]),
    CommonModule,
  ],
  providers: [WorldGateway, WorldService, LootService],
})
export class WorldModule {}
