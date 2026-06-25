// apps/client/src/components/DevTools/modules/PlayerRuntime/player-runtime.types.ts
// Types frontend miroir du backend — aucune logique, aucune dépendance NestJS.

export type StatKey =
  | "maxHp"
  | "attackPower"
  | "defenseTotal"
  | "speed"
  | "gatheringRange"
  | "attackRange";

export type ModifierOperation = "flat" | "percent_add" | "percent_multiply";

export type ModifierSourceType =
  | "equipment"
  | "buff"
  | "debuff"
  | "talent"
  | "passive_skill"
  | "aura"
  | "mount"
  | "consumable"
  | "event"
  | "base"
  | "debug";

export interface BaseStats {
  level: number;
  health: number;
  maxHealth: number;
  attack: number;
  defense: number;
  experience: number;
}

export interface DerivedStats {
  maxHp: number;
  attackPower: number;
  defenseTotal: number;
  speed: number;
  gatheringRange: number;
  attackRange: number;
}

export interface RuntimeModifier {
  id: string;
  sourceType: ModifierSourceType | string;
  sourceLabel: string;
  targetStat: StatKey;
  operation: ModifierOperation;
  value: number;
  priority: number;
  enabled: boolean;
  reason?: string;
}

export interface RuntimeSourceEntry {
  kind: string;
  modifiers: RuntimeModifier[];
}

export interface ModifierApplication {
  modifierId: string;
  sourceType: string;
  sourceLabel: string;
  operation: ModifierOperation;
  value: number;
  contribution: number;
}

export interface StatTrace {
  stat: StatKey;
  baseValue: number;
  modifiers: ModifierApplication[];
  finalValue: number;
}

export interface RuntimeTrace {
  stats: Partial<Record<StatKey, StatTrace>>;
  modifierCount: number;
  computedAt: string;
}

export interface PlayerRuntimeSnapshot {
  /** Identifiant générique — entityId === characterId pour les joueurs. */
  entityId: string;
  entityKind: "player";
  /** Conservé pour les APIs player-specific (debug endpoints, etc.). */
  characterId: string;
  name: string;
  baseStats: BaseStats;
  derivedStats: DerivedStats;
  sources: RuntimeSourceEntry[];
  modifiers: RuntimeModifier[];
  trace: RuntimeTrace;
  computedAt: string;
}

export interface ModifierFormInput {
  targetStat: StatKey;
  operation: ModifierOperation;
  value: number;
  sourceLabel?: string;
  reason?: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

export const STAT_KEYS: StatKey[] = [
  "maxHp",
  "attackPower",
  "defenseTotal",
  "speed",
  "gatheringRange",
  "attackRange",
];

export const STAT_LABELS: Record<StatKey, string> = {
  maxHp: "Max HP",
  attackPower: "Attack Power",
  defenseTotal: "Defense Total",
  speed: "Speed",
  gatheringRange: "Gather Range",
  attackRange: "Attack Range",
};

export const OP_LABELS: Record<ModifierOperation, string> = {
  flat: "flat",
  percent_add: "%+",
  percent_multiply: "×%",
};

export const OP_DISPLAY: Record<ModifierOperation, string> = {
  flat: "Flat",
  percent_add: "% Add",
  percent_multiply: "× Mult",
};
