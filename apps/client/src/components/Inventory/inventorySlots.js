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

export const MIN_SLOT_COUNT = 30;

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

  // Taille : au moins minCount, autant que d'entrées, et assez pour la position
  // absolue persistée (slotIndex) la plus haute.
  let maxSlotIndex = -1;
  for (const inv of entries) {
    if (Number.isInteger(inv?.slotIndex) && inv.slotIndex > maxSlotIndex) {
      maxSlotIndex = inv.slotIndex;
    }
  }
  const size = Math.max(minCount, entries.length, maxSlotIndex + 1);
  const next = new Array(size).fill(null);

  const existingIds = new Set(entries.map((inv) => inv.id));
  const placed = new Set();

  // 1. Positions de SESSION (prev) prioritaires : conserve le tri en cours (drag)
  //    tant que l'entrée existe et reste dans les limites.
  prev.forEach((id, index) => {
    if (index < size && id != null && existingIds.has(id) && !placed.has(id)) {
      next[index] = id;
      placed.add(id);
    }
  });

  // 2. Position PERSISTÉE (slotIndex absolu) : place chaque entrée à son slot si
  //    libre. Assure la parité joueur ↔ miroir admin après reload/refetch.
  entries.forEach((inv) => {
    if (placed.has(inv.id)) return;
    const idx = inv?.slotIndex;
    if (Number.isInteger(idx) && idx >= 0 && idx < size && next[idx] == null) {
      next[idx] = inv.id;
      placed.add(inv.id);
    }
  });

  // 3. Entrées restantes (sans slotIndex, ou collision) → premier slot libre.
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
