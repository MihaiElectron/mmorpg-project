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
import { GuildStorageService } from './guild-storage.service';
import { GuildStorageOperationDto } from './dto/guild-storage-operation.dto';

@Controller('guild/:guildId/storage')
@UseGuards(JwtAuthGuard)
export class GuildStorageController {
  constructor(
    private readonly guildStorageService: GuildStorageService,
    private readonly characterService: CharacterService,
  ) {}

  @Get()
  async listContents(
    @Request() req,
    @Param('guildId', ParseUUIDPipe) guildId: string,
  ) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.guildStorageService.listContents(character.id, guildId);
  }

  @Post('deposit')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deposit(
    @Request() req,
    @Param('guildId', ParseUUIDPipe) guildId: string,
    @Body() dto: GuildStorageOperationDto,
  ) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    await this.guildStorageService.deposit(character.id, guildId, dto.itemInstanceId);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.NO_CONTENT)
  async withdraw(
    @Request() req,
    @Param('guildId', ParseUUIDPipe) guildId: string,
    @Body() dto: GuildStorageOperationDto,
  ) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    await this.guildStorageService.withdraw(character.id, guildId, dto.itemInstanceId);
  }
}
