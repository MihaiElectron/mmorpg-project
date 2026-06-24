import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillDefinition } from './entities/skill-definition.entity';
import { PlayerSkill } from './entities/player-skill.entity';
import { SkillsService } from './skills.service';

@Module({
  imports: [TypeOrmModule.forFeature([SkillDefinition, PlayerSkill])],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
