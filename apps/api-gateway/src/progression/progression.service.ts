import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GameConfigService } from '../game-config/game-config.service';
import { Character } from '../characters/entities/character.entity';
import {
  levelFromCumulativeXp,
  experienceIntoCurrentLevel,
  nextLevelXpForLevel,
  resolveCumulativeExperience,
} from './progression.formula';

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
    return nextLevelXpForLevel(level, cfg);
  }

  /**
   * Applique un gain d'XP personnage (gameplay normal — combat, récolte,
   * craft…). Source de vérité : `cumulativeExperience`, jamais décrémentée.
   * `level` et `experience` (XP partielle dans le niveau courant, conservée
   * pour compatibilité UI) sont recalculés à chaque gain depuis la courbe XP
   * en vigueur — jamais une boucle de décrément parallèle.
   */
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
    const startLevel = character.level;

    const cumulativeExperience = resolveCumulativeExperience(character, cfg) + amount;
    const level = levelFromCumulativeXp(cumulativeExperience, cfg);
    const experience = experienceIntoCurrentLevel(cumulativeExperience, level, cfg);

    // Défensif : ne jamais retirer de points via un gain d'XP normal. Un
    // niveau ne peut redescendre ici que si la courbe/le cap ont changé entre
    // deux gains — le retrait de points reste réservé au recalcul admin
    // explicite (AdminService.recalculateCharacterProgression).
    const gainedLevels = Math.max(0, level - startLevel);
    const leveledUp = gainedLevels > 0;

    // Points de stats accordés dans la MÊME transaction/verrou que le level-up,
    // proportionnels au nombre de niveaux réellement gagnés (multi-level géré,
    // aucune double attribution : basé sur startLevel figé sous verrou).
    const unspentStatPoints =
      character.unspentStatPoints + gainedLevels * cfg.statPointsPerLevel;

    await manager.update(Character, characterId, {
      level,
      experience,
      cumulativeExperience,
      unspentStatPoints,
    });

    const nextLevelXp = nextLevelXpForLevel(level, cfg);

    return { level, experience, nextLevelXp, leveledUp, gainedLevels, unspentStatPoints };
  }
}
