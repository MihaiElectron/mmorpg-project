export interface ItemSummary {
  id: string;
  name: string;
  type: string;
  category: string;
  image: string | null;
}

export interface InventoryEntryDto {
  id: string;
  /** UUID de l'ItemInstance si entrée INSTANCE, null si entrée STACK. */
  instanceId: string | null;
  quantity: number;
  equipped: boolean;
  item: ItemSummary;
}
