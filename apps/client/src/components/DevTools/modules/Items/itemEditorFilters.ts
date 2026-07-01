import type {
  ItemCreateInput,
  ItemCatalogEntry,
  ItemEditorDraft,
  ItemEditorPatch,
} from "./itemEditor.types";

export const ALL_FILTER = "__all__";

export function uniqueSorted(
  values: Array<string | null | undefined>,
): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  ).sort((a, b) => a.localeCompare(b));
}

export function filterItems(
  items: ItemCatalogEntry[],
  query: string,
  typeFilter: string,
  categoryFilter: string,
): ItemCatalogEntry[] {
  const q = query.trim().toLowerCase();

  return items.filter((item) => {
    if (typeFilter !== ALL_FILTER && item.type !== typeFilter) return false;
    if (categoryFilter !== ALL_FILTER && item.category !== categoryFilter)
      return false;
    if (!q) return true;

    return [item.name, item.type, item.category, item.id]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

export function draftFromItem(item: ItemCatalogEntry): ItemEditorDraft {
  return {
    name: item.name,
    type: item.type,
    category: item.category,
    image: item.image ?? "",
    objectMode: item.objectMode ?? "STACKABLE",
    slot: item.slot ?? "",
    attack: item.attack != null ? String(item.attack) : "",
    defense: item.defense != null ? String(item.defense) : "",
    range: item.range != null ? String(item.range) : "",
  };
}

function parseNum(s: string): number | null {
  const n = parseFloat(s);
  return s.trim() === "" || isNaN(n) ? null : n;
}

export function buildItemPatch(
  item: ItemCatalogEntry,
  draft: ItemEditorDraft,
): ItemEditorPatch {
  const patch: ItemEditorPatch = {};

  const nextName = draft.name.trim();
  const nextType = draft.type.trim();
  const nextCategory = draft.category.trim();
  const nextImage = draft.image.trim();
  const nextObjectMode = draft.objectMode;
  const nextSlot = draft.slot.trim() || null;
  const nextAttack = parseNum(draft.attack);
  const nextDefense = parseNum(draft.defense);
  const nextRange = parseNum(draft.range);

  if (nextName !== item.name) patch.name = nextName;
  if (nextType !== item.type) patch.type = nextType;
  if (nextCategory !== item.category) patch.category = nextCategory;
  if (nextImage !== (item.image ?? "")) patch.image = nextImage;
  if (nextObjectMode !== (item.objectMode ?? "STACKABLE")) patch.objectMode = nextObjectMode;
  if (nextSlot !== (item.slot ?? null)) patch.slot = nextSlot;
  if (nextAttack !== (item.attack ?? null)) patch.attack = nextAttack;
  if (nextDefense !== (item.defense ?? null)) patch.defense = nextDefense;
  if (nextRange !== (item.range ?? null)) patch.range = nextRange;

  return patch;
}

export function isValidItemDraft(draft: ItemEditorDraft): boolean {
  return Boolean(
    draft.name.trim() && draft.type.trim() && draft.category.trim(),
  );
}

export function buildItemCreateInput(
  draft: ItemEditorDraft,
): ItemCreateInput {
  const input: ItemCreateInput = {
    name: draft.name.trim(),
    type: draft.type.trim(),
    category: draft.category.trim(),
  };

  if (draft.image.trim()) input.image = draft.image.trim();
  if (draft.objectMode) input.objectMode = draft.objectMode;
  const slot = draft.slot.trim();
  if (slot) input.slot = slot;
  const attack = parseNum(draft.attack);
  if (attack != null) input.attack = attack;
  const defense = parseNum(draft.defense);
  if (defense != null) input.defense = defense;
  const range = parseNum(draft.range);
  if (range != null) input.range = range;

  return input;
}
