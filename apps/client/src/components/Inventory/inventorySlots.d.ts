/** Déclarations de types pour le helper pur JS `inventorySlots.js`.
 *  Permet de réutiliser la logique d'ordre d'inventaire depuis du TSX
 *  (miroir admin read-only) sans dupliquer la logique du panneau joueur. */
export const MIN_SLOT_COUNT: number;
export function buildSlotMap(
  prevSlotMap: (string | null)[],
  inventory: { id: string; slotIndex?: number | null }[],
  minCount?: number,
): (string | null)[];
