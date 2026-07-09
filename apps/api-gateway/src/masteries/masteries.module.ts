import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasteryDefinition } from './entities/mastery-definition.entity';
import { PlayerMastery } from './entities/player-mastery.entity';
import { MasteriesService } from './masteries.service';

@Module({
  imports: [TypeOrmModule.forFeature([MasteryDefinition, PlayerMastery])],
  providers: [MasteriesService],
  exports: [MasteriesService],
})
export class MasteriesModule {}
