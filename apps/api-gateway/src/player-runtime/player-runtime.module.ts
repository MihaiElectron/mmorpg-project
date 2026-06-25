// apps/api-gateway/src/player-runtime/player-runtime.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Character } from '../characters/entities/character.entity';
import { CharactersModule } from '../characters/characters.module';
import { WorldModule } from '../world/world.module';
import { PlayerRuntimeService } from './player-runtime.service';
import { PlayerRuntimeController } from './player-runtime.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Character]),
    CharactersModule,
    WorldModule,
  ],
  providers: [PlayerRuntimeService],
  controllers: [PlayerRuntimeController],
  exports: [PlayerRuntimeService],
})
export class PlayerRuntimeModule {}
