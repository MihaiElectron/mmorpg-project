// apps/api-gateway/src/player-runtime/effect-modifier.mapper.ts

import { PlayerRuntimeEffect, RuntimeModifier } from './player-runtime.types';

/**
 * Priorité par défaut des effets runtime.
 * Supérieure à l'équipement (10) pour s'appliquer après les bonus d'item.
 * Les effets avec priority explicite dans EffectModifierDef l'emportent.
 */
const DEFAULT_EFFECT_PRIORITY = 20;

/**
 * Convertit une liste d'effets actifs en RuntimeModifier[].
 *
 * Règles d'exclusion (vérifiées à l'appel, pas en timer) :
 * - effect.enabled === false → ignoré
 * - effect.expiresAt est dans le passé → ignoré
 *
 * startsAt non appliqué en Phase 4 : un effet non démarré reste absent
 * de resolveEffects() par construction.
 *
 * Chaque EffectModifierDef de l'effet produit un RuntimeModifier traçable :
 * - id      : `${effect.id}:${def.targetStat}:${index}`
 * - source  : héritée de l'effet parent (sourceType, sourceId, sourceLabel)
 * - reason  : héritée de l'effet parent
 * - priority : def.priority ?? DEFAULT_EFFECT_PRIORITY
 */
export function effectToModifiers(
  effects: PlayerRuntimeEffect[],
  now: Date = new Date(),
): RuntimeModifier[] {
  const modifiers: RuntimeModifier[] = [];

  for (const effect of effects) {
    if (!effect.enabled) continue;
    if (effect.expiresAt != null && effect.expiresAt <= now) continue;

    effect.modifiers.forEach((def, i) => {
      modifiers.push({
        id: `${effect.id}:${def.targetStat}:${i}`,
        sourceType: effect.sourceType,
        sourceId: effect.sourceId,
        sourceLabel: effect.sourceLabel,
        targetStat: def.targetStat,
        operation: def.operation,
        value: def.value,
        priority: def.priority ?? DEFAULT_EFFECT_PRIORITY,
        enabled: true,
        reason: effect.reason,
      });
    });
  }

  return modifiers;
}
