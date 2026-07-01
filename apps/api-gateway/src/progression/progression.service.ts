import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GameConfigService } from '../game-config/game-config.service';
import { Character } from '../characters/entities/character.entity';

export enum ProgressionSource {
  COMBAT      = 'COMBAT',
  RESOURCE    = 'RESOURCE',
  CRAFT       = 'CRAFT',
  QUEST       = 'QUEST',
  EXPLORATION = 'EXPLORATION',
  EVENT       = 'EVENT',
  ADMIN       = 'ADMIN',
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
    const cfg = await this.gameConfigService.getConfig();
    return Math.round(cfg.characterBaseXpPerLevel * Math.pow(level, cfg.characterXpCurveExponent));
  }

  async applyCharacterXpInTx(
    characterId: string,
    amount: number,
    _source: ProgressionSource,
    manager: EntityManager,
  ): Promise<CharacterXpResult> {
    const character = await manager.findOne(Character, {
      where: { id: characterId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!character) throw new Error(`Character ${characterId} introuvable.`);

    const cfg = await this.gameConfigService.getConfig();
    const base = cfg.characterBaseXpPerLevel;
    const exp  = cfg.characterXpCurveExponent;
    const max  = cfg.characterMaxLevel;

    let { level, experience } = character;
    experience += amount;
    let leveledUp = false;

    while (level < max) {
      const needed = Math.round(base * Math.pow(level, exp));
      if (experience < needed) break;
      experience -= needed;
      level++;
      leveledUp = true;
    }

    await manager.update(Character, characterId, { level, experience });

    const nextLevelXp = level < max
      ? Math.round(base * Math.pow(level, exp))
      : 0;

    return { level, experience, nextLevelXp, leveledUp };
  }
}
