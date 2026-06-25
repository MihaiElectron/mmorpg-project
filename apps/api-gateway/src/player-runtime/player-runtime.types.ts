// apps/api-gateway/src/player-runtime/player-runtime.types.ts

/**
 * Stats directement issues de Character (avant tout calcul dérivé).
 * Source unique : la DB. Jamais inventées ni extrapolées côté runtime.
 */
export interface BaseStats {
  level: number;
  health: number;
  maxHealth: number;
  attack: number;
  defense: number;
  experience: number;
}

/**
 * Clés des stats qui peuvent être ciblées par un RuntimeModifier.
 * Toute nouvelle stat dérivée doit être ajoutée ici pour devenir modifiable.
 */
export type StatKey =
  | 'maxHp'
  | 'attackPower'
  | 'defenseTotal'
  | 'speed'
  | 'gatheringRange'
  | 'attackRange';

/**
 * Opération appliquée par un modifier :
 * - flat          : addition directe (ex. +20 HP)
 * - percent_add   : bonus additif en % (ex. +10% — tous les percent_add sont
 *                   sommés avant d'être appliqués une seule fois)
 * - percent_multiply : multiplicateur indépendant (ex. ×1.15 — chaque
 *                   percent_multiply est appliqué séquentiellement)
 *
 * Ordre d'application : flat → percent_add → percent_multiply
 */
export type ModifierOperation = 'flat' | 'percent_add' | 'percent_multiply';

/**
 * Origine d'un RuntimeModifier.
 * Le calculator ne connaît aucune de ces sources en détail —
 * il reçoit une liste de modifiers opaques et les applique.
 */
export type ModifierSourceType =
  | 'equipment'
  | 'buff'
  | 'debuff'
  | 'talent'
  | 'passive_skill'
  | 'aura'
  | 'mount'
  | 'consumable'
  | 'event'
  | 'base';

/**
 * Modifier générique et data-driven.
 *
 * Règles de conception :
 * - Aucun code ne doit connaître "Sword", "Helmet", "Rage Buff", etc.
 *   La source est identifiée par sourceType + sourceId + sourceLabel.
 * - Un modifier désactivé (enabled: false) est ignoré silencieusement.
 * - priority : ordre d'application à l'intérieur d'une même opération
 *   (plus petit = appliqué en premier).
 * - reason : documentation libre, sans impact sur le calcul.
 */
export interface RuntimeModifier {
  id: string;
  sourceType: ModifierSourceType;
  sourceId: string;
  sourceLabel: string;
  targetStat: StatKey;
  operation: ModifierOperation;
  value: number;
  priority: number;
  enabled: boolean;
  reason?: string;
}

/**
 * Stats calculées depuis BaseStats + RuntimeModifier[].
 *
 * Phase actuelle (Phase 2) :
 *   - Les modifiers sont toujours vides — le calcul produit les mêmes résultats qu'en Phase 1.
 *   - speed / gatheringRange / attackRange documentés, pas encore de valeur dans Character.
 *
 * Prochaine étape : les futurs systèmes (Equipment, Buffs, Talents…)
 * passent leur liste de RuntimeModifier à PlayerRuntimeCalculator.calculateDerivedStats().
 */
export interface DerivedStats {
  maxHp: number;
  attackPower: number;
  defenseTotal: number;
  speed: number;
  gatheringRange: number;
  attackRange: number;
}

/**
 * Application d'un modifier dans le cadre d'un calcul tracé.
 * Permet au Studio d'afficher la contribution exacte de chaque modifier.
 */
export interface ModifierApplication {
  modifierId: string;
  sourceType: ModifierSourceType;
  sourceId: string;
  sourceLabel: string;
  operation: ModifierOperation;
  value: number;
  contribution: number;
}

/**
 * Trace d'une stat : valeur de base, liste des modifiers appliqués, valeur finale.
 */
export interface StatTrace {
  stat: StatKey;
  baseValue: number;
  modifiers: ModifierApplication[];
  finalValue: number;
}

/**
 * Trace complète du calcul DerivedStats.
 *
 * Contrat Studio SDK :
 *   Pour chaque stat, le Studio peut afficher :
 *     - son origine (baseValue)
 *     - chaque modifier (sourceLabel, operation, value, contribution)
 *     - sa valeur finale
 *   Sans jamais recalculer quoi que ce soit côté Studio.
 */
export interface RuntimeTrace {
  stats: Partial<Record<StatKey, StatTrace>>;
  modifierCount: number;
  computedAt: Date;
}

/**
 * Représentation vivante d'un personnage connecté.
 *
 * Règles :
 * - Ne jamais écrire en DB depuis cette structure.
 * - Ne remplace pas Character (source de vérité DB).
 * - Position issue de ConnectedPlayer si en ligne, sinon dernière valeur DB.
 */
export interface PlayerRuntime {
  characterId: string;
  name: string;
  worldX: number;
  worldY: number;
  mapId: number;
  baseStats: BaseStats;
  derivedStats: DerivedStats;
  isConnected: boolean;
  socketId: string | null;
}

export interface RuntimeStatsResult {
  base: BaseStats;
  derived: DerivedStats;
}
