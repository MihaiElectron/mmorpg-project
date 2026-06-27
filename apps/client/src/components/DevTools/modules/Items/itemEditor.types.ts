export interface ItemCatalogEntry {
  id: string;
  name: string;
  type: string;
  category: string;
  image: string | null;
}

export interface ItemEditorDraft {
  name: string;
  type: string;
  category: string;
  image: string;
}

export type ItemEditorPatch = Partial<ItemEditorDraft>;

export type ItemCreateInput = ItemEditorDraft;

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
