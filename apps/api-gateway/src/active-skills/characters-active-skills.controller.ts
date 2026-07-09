import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService } from '../characters/character.service';
import { MasteriesService } from '../masteries/masteries.service';
import { ActiveSkillsService, PlayerActiveSkill } from './active-skills.service';

/**
 * Route JOUEUR (runtime, lecture seule) des skills actifs — Skills V1-E.
 *
 * `GET /characters/me/active-skills` : renvoie les skills utilisables par le
 * personnage principal du compte authentifié. Jamais de route `/admin/*` ici
 * (frontière Runtime/Admin). Le personnage est dérivé du JWT, jamais du client.
 * Tout le filtrage (niveau, masteries, exécutabilité) est fait serveur.
 */
@Controller('characters')
@UseGuards(JwtAuthGuard)
export class CharactersActiveSkillsController {
  constructor(
    private readonly characterService: CharacterService,
    private readonly masteriesService: MasteriesService,
    private readonly activeSkillsService: ActiveSkillsService,
  ) {}

  @Get('me/active-skills')
  async getMine(@Request() req): Promise<PlayerActiveSkill[]> {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    const masteryRows = await this.masteriesService.getCharacterMasteries(character.id);
    const masteryLevels: Record<string, number> = {};
    for (const m of masteryRows) masteryLevels[m.key] = m.level;
    return this.activeSkillsService.getUsableSkillsForCharacter(
      character.level ?? 1,
      masteryLevels,
    );
  }
}
