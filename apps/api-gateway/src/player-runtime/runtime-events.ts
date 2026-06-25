// apps/api-gateway/src/player-runtime/runtime-events.ts

import {
  DerivedStats,
  PlayerRuntime,
  RuntimeModifier,
  RuntimeTrace,
} from './player-runtime.types';
import { RuntimeSourceSnapshot } from './runtime-source';
import type { EntityRuntimeEventBase } from './entity-runtime.types';

/**
 * Base des événements Runtime Player.
 *
 * Étend EntityRuntimeEventBase (générique) avec entityKind='player'
 * et conserve characterId pour compatibilité avec les APIs player-specific.
 *
 * Règles Studio SDK :
 * - Aucun listener, aucun bus. Ces types décrivent des faits observables.
 * - Le Studio lit les événements sans les émettre ni les modifier.
 * - computedAt permet de corréler un événement à la trace qui l'accompagne.
 */
interface RuntimeEventBase extends EntityRuntimeEventBase {
  readonly entityKind: 'player';
  /** Alias pour entityId — conservé pour les APIs player-specific. */
  readonly characterId: string;
  readonly computedAt: Date;
}

/**
 * Émis quand un PlayerRuntime est construit pour la première fois.
 * Contient le snapshot complet (sources + trace).
 */
export interface RuntimeCreatedEvent extends RuntimeEventBase {
  readonly type: 'runtime_created';
  readonly runtime: PlayerRuntime;
  readonly snapshot: RuntimeSourceSnapshot;
}

/**
 * Émis quand DerivedStats change (équipement modifié, effet ajouté/expiré…).
 * Permet au Studio de détecter une différence sans relire toute la trace.
 */
export interface RuntimeUpdatedEvent extends RuntimeEventBase {
  readonly type: 'runtime_updated';
  readonly previous: DerivedStats;
  readonly current: DerivedStats;
  readonly trace: RuntimeTrace;
}

/**
 * Émis quand un RuntimeModifier devient actif.
 * sourceType/sourceLabel identifient la mécanique à l'origine du modifier.
 */
export interface ModifierAddedEvent extends RuntimeEventBase {
  readonly type: 'modifier_added';
  readonly modifier: RuntimeModifier;
  readonly trace: RuntimeTrace;
}

/**
 * Émis quand un RuntimeModifier est retiré (expiration, déséquipement, fin de buff…).
 */
export interface ModifierRemovedEvent extends RuntimeEventBase {
  readonly type: 'modifier_removed';
  readonly modifierId: string;
  readonly sourceLabel: string;
  readonly trace: RuntimeTrace;
}

/**
 * Émis quand DerivedStats est recalculé (recalculateRuntime, changement de source).
 * Toujours accompagné de la trace complète pour le Studio.
 */
export interface DerivedStatsUpdatedEvent extends RuntimeEventBase {
  readonly type: 'derived_stats_updated';
  readonly previous: DerivedStats;
  readonly current: DerivedStats;
  readonly trace: RuntimeTrace;
}

/**
 * Union discriminée de tous les événements Runtime.
 *
 * Usage Studio SDK :
 *   switch (event.type) {
 *     case 'modifier_added':   afficher sourceLabel + contribution depuis trace
 *     case 'runtime_updated':  diff previous/current DerivedStats
 *     …
 *   }
 *
 * Aucun bus d'événements dans ce fichier — uniquement les contrats de type.
 */
export type RuntimeEvent =
  | RuntimeCreatedEvent
  | RuntimeUpdatedEvent
  | ModifierAddedEvent
  | ModifierRemovedEvent
  | DerivedStatsUpdatedEvent;
