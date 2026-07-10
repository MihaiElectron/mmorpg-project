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
  enabled: boolean;
  // ── Équipement V1-C-B (données brutes, éditables ; jamais recalculées) ──────
  statBonuses: Record<string, number>;
  requiredLevel: number;
  requiredClass: string | null;
  requiredMasteries: Record<string, number>;
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
  // statBonuses édités comme champs texte (un par stat primaire) ; requiredMasteries
  // comme Record édité par KeyValueRowsEditor.
  statBonuses: Record<string, string>;
  requiredLevel: string;
  requiredClass: string;
  requiredMasteries: Record<string, number>;
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
  statBonuses: Record<string, number>;
  requiredLevel: number;
  requiredClass: string | null;
  requiredMasteries: Record<string, number>;
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
  statBonuses?: Record<string, number>;
  requiredLevel?: number;
  requiredClass?: string | null;
  requiredMasteries?: Record<string, number>;
};

export interface ItemUsageRef {
  id: string | number;
  key?: string;
  type?: string;
  name?: string;
}

export interface InventoryStackLine {
  id: string;
  characterId: string | null;
  characterName: string | null;
  quantity: number;
  equipped: boolean;
}

export interface ItemInstanceBreakdown {
  instanceType: string;
  state: string;
  containerType: string;
  count: number;
}

export interface ItemInstanceLine {
  id: string;
  instanceType: string;
  state: string;
  containerType: string;
  ownerId: string | null;
  orphanEquipped: boolean;
}

export interface ItemReferenceBreakdown {
  inventoryStacks: number;
  activeItemInstances: number;
  equipped: number;
  worldItems: number;
  auctionListings: number;
  mailAttachments: number;
  lootPoolRefs: number;
  recipeRefs: number;
}

export interface LootPoolReferenceDetail {
  sourceKind: "resource_template" | "creature_template";
  sourceName: string;
  path: string;
  itemRef: string;
}

export interface RecipeReferenceDetail {
  recipeKey: string;
  recipeName: string;
  role: "output" | "ingredient";
  path: string;
  refId: string;
}

export interface ItemMaintenanceReport {
  template: {
    id: string;
    name: string;
    type: string;
    category: string;
    objectMode: string;
    enabled: boolean;
  };
  inventory: {
    stackCount: number;
    stacks: InventoryStackLine[];
  };
  instances: {
    total: number;
    activeTotal: number;
    breakdown: ItemInstanceBreakdown[];
    lines: ItemInstanceLine[];
    linesTruncated: boolean;
  };
  equippedCount: number;
  worldItemsCount: number;
  auctionListingsCount: number;
  attachedMailsCount: number;
  references: ItemReferenceBreakdown;
  referencesDetail: {
    lootPools: LootPoolReferenceDetail[];
    recipes: RecipeReferenceDetail[];
  };
  totalReferences: number;
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
