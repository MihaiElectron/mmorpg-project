/**
 * Formatage PUR de la trace serveur du calcul des PV max créature (Lot 3).
 * ---------------------------------------------------------------------------
 * Le Studio n'affiche QUE ce que le serveur a calculé : ces fonctions
 * transforment la trace serveur en lignes lisibles. Elles ne recalculent JAMAIS
 * la formule des PV (aucune addition/multiplication métier ici). Testable sans
 * React (fonctions pures), cohérent avec le style des tests client existants.
 */

/** Miroir du DTO serveur `CreatureMaxHealthContributionDto`. */
export interface MaxHealthContribution {
  sourceType: string;
  sourceId: string;
  operation: string;
  originalValue: number;
  effectiveValue: number;
  scale: number;
  contribution: number;
  tags: string[];
}

/** Miroir du DTO serveur `CreatureMaxHealthFilteredDto`. */
export interface MaxHealthFiltered {
  sourceType: string;
  sourceId: string;
  operation: string;
  originalValue: number;
  scale: number;
  excluded: boolean;
  reasons: string[];
}

/** Miroir du DTO serveur `CreatureMaxHealthTraceDto`. */
export interface MaxHealthTrace {
  stat: "maxHealth";
  baseValue: number;
  vitality: number;
  maxHealthPerVitality: number;
  appliedContributions: MaxHealthContribution[];
  filteredContributions: MaxHealthFiltered[];
  afterFlat: number;
  afterPercentAdd: number;
  afterPercentMultiply: number;
  afterOverride: number;
  beforeCaps: number;
  caps: { min: number | null; max: number | null };
  afterCaps: number;
  roundingPolicy: string;
  overrideApplied: { modifierId: string; priority: number; value: number } | null;
  finalValue: number;
}

/** Une ligne d'affichage label → valeur (le composant fait le rendu). */
export interface TraceRow {
  key: string;
  label: string;
  value: string;
  /** true → valeur mise en avant (valeur finale autoritaire). */
  strong?: boolean;
}

/** Signe explicite d'un nombre pour les contributions (+N / -N / 0). */
function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Formate un nombre potentiellement fractionnaire sans imposer de recalcul :
 * conserve les décimales serveur (utile pour `beforeCaps` avant `floor`), sans
 * décimales superflues pour les entiers.
 */
function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

/**
 * Construit les lignes principales de la section « PV maximum ». Affiche
 * uniquement les lignes pertinentes (les étapes neutres — pourcentage 0,
 * multiplicateur ×1, override absent — ne sont montrées que si non triviales)
 * pour ne pas surcharger l'écran. `currentHealth` optionnel (PV actuels).
 *
 * Fallback : si `trace` est absente (ancien payload serveur), retourne au moins
 * la valeur finale fournie (`fallbackFinal`) — aucune erreur, aucun recalcul.
 */
export function buildMaxHealthRows(
  trace: MaxHealthTrace | null | undefined,
  opts: { currentHealth?: number; fallbackFinal?: number } = {},
): TraceRow[] {
  if (!trace) {
    const rows: TraceRow[] = [];
    if (typeof opts.fallbackFinal === "number") {
      rows.push({ key: "final", label: "PV maximum finaux", value: num(opts.fallbackFinal), strong: true });
    }
    return rows;
  }

  const rows: TraceRow[] = [];

  if (typeof opts.currentHealth === "number") {
    rows.push({ key: "current", label: "PV actuels", value: `${num(opts.currentHealth)} / ${num(trace.finalValue)}` });
  }

  rows.push({ key: "base", label: "Base configurée", value: num(trace.baseValue) });
  rows.push({ key: "vitality", label: "Vitalité", value: num(trace.vitality) });
  rows.push({ key: "coef", label: "Coefficient PV / Vitalité", value: num(trace.maxHealthPerVitality) });

  const vit = trace.appliedContributions.find((c) => c.sourceId === "vitality");
  if (vit) {
    rows.push({ key: "vit-contrib", label: "Contribution Vitalité", value: signed(vit.contribution) });
  }

  // Étapes neutres masquées si triviales (pas de bonus plat/%/multiplicateur au-delà de la Vitalité).
  const extraFlat = trace.afterFlat - trace.baseValue - (vit ? vit.contribution : 0);
  if (Math.abs(extraFlat) > 1e-9) {
    rows.push({ key: "flat", label: "Bonus/malus plats supplémentaires", value: signed(extraFlat) });
  }
  if (Math.abs(trace.afterPercentAdd - trace.afterFlat) > 1e-9) {
    rows.push({ key: "pct", label: "Après pourcentage additif", value: num(trace.afterPercentAdd) });
  }
  if (Math.abs(trace.afterPercentMultiply - trace.afterPercentAdd) > 1e-9) {
    rows.push({ key: "mult", label: "Après multiplicateur", value: num(trace.afterPercentMultiply) });
  }
  if (trace.overrideApplied) {
    rows.push({ key: "override", label: "Override", value: num(trace.overrideApplied.value) });
  }

  rows.push({ key: "before-caps", label: "Valeur avant caps", value: num(trace.beforeCaps) });
  rows.push({ key: "cap-min", label: "Cap minimum", value: trace.caps.min != null ? num(trace.caps.min) : "Aucun" });
  if (trace.caps.max != null) {
    rows.push({ key: "cap-max", label: "Cap maximum", value: num(trace.caps.max) });
  }
  rows.push({ key: "after-caps", label: "Après caps", value: num(trace.afterCaps) });
  rows.push({ key: "rounding", label: "Arrondi", value: trace.roundingPolicy });
  rows.push({ key: "final", label: "PV maximum finaux", value: num(trace.finalValue), strong: true });

  return rows;
}

/** Résumé lisible d'une contribution appliquée (source · opération · valeur). */
export function formatAppliedContribution(c: MaxHealthContribution): string {
  const base = `${c.sourceId} (${c.sourceType}) · ${c.operation} · ${signed(c.contribution)}`;
  return c.scale !== 1 ? `${base} · ×${c.scale}` : base;
}

/** Résumé lisible d'une contribution filtrée (exclue ou réduite, + raison). */
export function formatFilteredContribution(f: MaxHealthFiltered): string {
  const state = f.excluded ? "exclue" : `réduite ×${f.scale}`;
  const reason = f.reasons.length > 0 ? ` — ${f.reasons.join(", ")}` : "";
  return `${f.sourceId} (${f.sourceType}) · ${f.operation} · ${state}${reason}`;
}
