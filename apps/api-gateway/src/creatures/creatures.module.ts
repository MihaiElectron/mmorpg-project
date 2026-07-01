import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Creature } from './entities/creature.entity';
import { CreatureTemplate } from './entities/creature-template.entity';
import { CreatureSpawn } from './entities/creature-spawn.entity';
import { CreaturesGateway } from './creatures.gateway';
import { CreaturesService } from './creatures.service';
import { Character } from '../characters/entities/character.entity';
import { CommonModule } from '../common/common.module';
import { WorldModule } from '../world/world.module';
import { ProgressionModule } from '../progression/progression.module';
import { CreatureRuntimeModule } from '../creature-runtime/creature-runtime.module';
import { LootService } from '../world/loot.service';
import { WorldItemsModule } from '../world-items/world-items.module';
import { ItemMaterializationModule } from '../item-materialization/item-materialization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Creature, CreatureTemplate, CreatureSpawn, Character]),
    CommonModule,
    WorldModule,
    ProgressionModule,
    CreatureRuntimeModule,
    WorldItemsModule,
    ItemMaterializationModule,
  ],
  providers: [CreaturesGateway, CreaturesService, LootService],
  exports: [CreaturesService],
})
export class CreaturesModule {}
