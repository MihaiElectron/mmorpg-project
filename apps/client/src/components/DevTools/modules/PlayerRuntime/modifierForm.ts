// apps/client/src/components/DevTools/modules/PlayerRuntime/modifierForm.ts
// Fonctions pures pour la validation et le formatage des modifiers.
// Sans état, sans effets de bord — testables en isolation.

import type { RuntimeInspectableSnapshot, RuntimeModifier } from "./player-runtime.types";
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
 * Extrait les modifiers d'une source par kind depuis tout snapshot inspectable.
 * Retourne [] si la source est absente.
 */
function getSourceModifiers(snapshot: RuntimeInspectableSnapshot, kind: string): RuntimeModifier[] {
  return snapshot.sources.find((s) => s.kind === kind)?.modifiers ?? [];
}

/**
 * Extrait les modifiers de la source "equipment" d'un snapshot inspectable.
 * Retourne [] si aucune pièce d'équipement ne génère de modifier (ou si l'entité
 * n'a pas de source equipment — ex. une créature).
 */
export function getEquipmentModifiers(snapshot: RuntimeInspectableSnapshot): RuntimeModifier[] {
  return getSourceModifiers(snapshot, "equipment");
}

/**
 * Extrait les modifiers de la source "debug" d'un snapshot inspectable.
 * Retourne [] si aucune source debug n'est présente.
 */
export function getDebugModifiers(snapshot: RuntimeInspectableSnapshot): RuntimeModifier[] {
  return getSourceModifiers(snapshot, "debug");
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
