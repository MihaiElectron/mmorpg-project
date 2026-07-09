import { Module } from '@nestjs/common';
import { WorldGateway } from './world.gateway';
import { WorldService } from './world.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Character } from '../characters/entities/character.entity';
import { RespawnPoint } from './entities/respawn-point.entity';
import { CommonModule } from '../common/common.module';
import { DerivedStatsModule } from '../derived-stats/derived-stats.module';

@Module({
  imports: [TypeOrmModule.forFeature([Character, RespawnPoint]), CommonModule, DerivedStatsModule],
  providers: [WorldGateway, WorldService],
  exports: [WorldService],
})
export class WorldModule {}
