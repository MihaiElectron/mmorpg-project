import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonalLootEntitlement } from './entities/personal-loot-entitlement.entity';
import { PersonalLootEntitlementService } from './personal-loot-entitlement.service';

/**
 * Domaine `rewards` — fondation des droits de butin personnel.
 *
 * Lot 1 : purement interne. Enregistre l'entité persistante et fournit le
 * service composable, sans controller, sans gateway, sans DTO client, sans
 * scheduler et sans dépendance vers les modules gameplay (creatures,
 * world-items, inventory, mail) — aucune dépendance circulaire possible.
 *
 * Les domaines consommateurs (futurs lots) importeront ce module pour composer
 * les primitives `*WithinManager` dans leurs propres transactions.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PersonalLootEntitlement])],
  providers: [PersonalLootEntitlementService],
  exports: [PersonalLootEntitlementService],
})
export class RewardsModule {}
