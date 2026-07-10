import type {
  ItemCreateInput,
  ItemCatalogEntry,
  ItemEditorDraft,
  ItemEditorPatch,
} from "./itemEditor.types";
import {
  statBonusesDraftFromItem,
  cleanStatBonuses,
  cleanRequiredMasteries,
  normalizeRequiredLevel,
  normalizeRequiredClass,
  recordsEqual,
} from "./equipmentItemEditor.helpers";

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
    weaponType: item.weaponType ?? "",
    statBonuses: statBonusesDraftFromItem(item.statBonuses),
    requiredLevel: String(item.requiredLevel ?? 1),
    requiredClass: item.requiredClass ?? "",
    requiredMasteries: item.requiredMasteries ?? {},
  };
}

/** Coerce une valeur de draft en string sûre (undefined/null/non-string → ""). */
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseNum(s: string): number | null {
  const str = asString(s);
  const n = parseFloat(str);
  return str.trim() === "" || isNaN(n) ? null : n;
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
  const nextWeaponType = draft.weaponType.trim() || null;

  if (nextSlot !== (item.slot ?? null)) patch.slot = nextSlot;
  if (nextAttack !== (item.attack ?? null)) patch.attack = nextAttack;
  if (nextDefense !== (item.defense ?? null)) patch.defense = nextDefense;
  if (nextRange !== (item.range ?? null)) patch.range = nextRange;
  if (nextWeaponType !== (item.weaponType ?? null)) patch.weaponType = nextWeaponType;

  // ── Équipement V1-C-B : bonus / prérequis (JSONB comparés en stable) ────────
  const nextStatBonuses = cleanStatBonuses(draft.statBonuses);
  if (!recordsEqual(nextStatBonuses, item.statBonuses)) patch.statBonuses = nextStatBonuses;

  const nextRequiredLevel = normalizeRequiredLevel(draft.requiredLevel);
  if (nextRequiredLevel !== (item.requiredLevel ?? 1)) patch.requiredLevel = nextRequiredLevel;

  const nextRequiredClass = normalizeRequiredClass(draft.requiredClass);
  if (nextRequiredClass !== (item.requiredClass ?? null)) patch.requiredClass = nextRequiredClass;

  const nextRequiredMasteries = cleanRequiredMasteries(draft.requiredMasteries);
  if (!recordsEqual(nextRequiredMasteries, item.requiredMasteries)) {
    patch.requiredMasteries = nextRequiredMasteries;
  }

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

  if (asString(draft.image).trim()) input.image = asString(draft.image).trim();
  if (draft.objectMode) input.objectMode = draft.objectMode;
  const slot = asString(draft.slot).trim();
  if (slot) input.slot = slot;
  const attack = parseNum(draft.attack);
  if (attack != null) input.attack = attack;
  const defense = parseNum(draft.defense);
  if (defense != null) input.defense = defense;
  const range = parseNum(draft.range);
  if (range != null) input.range = range;
  const weaponType = asString(draft.weaponType).trim() || null;
  if (weaponType) input.weaponType = weaponType;

  // Équipement V1-C-B : n'envoie que ce qui diffère du défaut entity.
  // Bonus/masteries seulement si non vides ; requiredLevel seulement si > 1
  // (défaut serveur = 1) ; requiredClass seulement si renseignée.
  const statBonuses = cleanStatBonuses(draft.statBonuses);
  if (Object.keys(statBonuses).length > 0) input.statBonuses = statBonuses;
  const requiredLevel = normalizeRequiredLevel(draft.requiredLevel);
  if (requiredLevel > 1) input.requiredLevel = requiredLevel;
  const requiredClass = normalizeRequiredClass(draft.requiredClass);
  if (requiredClass) input.requiredClass = requiredClass;
  const requiredMasteries = cleanRequiredMasteries(draft.requiredMasteries);
  if (Object.keys(requiredMasteries).length > 0) input.requiredMasteries = requiredMasteries;

  return input;
}

// ── Portée d'arme : conversion & validation (Progression / Combat V1) ─────────
// item.range est un rayon legacy en pixels. legacyRadiusToWU(px) = px × 16.
export const PX_TO_WU = 16;
export const TILE_SIZE_WU = 1024;
// Portée mêlée recommandée : 80 px = 1280 WU = 1,25 tuile (couvre la tuile adjacente).
export const MELEE_MIN_RECOMMENDED_PX = 80;
const MELEE_SLOTS = ["right-hand", "left-hand"];

export function rangePxToWU(px: number): number {
  return px * PX_TO_WU;
}

export function rangeWUToTiles(wu: number): number {
  return wu / TILE_SIZE_WU;
}

/** Décrit une portée px en WU + tuiles pour l'aide DevTools. null si champ vide. */
export function describeRange(
  rangeStr: string,
): { px: number; wu: number; tiles: number } | null {
  const px = parseNum(rangeStr);
  if (px == null) return null;
  const wu = rangePxToWU(px);
  return { px, wu, tiles: rangeWUToTiles(wu) };
}

/** Une arme de mêlée = type "weapon" équipée en main gauche/droite. */
export function isMeleeWeaponDraft(draft: ItemEditorDraft): boolean {
  return draft.type.trim() === "weapon" && MELEE_SLOTS.includes(draft.slot.trim());
}

/**
 * Blocage dur : range renseignée mais invalide (non entière ou < 1).
 * Champ vide = valide (utilise le défaut serveur). Aligné DTO @IsInt @Min(1).
 */
export function isRangeInvalid(rangeStr: string): boolean {
  const px = parseNum(rangeStr);
  if (px == null) return false;
  return !Number.isInteger(px) || px < 1;
}

/**
 * Avertissement NON bloquant : arme de mêlée avec une portée valide mais
 * inférieure au minimum recommandé (80 px). null si rien à signaler.
 */
export function meleeRangeWarning(draft: ItemEditorDraft): string | null {
  if (!isMeleeWeaponDraft(draft)) return null;
  const px = parseNum(draft.range);
  if (px == null || px < 1) return null; // vide/invalide géré ailleurs
  if (px >= MELEE_MIN_RECOMMENDED_PX) return null;
  return "Portée inférieure à 1,25 tuile : cette arme peut refuser des attaques adjacentes selon la position.";
}
