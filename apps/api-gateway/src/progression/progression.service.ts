import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GameConfigService } from '../game-config/game-config.service';
import { Character } from '../characters/entities/character.entity';

export enum ProgressionSource {
  COMBAT = 'COMBAT',
  RESOURCE = 'RESOURCE',
  CRAFT = 'CRAFT',
  QUEST = 'QUEST',
  EXPLORATION = 'EXPLORATION',
  EVENT = 'EVENT',
  ADMIN = 'ADMIN',
}

export interface CharacterXpResult {
  level: number;
  experience: number;
  nextLevelXp: number;
  leveledUp: boolean;
}

@Injectable()
export class ProgressionService {
  constructor(private readonly gameConfigService: GameConfigService) {}

  async getNextLevelXp(level: number): Promise<number> {
    const config = await this.gameConfigService.getConfig();
    return Math.round(config.characterBaseXpPerLevel * Math.pow(level, config.characterXpCurveExponent));
  }

  async applyCharacterXpInTx(
    characterId: string,
    amount: number,
    _source: ProgressionSource,
    manager: EntityManager,
  ): Promise<CharacterXpResult> {
    const character = await manager.findOne(Character, { where: { id: characterId } });
    if (!character) throw new Error(`Character ${characterId} introuvable lors du crédit XP.`);

    const config = await this.gameConfigService.getConfig();
    const maxLevel = config.characterMaxLevel;

    let { level, experience } = character;
    let leveledUp = false;

    experience += amount;

    while (level < maxLevel) {
      const needed = Math.round(config.characterBaseXpPerLevel * Math.pow(level, config.characterXpCurveExponent));
      if (experience < needed) break;
      experience -= needed;
      level += 1;
      leveledUp = true;
    }

    if (level >= maxLevel) {
      level = maxLevel;
    }

    await manager.update(Character, characterId, { level, experience });

    const nextLevelXp = level < maxLevel
      ? Math.round(config.characterBaseXpPerLevel * Math.pow(level, config.characterXpCurveExponent))
      : 0;

    return { level, experience, nextLevelXp, leveledUp };
  }
}
