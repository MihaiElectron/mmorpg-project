import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameConfig } from './game-config.entity';
import { GameConfigService } from './game-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([GameConfig])],
  providers: [GameConfigService],
  exports: [GameConfigService],
})
export class GameConfigModule {}
