import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BuildingsService } from './buildings.service';

@Controller('buildings')
@UseGuards(JwtAuthGuard)
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Get('world-objects')
  getWorldObjects(@Query('mapId') mapId?: string) {
    return this.buildingsService.getBuildingWorldObjects(
      mapId != null ? Number(mapId) : undefined,
    );
  }
}
