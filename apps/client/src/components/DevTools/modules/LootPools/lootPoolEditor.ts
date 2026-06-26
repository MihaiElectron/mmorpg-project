import type { ItemCatalogEntry } from "../Items/itemEditor.types";
import type {
  CreatureTemplateDto,
  LootPoolEntry,
  LootPoolSource,
  LootPoolValidationResult,
  ResourceTemplateDto,
} from "./lootPool.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function normalizeLootPool(value: unknown): LootPoolEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((entry) => ({
    itemId: typeof entry.itemId === "string" ? entry.itemId : "",
    minQty: readNumber(entry.minQty, 1),
    maxQty: readNumber(entry.maxQty, 1),
    probability: readNumber(entry.probability, 1),
  }));
}

export function buildLootPoolSources(
  resources: ResourceTemplateDto[],
  creatures: CreatureTemplateDto[],
): LootPoolSource[] {
  const resourceSources = resources.map((template) => ({
    id: `resource:${template.type}`,
    kind: "resource" as const,
    key: template.type,
    name: template.type,
    lootPool: normalizeLootPool(template.lootPool),
  }));

  const creatureSources = creatures.map((template) => ({
    id: `creature:${template.key}`,
    kind: "creature" as const,
    key: template.key,
    name: template.name,
    lootPool: normalizeLootPool(template.lootPool),
  }));

  return [...resourceSources, ...creatureSources].sort((a, b) =>
    `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`),
  );
}

export function itemRefs(items: ItemCatalogEntry[]): Set<string> {
  return new Set(items.flatMap((item) => [item.id, item.category]));
}

export function findItemByLootRef(
  items: ItemCatalogEntry[],
  itemId: string,
): ItemCatalogEntry | null {
  return items.find((item) => item.id === itemId || item.category === itemId) ?? null;
}

export function validateLootPool(
  entries: LootPoolEntry[],
  items: ItemCatalogEntry[],
): LootPoolValidationResult {
  const refs = itemRefs(items);
  const errorsByIndex: Record<number, string[]> = {};

  entries.forEach((entry, index) => {
    const errors: string[] = [];
    const itemId = entry.itemId.trim();
    if (!itemId) {
      errors.push("Item requis");
    } else if (!refs.has(itemId)) {
      errors.push("Item inconnu");
    }
    if (!Number.isInteger(entry.minQty) || entry.minQty < 1) {
      errors.push("Min >= 1");
    }
    if (!Number.isInteger(entry.maxQty) || entry.maxQty < entry.minQty) {
      errors.push("Max >= min");
    }
    if (!Number.isFinite(entry.probability) || entry.probability <= 0 || entry.probability > 1) {
      errors.push("Proba > 0 et <= 1");
    }
    if (errors.length > 0) errorsByIndex[index] = errors;
  });

  return {
    valid: Object.keys(errorsByIndex).length === 0,
    errorsByIndex,
    globalErrors: [],
  };
}

export function buildLootPoolPatch(entries: LootPoolEntry[]): LootPoolEntry[] {
  return entries.map((entry) => ({
    itemId: entry.itemId.trim(),
    minQty: entry.minQty,
    maxQty: entry.maxQty,
    probability: entry.probability,
  }));
}

export function filterItemsForLootPool(
  items: ItemCatalogEntry[],
  query: string,
): ItemCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    [item.name, item.type, item.category, item.id]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(q)),
  );
}
