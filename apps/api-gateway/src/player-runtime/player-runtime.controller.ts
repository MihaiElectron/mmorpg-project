// apps/api-gateway/src/player-runtime/player-runtime.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CharacterService } from '../characters/character.service';
import { PlayerRuntimeService } from './player-runtime.service';
import { DebugModifierInput } from './debug-modifier.registry';

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
   * GET /player-runtime/me/trace
   * Trace complète du calcul DerivedStats : origine de chaque stat,
   * liste des modifiers appliqués et leur contribution.
   * Conçu pour le Studio SDK.
   */
  @Get('me/trace')
  async getMyTrace(@Request() req) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    const trace = await this.playerRuntimeService.getRuntimeTrace(character.id);
    if (!trace) throw new NotFoundException('Trace introuvable');
    return trace;
  }

  /**
   * GET /player-runtime/me/snapshot
   * Snapshot complet Studio SDK : identity, baseStats, derivedStats,
   * sources par pipeline, modifiers plats, trace, computedAt.
   */
  @Get('me/snapshot')
  async getMySnapshot(@Request() req) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    const snapshot = await this.playerRuntimeService.getRuntimeSnapshot(character.id);
    if (!snapshot) throw new NotFoundException('Snapshot introuvable');
    return snapshot;
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

  // ─── Debug (admin uniquement) ─────────────────────────────────────────────

  /**
   * POST /player-runtime/debug/modifiers
   * Ajoute un modifier debug en mémoire pour un personnage.
   * Visible immédiatement dans le prochain snapshot/trace.
   * Admin uniquement — ne jamais exposer en production sans garde.
   */
  @Post('debug/modifiers')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  addDebugModifier(@Body() body: { characterId: string } & DebugModifierInput) {
    const { characterId, ...input } = body;
    const modifier = this.playerRuntimeService.addDebugModifier(characterId, input);
    return { added: modifier };
  }

  /**
   * DELETE /player-runtime/debug/modifiers/:characterId
   * Supprime tous les modifiers debug d'un personnage.
   * Admin uniquement.
   */
  @Delete('debug/modifiers/:characterId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  clearDebugModifiers(@Param('characterId') characterId: string) {
    this.playerRuntimeService.clearDebugModifiers(characterId);
    return { cleared: true, characterId };
  }

  /**
   * GET /player-runtime/debug/modifiers/:characterId
   * Liste les modifiers debug actifs pour un personnage.
   * Admin uniquement.
   */
  @Get('debug/modifiers/:characterId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  listDebugModifiers(@Param('characterId') characterId: string) {
    return { characterId, modifiers: this.playerRuntimeService.listDebugModifiers(characterId) };
  }
}
