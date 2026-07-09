import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillDefinition } from './entities/skill-definition.entity';
import { ActiveSkillsService } from './active-skills.service';
import { SkillCastService } from './skill-cast.service';
import { SkillsGateway } from './skills.gateway';
import { Character } from '../characters/entities/character.entity';
import { CommonModule } from '../common/common.module';
import { CreaturesModule } from '../creatures/creatures.module';
import { MasteriesModule } from '../masteries/masteries.module';
import { DerivedStatsModule } from '../derived-stats/derived-stats.module';
import { WorldItemsModule } from '../world-items/world-items.module';
import { ItemMaterializationModule } from '../item-materialization/item-materialization.module';

/**
 * Domaine Skills actifs (ADR-0019).
 *
 * - V1-A : catalogue `skill_definition` (ActiveSkillsService, routes admin).
 * - V1-D : cast serveur `skill:cast` (SkillCastService + SkillsGateway),
 *   mono-cible damage contre créature. Réutilise `CreaturesService` pour la
 *   logique de mort/loot/XP, `CharacterStatsCalculator` + `MasteriesService`
 *   pour le scaling, et le calculateur pur `calculateSkillEffect`.
 *
 * Distinct du domaine Masteries (`mastery_definition`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SkillDefinition, Character]),
    CommonModule,
    CreaturesModule,
    MasteriesModule,
    DerivedStatsModule,
    WorldItemsModule,
    ItemMaterializationModule,
  ],
  providers: [ActiveSkillsService, SkillCastService, SkillsGateway],
  exports: [ActiveSkillsService],
})
export class ActiveSkillsModule {}
