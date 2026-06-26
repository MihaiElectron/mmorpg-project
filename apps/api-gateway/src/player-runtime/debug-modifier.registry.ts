// apps/api-gateway/src/player-runtime/debug-modifier.registry.ts

import { Injectable } from '@nestjs/common';
import { ModifierOperation, RuntimeModifier, StatKey } from './player-runtime.types';

/**
 * Données nécessaires pour créer un modifier debug.
 * id, sourceType, sourceId, priority et enabled sont générés par le registry.
 */
export interface DebugModifierInput {
  targetStat: StatKey;
  operation: ModifierOperation;
  value: number;
  sourceLabel?: string;
  reason?: string;
}

/**
 * Registre en mémoire des RuntimeModifier[] de debug, indexé par entityId.
 *
 * Générique — fonctionne pour tout EntityRuntimeKind (player, creature, npc…).
 * Chaque module NestJS (PlayerRuntimeModule, CreatureRuntimeModule…) instancie
 * son propre registre : les modifiers debug de types différents restent isolés.
 *
 * Règles :
 * - Aucune persistance — les modifiers sont perdus au redémarrage.
 * - Dev/admin uniquement — ne jamais exposer via API publique.
 * - Désactivé par défaut : getModifiers() retourne [] si aucun ajout.
 * - Les IDs sont uniques et séquentiels au sein d'une instance de service.
 */
@Injectable()
export class RuntimeDebugRegistry {
  private readonly store = new Map<string, RuntimeModifier[]>();
  private counter = 0;

  /**
   * Retourne les modifiers debug actifs pour une entité.
   * Retourne [] si aucun modifier n'a été ajouté pour cet entityId.
   */
  getModifiers(entityId: string): RuntimeModifier[] {
    return this.store.get(entityId) ?? [];
  }

  /**
   * Ajoute un modifier debug pour une entité.
   * Retourne le RuntimeModifier créé avec son id généré.
   */
  addModifier(entityId: string, input: DebugModifierInput): RuntimeModifier {
    const modifier: RuntimeModifier = {
      id: `debug:${entityId}:${++this.counter}`,
      sourceType: 'debug',
      sourceId: 'debug-registry',
      sourceLabel: input.sourceLabel ?? 'Debug',
      targetStat: input.targetStat,
      operation: input.operation,
      value: input.value,
      priority: 99,
      enabled: true,
      reason: input.reason,
    };

    const existing = this.store.get(entityId) ?? [];
    this.store.set(entityId, [...existing, modifier]);
    return modifier;
  }

  /**
   * Supprime tous les modifiers debug d'une entité.
   */
  clearModifiers(entityId: string): void {
    this.store.delete(entityId);
  }

  /**
   * Liste les modifiers debug d'une entité (même résultat que getModifiers).
   * Méthode explicite pour le controller de debug.
   */
  listModifiers(entityId: string): RuntimeModifier[] {
    return this.getModifiers(entityId);
  }
}
