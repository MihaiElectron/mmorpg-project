export interface ItemSummary {
  id: string;
  name: string;
  type: string;
  category: string;
  image: string | null;
  objectMode: string;
  /** Slot d'équipement cible de l'item (null si non équipable). */
  slot: string | null;
}

export interface InventoryEntryDto {
  id: string;
  /** UUID de l'ItemInstance si entrée INSTANCE, null si entrée STACK. */
  instanceId: string | null;
  quantity: number;
  equipped: boolean;
  /** Position visuelle persistée dans la grille (absolue), null si non définie. */
  slotIndex: number | null;
  item: ItemSummary;
}
