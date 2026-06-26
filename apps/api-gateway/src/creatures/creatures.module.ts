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
import { SkillsModule } from '../skills/skills.module';
import { CreatureRuntimeModule } from '../creature-runtime/creature-runtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Creature, CreatureTemplate, CreatureSpawn, Character]),
    CommonModule,
    WorldModule,
    SkillsModule,
    CreatureRuntimeModule,
  ],
  providers: [CreaturesGateway, CreaturesService],
  exports: [CreaturesService],
})
export class CreaturesModule {}
