// apps/api-gateway/src/resources/resources.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from './entities/resource.entity';
import { ResourcesService } from './resources.service';
import { ResourcesGateway } from './resources.gateway';
import { LootService } from '../world/loot.service'; // ✅ Ajout propre
import { InventoryModule } from '../inventory/inventory.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Resource]),
    InventoryModule,
    CommonModule,
  ],
  providers: [
    ResourcesService,
    ResourcesGateway,
    LootService, // ✅ Injection du loot ici
  ],
  exports: [ResourcesService, ResourcesGateway],
})
export class ResourcesModule {}
