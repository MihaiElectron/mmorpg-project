import type { ItemCatalogEntry } from "../Items/itemEditor.types";

export type LootSourceKind = "resource" | "creature";

export interface LootPoolEntry {
  itemId: string;
  minQty: number;
  maxQty: number;
  probability: number;
}

export interface LootPoolSource {
  id: string;
  kind: LootSourceKind;
  key: string;
  name: string;
  lootPool: LootPoolEntry[];
}

export interface LootPoolValidationResult {
  valid: boolean;
  errorsByIndex: Record<number, string[]>;
  globalErrors: string[];
}

export interface ResourceTemplateDto {
  id?: string;
  type: string;
  lootPool?: unknown;
}

export interface CreatureTemplateDto {
  id?: string;
  key: string;
  name: string;
  lootPool?: unknown;
}

export interface LootPoolData {
  items: ItemCatalogEntry[];
  sources: LootPoolSource[];
}
