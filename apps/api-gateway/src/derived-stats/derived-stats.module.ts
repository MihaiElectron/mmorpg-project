import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DerivedStatDefinition } from './entities/derived-stat-definition.entity';
import { DerivedStatsService } from './derived-stats.service';

@Module({
  imports: [TypeOrmModule.forFeature([DerivedStatDefinition])],
  providers: [DerivedStatsService],
  exports: [DerivedStatsService],
})
export class DerivedStatsModule {}
