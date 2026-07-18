import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreatureSecondaryCoefficientConfig } from './entities/creature-secondary-coefficient-config.entity';
import { CreatureSecondaryCoefficientsService } from './creature-secondary-coefficients.service';
import { CreatureTemplateDerivedStatOverride } from './entities/creature-template-derived-stat-override.entity';
import { CreatureTemplateDerivedCoefficient } from './entities/creature-template-derived-coefficient.entity';
import { CreatureTemplateScalarOverride } from './entities/creature-template-scalar-override.entity';
import { CreatureTemplateOverridesService } from './creature-template-overrides.service';
import { DerivedStatsModule } from '../derived-stats/derived-stats.module';

/**
 * Configuration serveur des coefficients de dérivation créature.
 *  - `CreatureSecondaryCoefficientsService` : singleton GLOBAL (fallback, V6-B2.5).
 *  - `CreatureTemplateOverridesService` : overrides PAR TEMPLATE (coefficients +
 *    scalaires), autorité PostgreSQL + cache mémoire. Le fallback reste le
 *    singleton global tant qu'aucun override n'existe. Aucun endpoint admin ici.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreatureSecondaryCoefficientConfig,
      CreatureTemplateDerivedStatOverride,
      CreatureTemplateDerivedCoefficient,
      CreatureTemplateScalarOverride,
    ]),
    DerivedStatsModule,
  ],
  providers: [CreatureSecondaryCoefficientsService, CreatureTemplateOverridesService],
  exports: [CreatureSecondaryCoefficientsService, CreatureTemplateOverridesService],
})
export class CreatureConfigModule {}
