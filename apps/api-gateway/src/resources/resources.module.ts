// apps/api-gateway/src/resources/resources.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from './entities/resource.entity';
import { ResourceTemplate } from './entities/resource-template.entity';
import { ResourcesService } from './resources.service';
import { ResourcesGateway } from './resources.gateway';
import { LootService } from '../world/loot.service';
import { InventoryModule } from '../inventory/inventory.module';
import { CommonModule } from '../common/common.module';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Resource, ResourceTemplate]),
    InventoryModule,
    CommonModule,
    SkillsModule,
  ],
  providers: [ResourcesService, ResourcesGateway, LootService],
  exports: [ResourcesService, ResourcesGateway],
})
export class ResourcesModule {}
