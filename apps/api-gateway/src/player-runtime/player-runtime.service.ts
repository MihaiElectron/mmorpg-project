// apps/api-gateway/src/player-runtime/player-runtime.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Character } from '../characters/entities/character.entity';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { WorldService } from '../world/world.service';
import { PlayerRuntimeCalculator } from './player-runtime.calculator';
import { equipmentToModifiers } from './equipment-modifier.mapper';
import { effectToModifiers } from './effect-modifier.mapper';
import {
  PlayerRuntime,
  PlayerRuntimeEffect,
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
   * - Stats : Character + équipement actif + effets actifs via RuntimeModifier[].
   * Retourne null si le personnage est introuvable.
   */
  async getPlayerRuntime(characterId: string): Promise<PlayerRuntime | null> {
    const character = await this.loadCharacter(characterId);
    if (!character) return null;

    const connected = this.worldService.getConnectedPlayerByCharacterId(characterId);
    const base = PlayerRuntimeCalculator.calculateBaseStats(character);
    const effects = this.resolveEffects(characterId);
    const modifiers = this.resolveModifiers(character.equipment ?? [], effects);
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
    const effects = this.resolveEffects(characterId);
    const modifiers = this.resolveModifiers(character.equipment ?? [], effects);
    const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, modifiers);
    return { base, derived };
  }

  /**
   * Retourne la trace complète du calcul DerivedStats.
   * Chaque bonus (équipement et effets) est identifié par sourceLabel et contribution.
   * Utilisé par le Studio SDK pour l'affichage de l'origine des stats.
   */
  async getRuntimeTrace(characterId: string): Promise<RuntimeTrace | null> {
    const character = await this.loadCharacter(characterId);
    if (!character) return null;

    const base = PlayerRuntimeCalculator.calculateBaseStats(character);
    const effects = this.resolveEffects(characterId);
    const modifiers = this.resolveModifiers(character.equipment ?? [], effects);
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
   * Point d'injection pour les effets runtime actifs du personnage.
   *
   * Phase 4 : retourne [] — fondation uniquement, aucun système de buff actif.
   * Phase suivante : charger buffs actifs, consommables utilisés, auras de zone,
   * événements de map, etc. Aucune persistance ici — les effets sont construits
   * en mémoire à partir des sources existantes.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private resolveEffects(_characterId: string): PlayerRuntimeEffect[] {
    return [];
  }

  /**
   * Point d'injection unique pour tous les systèmes de modification de stats.
   *
   * Phase 4 : équipement + effets runtime — les deux convertis en RuntimeModifier[].
   * Phase suivante : ajouter talents passifs, auras permanentes, etc. en étendant
   * resolveEffects() — resolveModifiers() n'a pas à changer.
   */
  private resolveModifiers(
    equipment: CharacterEquipment[],
    effects: PlayerRuntimeEffect[],
  ): RuntimeModifier[] {
    return [
      ...equipmentToModifiers(equipment),
      ...effectToModifiers(effects),
    ];
  }
}
