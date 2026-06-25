// apps/api-gateway/src/player-runtime/player-runtime.controller.ts

import { Controller, Get, Post, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService } from '../characters/character.service';
import { PlayerRuntimeService } from './player-runtime.service';

@Controller('player-runtime')
@UseGuards(JwtAuthGuard)
export class PlayerRuntimeController {
  constructor(
    private readonly characterService: CharacterService,
    private readonly playerRuntimeService: PlayerRuntimeService,
  ) {}

  /**
   * GET /player-runtime/me
   * PlayerRuntime complet (position live + stats).
   */
  @Get('me')
  async getMyRuntime(@Request() req) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    const runtime = await this.playerRuntimeService.getPlayerRuntime(character.id);
    if (!runtime) throw new NotFoundException('Runtime introuvable');
    return runtime;
  }

  /**
   * GET /player-runtime/me/stats
   * BaseStats + DerivedStats uniquement (sans position).
   */
  @Get('me/stats')
  async getMyStats(@Request() req) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    const stats = await this.playerRuntimeService.getRuntimeStats(character.id);
    if (!stats) throw new NotFoundException('Stats introuvables');
    return stats;
  }

  /**
   * POST /player-runtime/me/recalculate
   * Recalcule et retourne le PlayerRuntime depuis la DB.
   */
  @Post('me/recalculate')
  async recalculateMyRuntime(@Request() req) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    const runtime = await this.playerRuntimeService.recalculateRuntime(character.id);
    if (!runtime) throw new NotFoundException('Runtime introuvable');
    return runtime;
  }
}
