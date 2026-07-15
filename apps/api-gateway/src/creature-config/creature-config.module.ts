import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreatureSecondaryCoefficientConfig } from './entities/creature-secondary-coefficient-config.entity';
import { CreatureSecondaryCoefficientsService } from './creature-secondary-coefficients.service';

/**
 * Configuration serveur des coefficients de dérivation créature (V6-B2.5 Lot 2).
 * Expose `CreatureSecondaryCoefficientsService` (cache mémoire + fallback code)
 * aux consommateurs runtime (CreaturesService). Aucun endpoint admin ici.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CreatureSecondaryCoefficientConfig])],
  providers: [CreatureSecondaryCoefficientsService],
  exports: [CreatureSecondaryCoefficientsService],
})
export class CreatureConfigModule {}
