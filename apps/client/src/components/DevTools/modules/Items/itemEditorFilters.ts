import type {
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
  };
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

  if (nextName !== item.name) patch.name = nextName;
  if (nextType !== item.type) patch.type = nextType;
  if (nextCategory !== item.category) patch.category = nextCategory;
  if (nextImage !== (item.image ?? "")) patch.image = nextImage;

  return patch;
}

export function isValidItemDraft(draft: ItemEditorDraft): boolean {
  return Boolean(
    draft.name.trim() && draft.type.trim() && draft.category.trim(),
  );
}
