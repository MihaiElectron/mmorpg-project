// apps/api-gateway/src/creature-runtime/creature-runtime.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Creature } from '../creatures/entities/creature.entity';
import { RuntimeDebugRegistry } from '../player-runtime/debug-modifier.registry';
import { CreatureRuntimeService } from './creature-runtime.service';

/**
 * Module Creature Runtime.
 *
 * Fournit CreatureRuntimeService, implémentation d'EntityRuntimeService<CreatureRuntimeSnapshot>.
 *
 * RuntimeDebugRegistry : instance propre à ce module, indépendante de PlayerRuntimeModule.
 * Les modifiers debug créatures et joueurs sont isolés dans des registres distincts.
 *
 * Pas d'import de CreaturesModule : CreatureRuntimeService ne dépend que de
 * CreatureRepository et RuntimeDebugRegistry.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Creature])],
  providers: [CreatureRuntimeService, RuntimeDebugRegistry],
  exports: [CreatureRuntimeService, RuntimeDebugRegistry],
})
export class CreatureRuntimeModule {}
