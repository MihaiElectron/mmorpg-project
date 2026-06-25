// apps/api-gateway/src/player-runtime/runtime-source.ts

import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { equipmentToModifiers } from './equipment-modifier.mapper';
import { effectToModifiers } from './effect-modifier.mapper';
import {
  PlayerRuntimeEffect,
  RuntimeModifier,
  RuntimeTrace,
} from './player-runtime.types';

/**
 * Catégorie de pipeline Runtime.
 *
 * Distinct de ModifierSourceType (type par modifier) :
 *   - RuntimeSourceKind  = quel agrégateur a produit la liste de modifiers
 *   - ModifierSourceType = quelle mécanique de jeu a produit un modifier individuel
 *
 * Exemples futurs de RuntimeSource :
 *   TalentSource, PassiveSkillSource, AuraSource, MountSource, ZoneSource
 */
export type RuntimeSourceKind =
  | 'equipment'
  | 'effect'
  | 'talent'
  | 'passive_skill'
  | 'aura'
  | 'mount'
  | 'zone';

/**
 * Contrat commun de toute source de RuntimeModifier[].
 *
 * Règles :
 * - Aucune I/O — uniquement de la transformation en mémoire.
 * - getModifiers() est appelé à chaque calcul. Ne pas mettre en cache.
 * - Le Studio observe les modifiers produits via RuntimeSourceSnapshot,
 *   pas en appelant getModifiers() directement.
 */
export interface RuntimeSource {
  readonly kind: RuntimeSourceKind;
  getModifiers(): RuntimeModifier[];
}

/**
 * Source equipment : convertit CharacterEquipment[] en RuntimeModifier[].
 * Délègue à equipmentToModifiers() — aucune logique dupliquée.
 */
export class EquipmentSource implements RuntimeSource {
  readonly kind: RuntimeSourceKind = 'equipment';

  constructor(private readonly equipment: CharacterEquipment[]) {}

  getModifiers(): RuntimeModifier[] {
    return equipmentToModifiers(this.equipment);
  }
}

/**
 * Source effets : convertit PlayerRuntimeEffect[] en RuntimeModifier[].
 * Délègue à effectToModifiers() — gère enabled, expiresAt, etc.
 *
 * Phase 5 : resolveEffects() retourne [] — ce source existe mais ne produit rien.
 * Phase suivante : resolveEffects() alimentera cette source avec des effets réels.
 */
export class EffectSource implements RuntimeSource {
  readonly kind: RuntimeSourceKind = 'effect';

  constructor(private readonly effects: PlayerRuntimeEffect[]) {}

  getModifiers(): RuntimeModifier[] {
    return effectToModifiers(this.effects);
  }
}

// ─── Contrats Studio SDK ─────────────────────────────────────────────────────

/**
 * Snapshot d'un calcul Runtime, observable par le Studio sans recalcul.
 *
 * Pour chaque source, le Studio peut afficher :
 *   - kind : quel pipeline a produit ces modifiers
 *   - modifiers : les modifiers actifs avec sourceType/sourceLabel/contribution
 * La trace associe chaque modifier à sa contribution finale.
 */
export interface RuntimeSourceSnapshot {
  characterId: string;
  sources: ReadonlyArray<{
    kind: RuntimeSourceKind;
    modifiers: ReadonlyArray<RuntimeModifier>;
  }>;
  trace: RuntimeTrace;
  computedAt: Date;
}
