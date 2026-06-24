import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreatureTemplate } from '../animals/entities/creature-template.entity';
import { CreatureSpawn } from '../animals/entities/creature-spawn.entity';
import { Animal } from '../animals/entities/animal.entity';
import { Character } from '../characters/entities/character.entity';
import { Resource } from '../resources/entities/resource.entity';
import { ResourceTemplate } from '../resources/entities/resource-template.entity';
import { SkillDefinition } from '../skills/entities/skill-definition.entity';
import { PlayerSkill } from '../skills/entities/player-skill.entity';
import { AnimalsModule } from '../animals/animals.module';
import { ResourcesModule } from '../resources/resources.module';
import { WorldModule } from '../world/world.module';
import { CommonModule } from '../common/common.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminGateway } from './admin.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([CreatureTemplate, CreatureSpawn, Animal, Character, Resource, ResourceTemplate, SkillDefinition, PlayerSkill]),
    AnimalsModule,
    ResourcesModule,
    WorldModule,
    CommonModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGateway],
})
export class AdminModule {}
