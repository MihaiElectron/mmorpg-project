// apps/api-gateway/src/player-runtime/runtime-source.ts

import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { equipmentToModifiers } from './equipment-modifier.mapper';
import { effectToModifiers } from './effect-modifier.mapper';
import {
  BaseStats,
  DerivedStats,
  PlayerRuntimeEffect,
  RuntimeModifier,
  RuntimeTrace,
} from './player-runtime.types';
import type { EntityRuntimeSnapshot } from './entity-runtime.types';

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
  | 'zone'
  | 'debug';

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

/**
 * Source debug : injecte des RuntimeModifier[] arbitraires en mémoire.
 *
 * Règles :
 * - Dev/admin uniquement — jamais activée en production hors outillage explicite.
 * - Désactivée par défaut : DebugModifierRegistry retourne [] si aucun modifier ajouté.
 * - Aucune persistance — les modifiers sont perdus au redémarrage.
 * - Aucun gameplay réel — sourceType = 'debug', clairement identifiable dans la trace.
 * - Visible dans snapshot.sources[kind='debug'] et RuntimeTrace.
 */
export class DebugRuntimeSource implements RuntimeSource {
  readonly kind: RuntimeSourceKind = 'debug';

  constructor(private readonly modifiers: RuntimeModifier[]) {}

  getModifiers(): RuntimeModifier[] {
    return this.modifiers;
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

/**
 * Snapshot complet du Player Runtime — implémentation de EntityRuntimeSnapshot.
 *
 * Contient en un seul objet :
 *   - identité (entityId, entityKind='player', characterId alias, name)
 *   - baseStats  : stats brutes issues de la DB
 *   - derivedStats : stats calculées après application de tous les modifiers
 *   - sources    : par pipeline (EquipmentSource, EffectSource…) avec ses modifiers
 *   - modifiers  : liste plate de tous les modifiers actifs (union de toutes les sources)
 *   - trace      : audit complet par stat (baseValue, chaque contribution, finalValue)
 *   - computedAt : horodatage du calcul
 *
 * Règles Studio SDK :
 *   - Lecture seule — le Studio observe, ne recalcule jamais.
 *   - `modifiers` et `sources[].modifiers` sont cohérents (même données, vues différentes).
 *   - La trace suffit pour afficher l'impact de chaque modifier sur chaque stat.
 *   - entityId === characterId — les deux sont exposés pour compatibilité
 *     avec EntityRuntimeSnapshot (entityId) et les APIs player-specific (characterId).
 */
export interface PlayerRuntimeSnapshot extends EntityRuntimeSnapshot<BaseStats, DerivedStats> {
  readonly entityKind: 'player';
  /** Alias pour entityId — conservé pour les APIs player-specific (debug endpoints…). */
  readonly characterId: string;
  readonly sources: ReadonlyArray<{
    kind: RuntimeSourceKind;
    modifiers: ReadonlyArray<RuntimeModifier>;
  }>;
}
