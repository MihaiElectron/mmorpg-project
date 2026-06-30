import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService } from '../characters/character.service';
import { MailService } from './mail.service';
import { BuildingsService } from '../buildings/buildings.service';
import { WorldService } from '../world/world.service';
import { BuildingType } from '../buildings/enums/building-type.enum';
import { BuildingState } from '../buildings/enums/building-state.enum';
import { SendMailDto } from './dto/send-mail.dto';

@Controller('mail')
@UseGuards(JwtAuthGuard)
export class MailController {
  constructor(
    private readonly mailService: MailService,
    private readonly characterService: CharacterService,
    private readonly buildingsService: BuildingsService,
    private readonly worldService: WorldService,
  ) {}

  private async validateBuildingAccess(userId: string, buildingId: string): Promise<void> {
    const character = await this.characterService.findFirstByUser(userId);
    const building = await this.buildingsService.findBuildingById(buildingId);
    if (!building) throw new BadRequestException(`Building "${buildingId}" introuvable.`);
    if (!building.template) throw new BadRequestException('Template building introuvable.');
    if (building.template.buildingType !== BuildingType.MAILBOX) {
      throw new BadRequestException(`Ce building n'est pas une mailbox.`);
    }
    if (building.state !== BuildingState.ACTIVE) {
      throw new BadRequestException(`Le building n'est pas actif.`);
    }
    if (!building.template.enabled) {
      throw new BadRequestException(`Le template building est désactivé.`);
    }
    const charPos = {
      worldX: character.worldX ?? 0,
      worldY: character.worldY ?? 0,
      mapId: character.mapId ?? 1,
    };
    const buildingPos = { worldX: building.worldX, worldY: building.worldY, mapId: building.mapId };
    const error = this.worldService.validateInteraction(charPos, buildingPos, building.template.interactionRadiusWU);
    if (error) throw new BadRequestException(`Trop loin de la boîte aux lettres : ${error}`);
  }

  @Get('inbox')
  async listInbox(@Request() req, @Query('buildingId') buildingId?: string) {
    if (buildingId) await this.validateBuildingAccess(req.user.userId, buildingId);
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.mailService.listInbox(character.id);
  }

  @Get('sent')
  async listSent(@Request() req) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.mailService.listSent(character.id);
  }

  @Post('send')
  async send(@Request() req, @Body() dto: SendMailDto & { buildingId?: string }) {
    if (dto.buildingId) await this.validateBuildingAccess(req.user.userId, dto.buildingId);
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.mailService.send({
      senderCharacterId: character.id,
      recipientCharacterId: dto.recipientCharacterId,
      subject: dto.subject,
      body: dto.body ?? '',
      itemInstanceId: dto.itemInstanceId,
    });
  }

  @Post(':id/claim')
  @HttpCode(HttpStatus.NO_CONTENT)
  async claim(
    @Request() req,
    @Param('id') mailId: string,
    @Body() body: { buildingId?: string },
  ) {
    if (body?.buildingId) await this.validateBuildingAccess(req.user.userId, body.buildingId);
    const character = await this.characterService.findFirstByUser(req.user.userId);
    await this.mailService.claim(character.id, mailId);
  }
}
