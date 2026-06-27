export interface ItemSummary {
  id: string;
  name: string;
  type: string;
  category: string;
  image: string | null;
}

export interface InventoryEntryDto {
  id: string;
  quantity: number;
  equipped: boolean;
  item: ItemSummary;
}
