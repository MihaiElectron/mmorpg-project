import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';
import { CharacterService } from './character.service';
import { CharacterController } from './character.controller';

import { ItemModule } from '../items/item.module';
import { Item } from '../items/entities/item.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { MasteriesModule } from '../masteries/masteries.module';
import { ItemTransferModule } from '../item-transfer/item-transfer.module';
import { ProgressionModule } from '../progression/progression.module';
import { WorldModule } from '../world/world.module';
import { DerivedStatsModule } from '../derived-stats/derived-stats.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Character, CharacterEquipment, Item, Inventory]),
    ItemModule,
    InventoryModule,
    MasteriesModule,
    ItemTransferModule,
    ProgressionModule,
    WorldModule,
    DerivedStatsModule,
  ],
  controllers: [CharacterController],
  providers: [CharacterService],
  exports: [CharacterService],
})
export class CharactersModule {}
