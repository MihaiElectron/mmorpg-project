/**
 * inventorySlots.js
 *
 * Logique pure de projection inventaire → grille de slots (session-local).
 *
 * Règles (Phase actuelle, sans capacité serveur) :
 * - minimum MIN_SLOT_COUNT slots visibles ;
 * - grille dynamique : visibleSlotCount = max(MIN_SLOT_COUNT, inventory.length) ;
 * - AUCUNE entrée d'inventaire projetée n'est jamais perdue au rendu ;
 * - conserve le tri de session (positions existantes de prevSlotMap) tant qu'elles
 *   restent dans les limites de la grille ; sinon l'entrée est re-placée ;
 * - un stack (STACKABLE) et une instance (ItemInstance) comptent chacun pour
 *   exactement UNE entrée = UN slot.
 */

export const MIN_SLOT_COUNT = 18;

/**
 * Reconstruit le slotMap à partir du précédent et de l'inventaire courant.
 *
 * @param {(string|null)[]} prevSlotMap - slotMap précédent (ids d'entrées | null)
 * @param {{ id: string }[]} inventory - entrées d'inventaire projetées
 * @param {number} [minCount=MIN_SLOT_COUNT] - nombre minimum de slots
 * @returns {(string|null)[]} nouveau slotMap (longueur >= minCount, >= inventory.length)
 */
export function buildSlotMap(prevSlotMap, inventory, minCount = MIN_SLOT_COUNT) {
  const prev = Array.isArray(prevSlotMap) ? prevSlotMap : [];
  const entries = Array.isArray(inventory) ? inventory : [];

  // Grille dynamique : au moins minCount, au moins autant que d'entrées.
  const size = Math.max(minCount, entries.length);
  const next = new Array(size).fill(null);

  const existingIds = new Set(entries.map((inv) => inv.id));
  const placed = new Set();

  // 1. Conserver les positions existantes qui restent valides ET dans les limites.
  prev.forEach((id, index) => {
    if (index < size && id != null && existingIds.has(id) && !placed.has(id)) {
      next[index] = id;
      placed.add(id);
    }
  });

  // 2. Placer les entrées restantes (nouvelles, ou hors limites) dans le premier
  //    slot libre. Filet de sécurité : étendre la grille plutôt que dropper.
  entries.forEach((inv) => {
    if (placed.has(inv.id)) return;
    let free = next.indexOf(null);
    if (free === -1) {
      next.push(null);
      free = next.length - 1;
    }
    next[free] = inv.id;
    placed.add(inv.id);
  });

  return next;
}
