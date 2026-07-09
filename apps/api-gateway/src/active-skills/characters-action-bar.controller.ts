import { Body, Controller, Get, Param, ParseIntPipe, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService } from '../characters/character.service';
import { ActionBarService } from './action-bar.service';
import { SetActionBarSlotDto } from './dto/set-action-bar-slot.dto';

/**
 * Route JOUEUR (runtime) de la barre d'action persistante — Skills V1-I-A.
 *
 * Le personnage est TOUJOURS dérivé du JWT (`findFirstByUser`), jamais du
 * payload/route client. Aucune route `/admin/*` (frontière Runtime/Admin).
 * Toute la validation d'équipement est faite serveur (ActionBarService).
 */
@Controller('characters')
@UseGuards(JwtAuthGuard)
export class CharactersActionBarController {
  constructor(
    private readonly characterService: CharacterService,
    private readonly actionBarService: ActionBarService,
  ) {}

  @Get('me/action-bar')
  async getMine(@Request() req) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.actionBarService.getActionBar(character.id);
  }

  @Put('me/action-bar/slots/:slotIndex')
  async setSlot(
    @Request() req,
    @Param('slotIndex', ParseIntPipe) slotIndex: number,
    @Body() dto: SetActionBarSlotDto,
  ) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.actionBarService.setActionBarSlot(character.id, slotIndex, dto.skillKey ?? null);
  }
}
