// Événement client léger : le catalogue d'items a changé (create/update/delete/
// toggle dans DevTools). Les surfaces qui affichent des items (inventaire, slots
// équipés, tooltips) se rechargent depuis le serveur — jamais de recalcul client.
// Même pattern que `skill-definitions:changed`.

// Réutilise le nom d'event déjà émis par ItemsModule (create/save) pour ne pas
// multiplier les canaux.
export const ITEM_DEFINITIONS_CHANGED = "devtools:items-changed";

/** Signale un changement du catalogue d'items (émis par le Studio). */
export function notifyItemDefinitionsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ITEM_DEFINITIONS_CHANGED));
  }
}

/** Abonne un callback ; renvoie la fonction de désabonnement. */
export function onItemDefinitionsChanged(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(ITEM_DEFINITIONS_CHANGED, cb);
  return () => window.removeEventListener(ITEM_DEFINITIONS_CHANGED, cb);
}
