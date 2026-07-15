import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Creature } from './entities/creature.entity';
import { CreatureTemplate } from './entities/creature-template.entity';
import { CreatureSpawn } from './entities/creature-spawn.entity';
import { CreatureTemplateSkill } from './entities/creature-template-skill.entity';
import { SkillDefinition } from '../active-skills/entities/skill-definition.entity';
import { CreaturesGateway } from './creatures.gateway';
import { CreaturesService } from './creatures.service';
import { CreatureAbilitiesService } from './creature-abilities.service';
import { Character } from '../characters/entities/character.entity';
import { CommonModule } from '../common/common.module';
import { WorldModule } from '../world/world.module';
import { ProgressionModule } from '../progression/progression.module';
import { CreatureRuntimeModule } from '../creature-runtime/creature-runtime.module';
import { LootService } from '../world/loot.service';
import { WorldItemsModule } from '../world-items/world-items.module';
import { ItemMaterializationModule } from '../item-materialization/item-materialization.module';
import { MasteriesModule } from '../masteries/masteries.module';
import { DerivedStatsModule } from '../derived-stats/derived-stats.module';
import { CreatureConfigModule } from '../creature-config/creature-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Creature,
      CreatureTemplate,
      CreatureSpawn,
      CreatureTemplateSkill,
      SkillDefinition,
      Character,
    ]),
    CommonModule,
    WorldModule,
    ProgressionModule,
    MasteriesModule,
    CreatureRuntimeModule,
    WorldItemsModule,
    ItemMaterializationModule,
    DerivedStatsModule,
    CreatureConfigModule,
  ],
  providers: [CreaturesGateway, CreaturesService, CreatureAbilitiesService, LootService],
  exports: [CreaturesService, CreatureAbilitiesService],
})
export class CreaturesModule {}
