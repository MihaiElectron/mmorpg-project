// Helper commun DevTools : détection « formulaire modifié » (dirty).
// Compare un état initial à l'état courant via une sérialisation STABLE (clés
// triées récursivement) — évite les faux positifs dus à l'ordre d'insertion des
// clés dans les objets (ex: éditeurs de coefficients qui reconstruisent un
// Record). Purement local, aucun effet de bord.

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Sérialisation déterministe (clés triées) d'un état de formulaire. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

/** true si `current` diffère de `initial` (comparaison stable). */
export function hasFormChanges(initial: unknown, current: unknown): boolean {
  return stableStringify(initial) !== stableStringify(current);
}
