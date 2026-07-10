/**
 * Helpers PURS de la SkillActionBar (V1-L-B fix) — aucune I/O, testables.
 */

/**
 * Palier 0..100 (pas de 5) du temps de recharge RESTANT, pour la classe SCSS
 * du balayage d'horloge (`--fill-XX`). 0 si pas de cooldown ou total invalide
 * (jamais de division par zéro).
 */
export function cooldownRemainingBucket(remainingMs: number, totalMs: number): number {
  if (!(totalMs > 0) || !(remainingMs > 0)) return 0;
  const pct = Math.min(100, (remainingMs / totalMs) * 100);
  return Math.round(pct / 5) * 5;
}

/**
 * Positions prédéfinies de la SkillActionBar (V1-L-B). Snap par classes SCSS —
 * aucun drag libre au pixel (éviterait le style inline). Ordre = cycle du bouton.
 */
export const BAR_POSITIONS = [
  "bottom-left",
  "bottom-center",
  "bottom-right",
  "top-left",
  "top-center",
  "top-right",
] as const;

export type BarPosition = (typeof BAR_POSITIONS)[number];

const BAR_POSITION_STORAGE_KEY = "skillActionBarPosition";

/** Position suivante dans le cycle (revient au début après la dernière). */
export function nextBarPosition(current: BarPosition): BarPosition {
  const idx = BAR_POSITIONS.indexOf(current);
  return BAR_POSITIONS[(idx + 1) % BAR_POSITIONS.length];
}

/** Position persistée (localStorage) ; fallback "bottom-left" si absente/invalide. */
export function loadBarPosition(): BarPosition {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(BAR_POSITION_STORAGE_KEY) : null;
    if (raw && (BAR_POSITIONS as readonly string[]).includes(raw)) return raw as BarPosition;
  } catch {
    /* localStorage indisponible : fallback */
  }
  return "bottom-left";
}

/** Persiste la position choisie (silencieux si localStorage indisponible). */
export function saveBarPosition(position: BarPosition): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(BAR_POSITION_STORAGE_KEY, position);
  } catch {
    /* ignore */
  }
}

/**
 * Message de cast CONFIRMÉ (après `skill:cooldown` serveur). Le client
 * n'invente pas le succès : ce message n'est construit qu'à réception de la
 * confirmation serveur. `targetLabel` enrichit si connu, sinon fallback sobre.
 */
export function buildCastSuccessMessage(
  skillName: string,
  targetType: "self" | "creature",
  targetLabel?: string | null,
): string {
  const name = skillName || "Skill";
  if (targetType === "self") return `${name} utilisé sur soi-même.`;
  if (targetLabel) return `${name} utilisé sur ${targetLabel}.`;
  return `${name} utilisé.`;
}
