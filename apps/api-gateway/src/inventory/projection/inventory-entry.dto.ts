export interface ItemSummary {
  id: string;
  name: string;
  type: string;
  category: string;
  image: string | null;
  objectMode: string;
  /** Slot d'équipement cible de l'item (null si non équipable). */
  slot: string | null;
  // ── Données brutes item pour l'affichage tooltip (Équipement V1-B) ─────────
  // Exposées telles quelles depuis Item ; aucun recalcul serveur/client.
  attack: number | null;
  defense: number | null;
  range: number | null;
  weaponType: string | null;
  /** Bonus de stats primaires (JSONB Item.statBonuses). {} si aucun. */
  statBonuses: Record<string, number>;
  requiredLevel: number;
  requiredClass: string | null;
  /** Maîtrises requises (JSONB Item.requiredMasteries). {} si aucune. */
  requiredMasteries: Record<string, number>;
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
