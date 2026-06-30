import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService } from '../characters/character.service';
import { EconomyService } from './economy.service';

export interface BalanceDto {
  balanceBronze: string;
  gold: number;
  silver: number;
  bronze: number;
}

@Controller('economy')
@UseGuards(JwtAuthGuard)
export class EconomyController {
  constructor(
    private readonly economyService: EconomyService,
    private readonly characterService: CharacterService,
  ) {}

  @Get('me/balance')
  async getMyBalance(@Request() req): Promise<BalanceDto> {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    const wallet = await this.economyService.getOrCreateWallet('character', character.id);
    const total = BigInt(wallet.balanceBronze);
    return {
      balanceBronze: total.toString(),
      gold: Number(total / 10000n),
      silver: Number((total % 10000n) / 100n),
      bronze: Number(total % 100n),
    };
  }
}
