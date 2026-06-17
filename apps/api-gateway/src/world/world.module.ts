import { Module } from '@nestjs/common';
import { WorldGateway } from './world.gateway';
import { WorldService } from './world.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Character } from '../characters/entities/character.entity';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([Character]), CommonModule],
  providers: [WorldGateway, WorldService],
  exports: [WorldService],
})
export class WorldModule {}
