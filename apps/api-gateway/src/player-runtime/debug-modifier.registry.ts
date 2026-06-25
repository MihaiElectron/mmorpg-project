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
 * Registre en mémoire des RuntimeModifier[] de debug, par characterId.
 *
 * Règles :
 * - Aucune persistance — les modifiers sont perdus au redémarrage.
 * - Dev/admin uniquement — ne jamais exposer via API publique.
 * - Désactivé par défaut : getModifiers() retourne [] si aucun ajout.
 * - Les IDs sont uniques et séquentiels au sein d'une instance de service.
 */
@Injectable()
export class DebugModifierRegistry {
  private readonly store = new Map<string, RuntimeModifier[]>();
  private counter = 0;

  /**
   * Retourne les modifiers debug actifs pour un personnage.
   * Retourne [] si aucun modifier n'a été ajouté pour ce characterId.
   */
  getModifiers(characterId: string): RuntimeModifier[] {
    return this.store.get(characterId) ?? [];
  }

  /**
   * Ajoute un modifier debug pour un personnage.
   * Retourne le RuntimeModifier créé avec son id généré.
   */
  addModifier(characterId: string, input: DebugModifierInput): RuntimeModifier {
    const modifier: RuntimeModifier = {
      id: `debug:${characterId}:${++this.counter}`,
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

    const existing = this.store.get(characterId) ?? [];
    this.store.set(characterId, [...existing, modifier]);
    return modifier;
  }

  /**
   * Supprime tous les modifiers debug d'un personnage.
   */
  clearModifiers(characterId: string): void {
    this.store.delete(characterId);
  }

  /**
   * Liste les modifiers debug d'un personnage (même résultat que getModifiers).
   * Méthode explicite pour le controller de debug.
   */
  listModifiers(characterId: string): RuntimeModifier[] {
    return this.getModifiers(characterId);
  }
}
