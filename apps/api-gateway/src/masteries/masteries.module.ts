import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasteryDefinition } from './entities/mastery-definition.entity';
import { PlayerMastery } from './entities/player-mastery.entity';
import { MasteriesService } from './masteries.service';
import { MasteryEffectsService } from './mastery-effects.service';

@Module({
  imports: [TypeOrmModule.forFeature([MasteryDefinition, PlayerMastery])],
  providers: [MasteriesService, MasteryEffectsService],
  exports: [MasteriesService, MasteryEffectsService],
})
export class MasteriesModule {}
