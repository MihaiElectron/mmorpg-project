// apps/api-gateway/src/player-runtime/entity-runtime.types.ts
//
// Contrats communs à tous les Entity Runtime du projet.
//
// Un "Entity Runtime" est la représentation calculée en mémoire d'une entité
// du monde (joueur, créature, NPC, ressource, bâtiment).
// Il capture à un instant T : identité, stats de base, stats dérivées,
// sources de modifiers et trace du calcul — sans jamais modifier la DB.
//
// Ce fichier ne contient que des interfaces et types.
// Aucune classe, aucune logique, aucune dépendance injectable.

import type { RuntimeModifier, RuntimeTrace } from './player-runtime.types';

// ─── Kinds ───────────────────────────────────────────────────────────────────

/**
 * Types d'entités supportant un Entity Runtime.
 *
 * Chaque kind correspond à un domaine distinct avec ses propres
 * spécificités (IA, inventaire, loot, ownerships…).
 */
export type EntityRuntimeKind =
  | 'player'    // Personnage joueur — équipement, skills, compte
  | 'creature'  // Créature IA — aggro, leash, respawn
  | 'npc'       // PNJ — dialogues, quêtes, marchand
  | 'resource'  // Ressource de récolte — loot, durabilité, régénération
  | 'building'; // Bâtiment — owner, production, stockage

/** Tableau des kinds connus — utile pour validation et itération. */
export const ENTITY_RUNTIME_KINDS: EntityRuntimeKind[] = [
  'player',
  'creature',
  'npc',
  'resource',
  'building',
];

// ─── Identité ─────────────────────────────────────────────────────────────────

/**
 * Identité commune à toute entité runtime.
 *
 * Règles :
 * - entityId est l'UUID de l'entité en DB (character.id, creature.id…).
 * - La position est optionnelle : certains contextes (test, headless) ne
 *   l'exposent pas. Les entités statiques (ressource, bâtiment) peuvent
 *   exposer une position fixe.
 */
export interface EntityRuntimeIdentity {
  readonly entityId: string;
  readonly entityKind: EntityRuntimeKind;
  readonly name: string;
  readonly mapId?: number;
  readonly worldX?: number;
  readonly worldY?: number;
}

// ─── Snapshot générique ───────────────────────────────────────────────────────

/**
 * Snapshot générique d'un Entity Runtime — surface principale du Studio SDK.
 *
 * Paramètres :
 *   TBase    = forme des stats de base (BaseStats pour joueur, CreatureBaseStats
 *              pour créature, etc.)
 *   TDerived = forme des stats dérivées (DerivedStats ou équivalent)
 *
 * Par défaut, les deux sont `object` pour permettre l'usage générique sans
 * connaître le type d'entité.
 *
 * Règles Studio SDK :
 * - Lecture seule — le Studio observe, ne recalcule jamais.
 * - `modifiers` et `sources[].modifiers` partagent exactement les mêmes données.
 * - La trace suffit pour afficher l'impact de chaque modifier sur chaque stat.
 * - `computedAt` est identique à `trace.computedAt`.
 *
 * Compatibilité :
 *   PlayerRuntimeSnapshot implements EntityRuntimeSnapshot<BaseStats, DerivedStats>
 *   (voir runtime-source.ts — entityId + entityKind ajoutés en Phase 11)
 */
export interface EntityRuntimeSnapshot<
  TBase extends object = object,
  TDerived extends object = object,
> extends EntityRuntimeIdentity {
  readonly baseStats: TBase;
  readonly derivedStats: TDerived;
  /**
   * Sources par pipeline — chaque source produit une liste de modifiers.
   * kind = type de pipeline (equipment, effect, debug, talent…)
   * Le type `string` ici évite la dépendance circulaire avec runtime-source.ts.
   * Les implémentations concrètes utilisent RuntimeSourceKind.
   */
  readonly sources: ReadonlyArray<{
    kind: string;
    modifiers: ReadonlyArray<RuntimeModifier>;
  }>;
  /** Liste plate de tous les modifiers actifs (union de toutes les sources). */
  readonly modifiers: ReadonlyArray<RuntimeModifier>;
  /** Trace complète du calcul : origine de chaque stat et contribution de chaque modifier. */
  readonly trace: RuntimeTrace;
  readonly computedAt: Date;
}

// ─── Contrat de service ───────────────────────────────────────────────────────

/**
 * Contrat minimum que tout service Entity Runtime doit respecter.
 *
 * Usage :
 *   PlayerRuntimeService implements EntityRuntimeService<PlayerRuntimeSnapshot>
 *   CreatureRuntimeService implements EntityRuntimeService<CreatureRuntimeSnapshot>
 *
 * getRuntimeSnapshot() est l'unique méthode obligatoire — elle produit
 * le snapshot complet observable par le Studio.
 */
export interface EntityRuntimeService<
  TSnapshot extends EntityRuntimeSnapshot = EntityRuntimeSnapshot,
> {
  getRuntimeSnapshot(entityId: string): Promise<TSnapshot | null>;
}

// ─── Événements génériques ────────────────────────────────────────────────────

/**
 * Base commune à tous les événements Entity Runtime.
 *
 * Différence avec RuntimeEventBase (player-runtime) :
 * - RuntimeEventBase est player-specific (characterId).
 * - EntityRuntimeEventBase est générique (entityId + entityKind).
 *
 * Règles Studio SDK :
 * - Aucun bus d'événements dans ce fichier — uniquement les contrats de type.
 * - Le Studio lit les événements sans les émettre ni les modifier.
 */
export interface EntityRuntimeEventBase {
  readonly entityId: string;
  readonly entityKind: EntityRuntimeKind;
  readonly computedAt: Date;
}

/**
 * Union des types d'événements génériques.
 *
 * Le préfixe 'entity_' distingue les événements génériques des événements
 * player-specific ('runtime_created', 'modifier_added', etc. dans runtime-events.ts).
 */
export type EntityRuntimeEventType =
  | 'entity_runtime_created'
  | 'entity_runtime_updated'
  | 'entity_modifier_added'
  | 'entity_modifier_removed'
  | 'entity_derived_stats_updated';

// ─── Spécificités par type d'entité (documentation) ──────────────────────────

/**
 * Champs spécifiques à chaque entity kind — hors contrat commun.
 *
 * Player  (kind='player')  : equipment, inventory, skills, account, isConnected, socketId
 * Creature (kind='creature'): aiState, aggroRadius, leashPoint, respawnTimer
 * Npc      (kind='npc')    : dialogues, quêtes, marchandises
 * Resource (kind='resource'): remainingLoots, lootPool, respawnAt, durability
 * Building (kind='building'): owner, production, storage
 *
 * Ces champs sont portés par les snapshots concrets :
 *   PlayerRuntimeSnapshot extends EntityRuntimeSnapshot<BaseStats, DerivedStats>
 *
 * La liste ci-dessus sert de référence pour les prochaines implémentations.
 * Ne pas ajouter ces champs dans EntityRuntimeSnapshot.
 */
export type EntityRuntimeSpecificFields = never; // documentation marker uniquement
