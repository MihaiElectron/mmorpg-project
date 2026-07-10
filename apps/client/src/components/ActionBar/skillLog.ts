import { getCombatLogStore } from "../../store/combatLog.store";

/**
 * skillLog — route les messages d'erreur/état de skill (V1-L-B) vers le chat
 * combat existant, sans nouvelle UI flottante. Le client ne fait qu'AFFICHER
 * des messages déjà produits (serveur `skill:error` ou refus locaux) : aucune
 * autorité gameplay, aucune dépendance backend.
 */

export type SkillLogSeverity = "info" | "warn" | "error";

/** Préfixe commun pour repérer les lignes de skill dans le journal de combat. */
const SKILL_PREFIX = "[Skill] ";

/** Fenêtre d'anti-spam : deux messages identiques rapprochés sont fusionnés. */
const DEDUPE_WINDOW_MS = 1000;

/** Dernier message poussé + horodatage (dédup des identiques uniquement). */
let lastMessage: string | null = null;
let lastAt = 0;

/**
 * Pousse un message de skill dans le chat combat (catégorie "combat").
 * - Préfixe `[Skill] `.
 * - Déduplique UNIQUEMENT le même message dans les 1000 ms (hotkey maintenue) ;
 *   deux messages différents ne sont jamais filtrés.
 */
export function addSkillLog(message: string, severity: SkillLogSeverity = "warn"): void {
  if (!message) return;
  const now = Date.now();
  if (message === lastMessage && now - lastAt < DEDUPE_WINDOW_MS) return;
  lastMessage = message;
  lastAt = now;
  getCombatLogStore().getState().pushLog({
    category: "combat",
    message: SKILL_PREFIX + message,
    severity,
  });
}

/** Réinitialise l'état d'anti-spam (tests). */
export function __resetSkillLogDedupe(): void {
  lastMessage = null;
  lastAt = 0;
}
