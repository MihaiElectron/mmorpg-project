// Événement client léger : une définition de stat dérivée a changé
// (create / update / duplicate / delete / retrait de référence de maîtrise dans
// DevTools). Les surfaces qui affichent une valeur calculée serveur (panneau
// personnage joueur via `stats.derived`) se rechargent depuis le serveur —
// jamais de recalcul client. Même pattern que `devtools:items-changed` et
// `skill-definitions:changed`.

export const DERIVED_STATS_CHANGED = "devtools:derived-stats-changed";

/** Signale un changement du catalogue de stats dérivées (émis par le Studio). */
export function notifyDerivedStatsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DERIVED_STATS_CHANGED));
  }
}

/** Abonne un callback ; renvoie la fonction de désabonnement. */
export function onDerivedStatsChanged(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(DERIVED_STATS_CHANGED, cb);
  return () => window.removeEventListener(DERIVED_STATS_CHANGED, cb);
}
