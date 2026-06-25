// apps/api-gateway/src/player-runtime/player-runtime.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Character } from '../characters/entities/character.entity';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { WorldService } from '../world/world.service';
import { PlayerRuntimeCalculator } from './player-runtime.calculator';
import { equipmentToModifiers } from './equipment-modifier.mapper';
import {
  PlayerRuntime,
  RuntimeModifier,
  RuntimeStatsResult,
  RuntimeTrace,
} from './player-runtime.types';
import { DEFAULT_MAP_ID } from '../common/world-coordinates';

const EQUIPMENT_RELATIONS: string[] = ['equipment', 'equipment.item'];

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
   * - Stats : Character + équipement actif via RuntimeModifier[].
   * Retourne null si le personnage est introuvable.
   */
  async getPlayerRuntime(characterId: string): Promise<PlayerRuntime | null> {
    const character = await this.loadCharacter(characterId);
    if (!character) return null;

    const connected = this.worldService.getConnectedPlayerByCharacterId(characterId);
    const base = PlayerRuntimeCalculator.calculateBaseStats(character);
    const modifiers = this.resolveModifiers(character.equipment ?? []);
    const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, modifiers);

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
   */
  async getRuntimeStats(characterId: string): Promise<RuntimeStatsResult | null> {
    const character = await this.loadCharacter(characterId);
    if (!character) return null;

    const base = PlayerRuntimeCalculator.calculateBaseStats(character);
    const modifiers = this.resolveModifiers(character.equipment ?? []);
    const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, modifiers);
    return { base, derived };
  }

  /**
   * Retourne la trace complète du calcul DerivedStats.
   * Chaque bonus d'équipement y est identifié par sourceLabel et contribution.
   * Utilisé par le Studio SDK pour l'affichage de l'origine des stats.
   */
  async getRuntimeTrace(characterId: string): Promise<RuntimeTrace | null> {
    const character = await this.loadCharacter(characterId);
    if (!character) return null;

    const base = PlayerRuntimeCalculator.calculateBaseStats(character);
    const modifiers = this.resolveModifiers(character.equipment ?? []);
    const { trace } = PlayerRuntimeCalculator.calculateWithTrace(base, modifiers);
    return trace;
  }

  /**
   * Recalcule le runtime depuis la DB sans modification.
   */
  async recalculateRuntime(characterId: string): Promise<PlayerRuntime | null> {
    return this.getPlayerRuntime(characterId);
  }

  // ─── Méthodes privées ────────────────────────────────────────────────────────

  private async loadCharacter(characterId: string): Promise<Character | null> {
    return this.characterRepository.findOne({
      where: { id: characterId },
      relations: EQUIPMENT_RELATIONS,
    });
  }

  /**
   * Point d'injection unique pour tous les systèmes de modification de stats.
   *
   * Phase 3 : équipement actif converti en RuntimeModifier[] via equipmentToModifiers.
   * Phase suivante : ajouter buffs, talents passifs, auras, etc. en concaténant
   * leurs modifiers à la liste retournée.
   */
  private resolveModifiers(equipment: CharacterEquipment[]): RuntimeModifier[] {
    return equipmentToModifiers(equipment);
  }
}
