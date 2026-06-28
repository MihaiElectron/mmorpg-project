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
import { TradeService } from './trade.service';
import { CreateTradeDto } from './dto/create-trade.dto';
import { TradeItemDto } from './dto/trade-item.dto';

@Controller('trade')
@UseGuards(JwtAuthGuard)
export class TradeController {
  constructor(
    private readonly tradeService: TradeService,
    private readonly characterService: CharacterService,
  ) {}

  @Post('create')
  async createTrade(@Request() req, @Body() dto: CreateTradeDto) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.tradeService.createTrade(character.id, dto.targetCharacterId);
  }

  @Get(':id')
  async getTrade(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.tradeService.getTrade(character.id, id);
  }

  @Post(':id/add')
  @HttpCode(HttpStatus.NO_CONTENT)
  async addItem(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TradeItemDto,
  ) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    await this.tradeService.addItem(character.id, id, dto.itemInstanceId);
  }

  @Post(':id/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeItem(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TradeItemDto,
  ) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    await this.tradeService.removeItem(character.id, id, dto.itemInstanceId);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  async accept(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    await this.tradeService.accept(character.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    await this.tradeService.cancel(character.id, id);
  }
}
