// apps/api-gateway/src/creature-runtime/creature-runtime.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Creature } from '../creatures/entities/creature.entity';
import { RuntimeDebugRegistry } from '../player-runtime/debug-modifier.registry';
import { DebugRuntimeSource, RuntimeSource } from '../player-runtime/runtime-source';
import { RuntimeModifier } from '../player-runtime/player-runtime.types';
import { DebugModifierInput } from '../player-runtime/debug-modifier.registry';
import { EntityRuntimeService } from '../player-runtime/entity-runtime.types';
import { CreatureRuntimeCalculator } from './creature-runtime.calculator';
import { CreatureRuntimeSnapshot } from './creature-runtime.types';

const CREATURE_RELATIONS = ['spawn', 'spawn.template'] as const;

/**
 * Creature Runtime Service — première implémentation secondaire d'EntityRuntimeService.
 *
 * Produit un CreatureRuntimeSnapshot à partir de la Creature + CreatureTemplate en DB.
 *
 * Sources Phase 1 :
 *   - DebugRuntimeSource : modifiers debug injectés en mémoire (admin/dev uniquement).
 *   Il n'existe pas de source d'équipement ou d'effet pour les créatures en Phase 1.
 *
 * Règles :
 *   - Aucune modification de l'IA, du combat, du spawn ou du respawn.
 *   - Aucune écriture en DB.
 *   - getModifiers() sur chaque source ne fait aucune I/O.
 */
@Injectable()
export class CreatureRuntimeService implements EntityRuntimeService<CreatureRuntimeSnapshot> {
  constructor(
    @InjectRepository(Creature)
    private readonly creatureRepository: Repository<Creature>,
    private readonly debugRegistry: RuntimeDebugRegistry,
  ) {}

  /**
   * Retourne le snapshot complet du Creature Runtime pour un entityId (creature.id).
   *
   * Retourne null si la créature est introuvable ou si son spawn / template
   * est absent.
   */
  async getRuntimeSnapshot(entityId: string): Promise<CreatureRuntimeSnapshot | null> {
    const creature = await this.creatureRepository.findOne({
      where: { id: entityId },
      relations: CREATURE_RELATIONS as unknown as string[],
    });

    if (!creature || !creature.spawn?.template) return null;

    const template = creature.spawn.template;
    const base = CreatureRuntimeCalculator.calculateBaseStats(creature, template);

    const sources = this.buildSources(entityId);
    const sourceData = sources.map((s) => ({
      kind: s.kind,
      modifiers: s.getModifiers(),
    }));
    const modifiers: RuntimeModifier[] = sourceData.flatMap((s) => s.modifiers);
    const { derived, trace } = CreatureRuntimeCalculator.calculateWithTrace(base, modifiers);

    return {
      entityId: creature.id,
      entityKind: 'creature',
      name: template.name,
      mapId: creature.mapId ?? undefined,
      worldX: creature.worldX ?? undefined,
      worldY: creature.worldY ?? undefined,
      baseStats: base,
      derivedStats: derived,
      sources: sourceData,
      modifiers,
      trace,
      computedAt: trace.computedAt,
      creatureState: creature.state,
      templateKey: template.key,
    };
  }

  // ─── Debug (admin / Studio SDK uniquement) ───────────────────────────────────

  addDebugModifier(creatureId: string, input: DebugModifierInput): RuntimeModifier {
    return this.debugRegistry.addModifier(creatureId, input);
  }

  clearDebugModifiers(creatureId: string): void {
    this.debugRegistry.clearModifiers(creatureId);
  }

  listDebugModifiers(creatureId: string): RuntimeModifier[] {
    return this.debugRegistry.listModifiers(creatureId);
  }

  // ─── Méthodes privées ────────────────────────────────────────────────────────

  /**
   * Construit les RuntimeSource[] pour une créature.
   *
   * Phase 1 : uniquement DebugRuntimeSource.
   * Phase suivante : ZoneAuraSource, PassiveTemplateSource, etc.
   * Ajouter les nouvelles sources ici uniquement — resolveModifiers() reste agnostique.
   */
  private buildSources(entityId: string): RuntimeSource[] {
    return [
      new DebugRuntimeSource(this.debugRegistry.getModifiers(entityId)),
    ];
  }
}
