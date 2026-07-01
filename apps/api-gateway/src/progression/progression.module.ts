import { Module } from '@nestjs/common';
import { GameConfigModule } from '../game-config/game-config.module';
import { ProgressionService } from './progression.service';

@Module({
  imports: [GameConfigModule],
  providers: [ProgressionService],
  exports: [ProgressionService],
})
export class ProgressionModule {}
