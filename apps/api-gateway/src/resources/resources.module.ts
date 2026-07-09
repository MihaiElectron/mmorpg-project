// apps/api-gateway/src/resources/resources.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from './entities/resource.entity';
import { ResourceTemplate } from './entities/resource-template.entity';
import { ResourcesService } from './resources.service';
import { ResourcesGateway } from './resources.gateway';
import { LootService } from '../world/loot.service';
import { CommonModule } from '../common/common.module';
import { MasteriesModule } from '../masteries/masteries.module';
import { ItemMaterializationModule } from '../item-materialization/item-materialization.module';
import { ProgressionModule } from '../progression/progression.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Resource, ResourceTemplate]),
    CommonModule,
    MasteriesModule,
    ItemMaterializationModule,
    ProgressionModule,
  ],
  providers: [ResourcesService, ResourcesGateway, LootService],
  exports: [ResourcesService, ResourcesGateway],
})
export class ResourcesModule {}
