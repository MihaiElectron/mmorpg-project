// apps/api-gateway/src/player-runtime/player-runtime.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Character } from '../characters/entities/character.entity';
import { WorldService } from '../world/world.service';
import { PlayerRuntimeCalculator } from './player-runtime.calculator';
import {
  DebugRuntimeSource,
  EffectSource,
  EquipmentSource,
  PlayerRuntimeSnapshot,
  RuntimeSource,
} from './runtime-source';
import {
  PlayerRuntime,
  PlayerRuntimeEffect,
  RuntimeModifier,
  RuntimeStatsResult,
  RuntimeTrace,
} from './player-runtime.types';
import { DebugModifierInput, DebugModifierRegistry } from './debug-modifier.registry';
import { DEFAULT_MAP_ID } from '../common/world-coordinates';

const EQUIPMENT_RELATIONS: string[] = ['equipment', 'equipment.item'];

@Injectable()
export class PlayerRuntimeService {
  constructor(
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
    private readonly worldService: WorldService,
    private readonly debugRegistry: DebugModifierRegistry,
  ) {}

  /**
   * Construit le PlayerRuntime complet pour un characterId.
   * - Position : depuis ConnectedPlayer (live) ou dernière valeur DB.
   * - Stats : Character + sources Runtime agrégées via RuntimeModifier[].
   * Retourne null si le personnage est introuvable.
   */
  async getPlayerRuntime(characterId: string): Promise<PlayerRuntime | null> {
    const character = await this.loadCharacter(characterId);
    if (!character) return null;

    const connected = this.worldService.getConnectedPlayerByCharacterId(characterId);
    const base = PlayerRuntimeCalculator.calculateBaseStats(character);
    const sources = this.buildSources(character, this.resolveEffects(characterId));
    const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, this.resolveModifiers(sources));

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
    const sources = this.buildSources(character, this.resolveEffects(characterId));
    const derived = PlayerRuntimeCalculator.calculateDerivedStats(base, this.resolveModifiers(sources));
    return { base, derived };
  }

  /**
   * Retourne la trace complète du calcul DerivedStats.
   * Chaque modifier est identifié par sourceLabel, sourceType et contribution.
   * Utilisé par le Studio SDK pour l'affichage de l'origine des stats.
   */
  async getRuntimeTrace(characterId: string): Promise<RuntimeTrace | null> {
    const character = await this.loadCharacter(characterId);
    if (!character) return null;

    const base = PlayerRuntimeCalculator.calculateBaseStats(character);
    const sources = this.buildSources(character, this.resolveEffects(characterId));
    const { trace } = PlayerRuntimeCalculator.calculateWithTrace(base, this.resolveModifiers(sources));
    return trace;
  }

  /**
   * Retourne un snapshot complet du Player Runtime pour le Studio SDK.
   *
   * Contient en un seul appel : baseStats, derivedStats, sources par pipeline,
   * liste plate des modifiers actifs et trace complète.
   *
   * Optimisation : getModifiers() est appelé une seule fois par source —
   * la liste plate et la vue par source partagent les mêmes données.
   */
  async getRuntimeSnapshot(characterId: string): Promise<PlayerRuntimeSnapshot | null> {
    const character = await this.loadCharacter(characterId);
    if (!character) return null;

    const base = PlayerRuntimeCalculator.calculateBaseStats(character);
    const runtimeSources = this.buildSources(character, this.resolveEffects(characterId));

    const sourceData = runtimeSources.map((s) => ({
      kind: s.kind,
      modifiers: s.getModifiers(),
    }));
    const modifiers: RuntimeModifier[] = sourceData.flatMap((s) => s.modifiers);
    const { derived, trace } = PlayerRuntimeCalculator.calculateWithTrace(base, modifiers);

    return {
      entityId: character.id,
      entityKind: 'player',
      characterId: character.id,
      name: character.name,
      baseStats: base,
      derivedStats: derived,
      sources: sourceData,
      modifiers,
      trace,
      computedAt: trace.computedAt,
    };
  }

  /**
   * Recalcule le runtime depuis la DB sans modification.
   */
  async recalculateRuntime(characterId: string): Promise<PlayerRuntime | null> {
    return this.getPlayerRuntime(characterId);
  }

  // ─── Debug (dev/admin uniquement) ────────────────────────────────────────────

  /**
   * Ajoute un modifier debug en mémoire pour un personnage.
   * Visible immédiatement dans le prochain snapshot/trace.
   * Admin uniquement — exposé via POST /player-runtime/debug/modifiers.
   */
  addDebugModifier(characterId: string, input: DebugModifierInput): RuntimeModifier {
    return this.debugRegistry.addModifier(characterId, input);
  }

  /**
   * Supprime tous les modifiers debug d'un personnage.
   * Admin uniquement — exposé via DELETE /player-runtime/debug/modifiers/:characterId.
   */
  clearDebugModifiers(characterId: string): void {
    this.debugRegistry.clearModifiers(characterId);
  }

  /**
   * Liste les modifiers debug actifs pour un personnage.
   * Admin uniquement — exposé via GET /player-runtime/debug/modifiers/:characterId.
   */
  listDebugModifiers(characterId: string): RuntimeModifier[] {
    return this.debugRegistry.listModifiers(characterId);
  }

  // ─── Méthodes privées ────────────────────────────────────────────────────────

  private async loadCharacter(characterId: string): Promise<Character | null> {
    return this.characterRepository.findOne({
      where: { id: characterId },
      relations: EQUIPMENT_RELATIONS,
    });
  }

  /**
   * Construit la liste des RuntimeSource pour un personnage.
   *
   * C'est le seul endroit du service qui connaît les sources concrètes.
   * Ajouter une nouvelle source (TalentSource, AuraSource…) ici uniquement.
   * resolveModifiers() reste agnostique.
   */
  private buildSources(character: Character, effects: PlayerRuntimeEffect[]): RuntimeSource[] {
    return [
      new EquipmentSource(character.equipment ?? []),
      new EffectSource(effects),
      new DebugRuntimeSource(this.debugRegistry.getModifiers(character.id)),
    ];
  }

  /**
   * Point d'injection pour les effets runtime actifs du personnage.
   *
   * Phase 5+ : retourne [] — EffectSource existe mais ne produit rien encore.
   * Phase suivante : charger buffs actifs, consommables utilisés, auras de zone, etc.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private resolveEffects(_characterId: string): PlayerRuntimeEffect[] {
    return [];
  }

  /**
   * Agrège les RuntimeModifier[] de toutes les sources.
   *
   * Ne connaît pas Equipment, Effects ni aucune source concrète.
   * Appeler getModifiers() sur chaque source et concaténer.
   */
  private resolveModifiers(sources: RuntimeSource[]): RuntimeModifier[] {
    return sources.flatMap((s) => s.getModifiers());
  }
}
