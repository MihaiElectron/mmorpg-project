import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GameConfigService } from '../game-config/game-config.service';
import { Character } from '../characters/entities/character.entity';
import { xpToAdvanceFromLevel } from './progression.formula';

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
  gainedLevels: number;
  unspentStatPoints: number;
}

@Injectable()
export class ProgressionService {
  constructor(private readonly gameConfigService: GameConfigService) {}

  async getNextLevelXp(level: number): Promise<number> {
    const cfg = await this.gameConfigService.getConfig();
    return xpToAdvanceFromLevel(level, cfg);
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
    const max = cfg.characterMaxLevel;

    let { level, experience } = character;
    const startLevel = level;
    experience += amount;

    while (level < max) {
      const needed = xpToAdvanceFromLevel(level, cfg);
      if (experience < needed) break;
      experience -= needed;
      level++;
    }

    const gainedLevels = level - startLevel;
    const leveledUp = gainedLevels > 0;

    // Points de stats accordés dans la MÊME transaction/verrou que le level-up,
    // proportionnels au nombre de niveaux réellement gagnés (multi-level géré,
    // aucune double attribution : basé sur startLevel figé sous verrou).
    // Le nombre par niveau est désormais une règle globale configurable
    // (GameConfig.statPointsPerLevel, ADR-0018) — plus de constante hardcodée.
    const unspentStatPoints =
      character.unspentStatPoints + gainedLevels * cfg.statPointsPerLevel;

    await manager.update(Character, characterId, {
      level,
      experience,
      unspentStatPoints,
    });

    const nextLevelXp = level < max ? xpToAdvanceFromLevel(level, cfg) : 0;

    return { level, experience, nextLevelXp, leveledUp, gainedLevels, unspentStatPoints };
  }
}
