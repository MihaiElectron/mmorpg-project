// apps/client/src/components/DevTools/modules/PlayerRuntime/modifierForm.ts
// Fonctions pures pour la validation et le formatage des modifiers.
// Sans état, sans effets de bord — testables en isolation.

import type { PlayerRuntimeSnapshot, RuntimeModifier } from "./player-runtime.types";
import { OP_LABELS, STAT_LABELS } from "./player-runtime.types";

/**
 * Parse et valide une valeur numérique saisie dans le formulaire.
 * Retourne le nombre si valide, null sinon.
 */
export function validateModifierValue(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extrait les modifiers de la source "debug" d'un snapshot.
 * Retourne [] si aucune source debug n'est présente.
 */
export function getDebugModifiers(snapshot: PlayerRuntimeSnapshot): RuntimeModifier[] {
  return snapshot.sources.find((s) => s.kind === "debug")?.modifiers ?? [];
}

/**
 * Formate un modifier en une ligne lisible : stat + opération + valeur.
 * Générique — fonctionne pour tous les sourceType.
 */
export function formatModifierSummary(modifier: RuntimeModifier): string {
  const stat = STAT_LABELS[modifier.targetStat] ?? modifier.targetStat;
  const op = OP_LABELS[modifier.operation] ?? modifier.operation;
  const sign = modifier.value >= 0 ? "+" : "";
  return `${stat} ${op} ${sign}${modifier.value}`;
}

/**
 * Formate un libellé de comptage de modifiers.
 */
export function formatModifierCount(count: number): string {
  return `${count} ${count === 1 ? "modifier" : "modifiers"}`;
}
