// Signal frontend interne : le catalogue skill_definition a changé (create /
// update / delete / toggle enabled depuis le Skill Editor). Les surfaces qui
// dérivent leur affichage du catalogue (SkillActionBar joueur, onglet Skills du
// panneau admin) s'y abonnent pour refetch — le serveur reste source de vérité
// (son cache est déjà invalidé côté ActiveSkillsService à chaque mutation).

export const SKILL_DEFINITIONS_CHANGED = "skill-definitions:changed";

/** À appeler après une mutation réussie du catalogue. */
export function notifySkillDefinitionsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SKILL_DEFINITIONS_CHANGED));
  }
}

/** Abonne un callback ; renvoie la fonction de désabonnement. */
export function onSkillDefinitionsChanged(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SKILL_DEFINITIONS_CHANGED, cb);
  return () => window.removeEventListener(SKILL_DEFINITIONS_CHANGED, cb);
}
