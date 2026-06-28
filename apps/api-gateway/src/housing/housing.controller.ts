import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService } from '../characters/character.service';
import { HousingService } from './housing.service';
import { HousingOperationDto } from './dto/housing-operation.dto';

@Controller('housing/:houseId')
@UseGuards(JwtAuthGuard)
export class HousingController {
  constructor(
    private readonly housingService: HousingService,
    private readonly characterService: CharacterService,
  ) {}

  @Get('storage')
  async listContents(
    @Request() req,
    @Param('houseId', ParseUUIDPipe) houseId: string,
  ) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.housingService.listContents(character.id, houseId);
  }

  @Post('deposit')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deposit(
    @Request() req,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body() dto: HousingOperationDto,
  ) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    await this.housingService.deposit(character.id, houseId, dto.itemInstanceId);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.NO_CONTENT)
  async withdraw(
    @Request() req,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body() dto: HousingOperationDto,
  ) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    await this.housingService.withdraw(character.id, houseId, dto.itemInstanceId);
  }
}
