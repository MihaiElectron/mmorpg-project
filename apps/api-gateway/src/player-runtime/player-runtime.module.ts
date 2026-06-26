// apps/api-gateway/src/player-runtime/player-runtime.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Character } from '../characters/entities/character.entity';
import { CharactersModule } from '../characters/characters.module';
import { WorldModule } from '../world/world.module';
import { PlayerRuntimeService } from './player-runtime.service';
import { PlayerRuntimeController } from './player-runtime.controller';
import { RuntimeDebugRegistry } from './debug-modifier.registry';

@Module({
  imports: [
    TypeOrmModule.forFeature([Character]),
    CharactersModule,
    WorldModule,
  ],
  providers: [PlayerRuntimeService, RuntimeDebugRegistry],
  controllers: [PlayerRuntimeController],
  exports: [PlayerRuntimeService],
})
export class PlayerRuntimeModule {}
