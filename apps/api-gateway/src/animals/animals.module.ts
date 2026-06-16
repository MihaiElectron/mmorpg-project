import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Animal } from './entities/animal.entity';
import { AnimalsGateway } from './animals.gateway';
import { AnimalsService } from './animals.service';
import { Character } from '../characters/entities/character.entity';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([Animal, Character]), CommonModule],
  providers: [AnimalsGateway, AnimalsService],
  exports: [AnimalsService],
})
export class AnimalsModule {}
