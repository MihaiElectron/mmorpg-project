import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService } from '../characters/character.service';
import { CraftingService, CraftResult } from './crafting.service';
import { CraftRequestDto } from './dto/craft-request.dto';

@Controller('crafting')
@UseGuards(JwtAuthGuard)
export class CraftingController {
  constructor(
    private readonly craftingService: CraftingService,
    private readonly characterService: CharacterService,
  ) {}

  /**
   * POST /crafting/craft
   *
   * Déclenche une ou plusieurs tentatives de craft pour le personnage principal
   * de l'utilisateur authentifié.
   *
   * - characterId résolu côté serveur depuis le JWT (jamais accepté du client)
   * - whitelist + forbidNonWhitelisted rejette tout champ inconnu du DTO
   * - quantity bornée à [1, 99] par le DTO
   */
  @Post('craft')
  async craft(@Request() req, @Body() dto: CraftRequestDto): Promise<CraftResult> {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.craftingService.craft(character.id, dto.recipeId, dto.quantity);
  }
}
