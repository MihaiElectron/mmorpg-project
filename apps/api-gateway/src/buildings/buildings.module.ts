import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BuildingTemplate } from './entities/building-template.entity';
import { Building } from './entities/building.entity';
import { BuildingsService } from './buildings.service';

@Module({
  imports: [TypeOrmModule.forFeature([BuildingTemplate, Building])],
  providers: [BuildingsService],
  exports: [BuildingsService],
})
export class BuildingsModule {}
