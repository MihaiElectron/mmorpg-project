// apps/api-gateway/src/creature-runtime/creature-runtime.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DebugModifierInput } from '../player-runtime/debug-modifier.registry';
import { CreatureRuntimeService } from './creature-runtime.service';

@Controller('creature-runtime')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CreatureRuntimeController {
  constructor(private readonly creatureRuntimeService: CreatureRuntimeService) {}

  /**
   * GET /creature-runtime/:id/snapshot
   * Snapshot complet Studio SDK pour une créature.
   * Admin uniquement — les créatures ne sont pas des ressources player-owned.
   */
  @Get(':id/snapshot')
  async getSnapshot(@Param('id') id: string) {
    const snapshot = await this.creatureRuntimeService.getRuntimeSnapshot(id);
    if (!snapshot) throw new NotFoundException('Snapshot introuvable');
    return snapshot;
  }

  // ─── Debug (admin / Studio SDK) ────────────────────────────────────────────

  /**
   * POST /creature-runtime/debug/modifiers
   * Ajoute un modifier debug en mémoire pour une créature.
   * Visible dans le prochain snapshot et dans attack() via RuntimeComputeEngine.
   * Admin uniquement — aucune persistance, perdu au redémarrage.
   */
  @Post('debug/modifiers')
  addDebugModifier(@Body() body: { creatureId: string } & DebugModifierInput) {
    const { creatureId, ...input } = body;
    return { added: this.creatureRuntimeService.addDebugModifier(creatureId, input) };
  }

  /**
   * DELETE /creature-runtime/debug/modifiers/:creatureId
   * Supprime tous les modifiers debug d'une créature.
   */
  @Delete('debug/modifiers/:creatureId')
  @HttpCode(200)
  clearDebugModifiers(@Param('creatureId') creatureId: string) {
    this.creatureRuntimeService.clearDebugModifiers(creatureId);
    return { cleared: true, creatureId };
  }

  /**
   * GET /creature-runtime/debug/modifiers/:creatureId
   * Liste les modifiers debug actifs pour une créature.
   */
  @Get('debug/modifiers/:creatureId')
  listDebugModifiers(@Param('creatureId') creatureId: string) {
    return { creatureId, modifiers: this.creatureRuntimeService.listDebugModifiers(creatureId) };
  }
}
