import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService } from '../characters/character.service';
import { MailService } from './mail.service';
import { SendMailDto } from './dto/send-mail.dto';

@Controller('mail')
@UseGuards(JwtAuthGuard)
export class MailController {
  constructor(
    private readonly mailService: MailService,
    private readonly characterService: CharacterService,
  ) {}

  @Get('inbox')
  async listInbox(@Request() req) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.mailService.listInbox(character.id);
  }

  @Get('sent')
  async listSent(@Request() req) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.mailService.listSent(character.id);
  }

  @Post('send')
  async send(@Request() req, @Body() dto: SendMailDto) {
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
  async claim(@Request() req, @Param('id') mailId: string) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    await this.mailService.claim(character.id, mailId);
  }
}
