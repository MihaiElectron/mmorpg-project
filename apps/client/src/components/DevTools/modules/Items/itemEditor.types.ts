export const EQUIPMENT_SLOTS = [
  "right-hand",
  "left-hand",
  "ranged-weapon",
  "headgear",
  "chest-armor",
  "leg-armor",
  "gloves",
  "boots",
  "necklace",
  "left-earring",
  "right-earring",
  "left-bracelet",
  "right-bracelet",
  "left-ring",
  "right-ring",
  "bag",
] as const;

export const OBJECT_MODES = ["STACKABLE", "INSTANCE"] as const;

export const ITEM_TYPES = [
  "material",
  "weapon",
  "armor",
  "accessory",
  "tool",
  "consumable",
  "misc",
] as const;

export const ITEM_CATEGORIES_BY_TYPE: Record<string, string[]> = {
  material: ["wooden_stick", "iron_ore", "iron_bar", "basic_handle", "rough_blade"],
  weapon: ["basic_sword", "basic_bow", "basic_staff"],
  armor: ["basic_helmet", "basic_chestplate", "basic_leggings", "basic_boots", "basic_gloves"],
  accessory: ["basic_ring", "basic_necklace", "basic_earring", "basic_bracelet"],
  tool: ["pickaxe", "axe", "fishing_rod"],
  consumable: ["health_potion", "mana_potion"],
  misc: [],
};

export const WEAPON_TYPES = [
  "two_handed_sword",
  "two_handed_axe",
  "bow",
  "crossbow",
] as const;

export interface ItemCatalogEntry {
  id: string;
  name: string;
  type: string;
  category: string;
  image: string | null;
  objectMode: string;
  slot: string | null;
  attack: number | null;
  defense: number | null;
  range: number | null;
  weaponType: string | null;
}

export interface ItemEditorDraft {
  name: string;
  type: string;
  category: string;
  image: string;
  objectMode: string;
  slot: string;
  attack: string;
  defense: string;
  range: string;
  weaponType: string;
}

export type ItemEditorPatch = Partial<{
  name: string;
  type: string;
  category: string;
  image: string;
  objectMode: string;
  slot: string | null;
  attack: number | null;
  defense: number | null;
  range: number | null;
  weaponType: string | null;
}>;

export type ItemCreateInput = Omit<ItemEditorPatch, "slot" | "attack" | "defense" | "range" | "weaponType"> & {
  name: string;
  type: string;
  category: string;
  image?: string;
  objectMode?: string;
  slot?: string;
  attack?: number;
  defense?: number;
  range?: number;
  weaponType?: string | null;
};

export interface ItemUsageRef {
  id: string | number;
  key?: string;
  type?: string;
  name?: string;
}

export interface ItemUsageStats {
  itemId: string;
  totalQuantityServer: number;
  inventoryEntries: number;
  uniqueCharacters: number;
  usedInResourceLootPools: ItemUsageRef[];
  usedInCreatureLootPools: ItemUsageRef[];
  usedInCraftRecipesOutput: ItemUsageRef[];
  usedInCraftRecipesIngredient: ItemUsageRef[];
}
