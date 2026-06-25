// apps/api-gateway/src/player-runtime/player-runtime.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Character } from '../characters/entities/character.entity';
import { WorldService } from '../world/world.service';
import { PlayerRuntimeCalculator } from './player-runtime.calculator';
import {
  PlayerRuntime,
  RuntimeStatsResult,
} from './player-runtime.types';
import { DEFAULT_MAP_ID } from '../common/world-coordinates';

@Injectable()
export class PlayerRuntimeService {
  constructor(
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
    private readonly worldService: WorldService,
  ) {}

  /**
   * Construit le PlayerRuntime complet pour un characterId.
   * - Position : depuis ConnectedPlayer (live) ou dernière valeur DB.
   * - Stats : toujours depuis DB (source de vérité).
   * Retourne null si le personnage est introuvable.
   */
  async getPlayerRuntime(characterId: string): Promise<PlayerRuntime | null> {
    const character = await this.characterRepository.findOne({
      where: { id: characterId },
    });
    if (!character) return null;

    const connected = this.worldService.getConnectedPlayerByCharacterId(characterId);
    const base = PlayerRuntimeCalculator.calculateBaseStats(character);
    const derived = PlayerRuntimeCalculator.calculateDerivedStats(base);

    return {
      characterId: character.id,
      name: character.name,
      worldX: connected?.worldX ?? character.worldX ?? 0,
      worldY: connected?.worldY ?? character.worldY ?? 0,
      mapId: connected?.mapId ?? character.mapId ?? DEFAULT_MAP_ID,
      baseStats: base,
      derivedStats: derived,
      isConnected: connected !== null,
      socketId: connected?.socketId ?? null,
    };
  }

  /**
   * Retourne uniquement BaseStats + DerivedStats sans position.
   * Plus léger que getPlayerRuntime() quand la position n'est pas nécessaire.
   */
  async getRuntimeStats(characterId: string): Promise<RuntimeStatsResult | null> {
    const character = await this.characterRepository.findOne({
      where: { id: characterId },
    });
    if (!character) return null;

    const base = PlayerRuntimeCalculator.calculateBaseStats(character);
    const derived = PlayerRuntimeCalculator.calculateDerivedStats(base);
    return { base, derived };
  }

  /**
   * Recalcule le runtime depuis la DB sans modification.
   * Équivalent à getPlayerRuntime() en phase 1.
   * Sera étendu quand Equipment et Buffs contribueront aux stats.
   */
  async recalculateRuntime(characterId: string): Promise<PlayerRuntime | null> {
    return this.getPlayerRuntime(characterId);
  }
}
