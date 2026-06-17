import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Animal } from './entities/animal.entity';
import { CreatureTemplate } from './entities/creature-template.entity';
import { CreatureSpawn } from './entities/creature-spawn.entity';
import { AnimalsGateway } from './animals.gateway';
import { AnimalsService } from './animals.service';
import { Character } from '../characters/entities/character.entity';
import { CommonModule } from '../common/common.module';
import { WorldModule } from '../world/world.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Animal, CreatureTemplate, CreatureSpawn, Character]),
    CommonModule,
    WorldModule,
  ],
  providers: [AnimalsGateway, AnimalsService],
  exports: [AnimalsService],
})
export class AnimalsModule {}
