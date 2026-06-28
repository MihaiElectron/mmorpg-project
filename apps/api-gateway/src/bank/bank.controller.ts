import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService } from '../characters/character.service';
import { BankService } from './bank.service';
import { BankOperationDto } from './dto/bank-operation.dto';

@Controller('bank')
@UseGuards(JwtAuthGuard)
export class BankController {
  constructor(
    private readonly bankService: BankService,
    private readonly characterService: CharacterService,
  ) {}

  @Get()
  async listContents(@Request() req) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.bankService.listContents(character.id);
  }

  @Post('deposit')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deposit(@Request() req, @Body() dto: BankOperationDto) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    await this.bankService.deposit(character.id, dto.itemInstanceId);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.NO_CONTENT)
  async withdraw(@Request() req, @Body() dto: BankOperationDto) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    await this.bankService.withdraw(character.id, dto.itemInstanceId);
  }
}
