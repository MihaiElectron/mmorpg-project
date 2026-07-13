/**
 * Helpers PURS d'édition des champs d'équipement d'un item (Équipement V1-C-B).
 *
 * Le Studio configure ; le serveur valide. Ces fonctions ne font QUE nettoyer /
 * normaliser l'entrée admin pour l'aider — aucun calcul de stat dérivée, aucune
 * autorité gameplay. Le backend re-sanitize de toute façon (V1-C-A).
 */
import { stableStringify } from "../../shared/formDirty";

/** Les 10 stats primaires + labels FR (cohérents avec le tooltip inventaire). */
export const EQUIPMENT_STAT_FIELDS: { key: string; label: string }[] = [
  { key: "strength", label: "Force" },
  { key: "vitality", label: "Vitalité" },
  { key: "endurance", label: "Endurance" },
  { key: "agility", label: "Agilité" },
  { key: "dexterity", label: "Dextérité" },
  { key: "intelligence", label: "Intelligence" },
  { key: "wisdom", label: "Sagesse" },
  { key: "spirit", label: "Esprit" },
  { key: "willpower", label: "Volonté" },
  { key: "charisma", label: "Charisme" },
];

const PRIMARY_KEYS = EQUIPMENT_STAT_FIELDS.map((f) => f.key);

/** Draft statBonuses vide (un champ texte "" par stat primaire). */
export function emptyStatBonusesDraft(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of PRIMARY_KEYS) out[key] = "";
  return out;
}

const PRIMARY_KEY_SET = new Set(PRIMARY_KEYS);

/**
 * Pré-remplit les champs texte depuis les statBonuses persistés de l'item :
 * les stats PRIMAIRES (grille fixe) ET les stats SECONDAIRES déjà présentes
 * (parade, esquive, etc.). Une secondaire présente sur l'item apparaît donc
 * dans le draft, même hors grille primaire. 0/absent → champ vide.
 */
export function statBonusesDraftFromItem(
  statBonuses: Record<string, number> | null | undefined,
): Record<string, string> {
  const out = emptyStatBonusesDraft();
  if (statBonuses) {
    for (const key of PRIMARY_KEYS) {
      const value = statBonuses[key];
      if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
        out[key] = String(value);
      }
    }
    // Secondaires déjà persistées (toute clé non primaire présente sur l'item).
    for (const [key, value] of Object.entries(statBonuses)) {
      if (PRIMARY_KEY_SET.has(key)) continue;
      if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
        out[key] = String(value);
      }
    }
  }
  return out;
}

/**
 * Unité d'affichage d'une stat secondaire (V5-F) — présentation UNIQUEMENT,
 * aucune incidence gameplay. "%" pour les chances/pourcentages (parryChance,
 * dodgeChance, criticalChance, blockChance, *Percent, criticalDamage = multiplicateur %) ;
 * chaîne vide pour les valeurs plates (puissance, points, PV/regen…). Dérivé du
 * nom de clé (pas de liste codée en dur) : "*Chance", "*Percent", "criticalDamage".
 */
export function secondaryStatUnit(key: string): "%" | "" {
  if (/Chance$/.test(key) || /Percent$/.test(key) || key === "criticalDamage") return "%";
  return "";
}

/**
 * Clés secondaires (non primaires) présentes dans un draft — y compris une stat
 * fraîchement ajoutée à valeur vide (pour la rendre éditable). Sert au rendu des
 * lignes « stats secondaires ajoutées ».
 */
export function secondaryStatKeysInDraft(
  draft: Record<string, string> | null | undefined,
): string[] {
  if (!draft) return [];
  return Object.keys(draft).filter((key) => !PRIMARY_KEY_SET.has(key));
}

/**
 * Nettoie les champs texte statBonuses → objet numérique unique (primaires +
 * secondaires). Ne garde que les valeurs finies NON NULLES (négatives autorisées
 * = malus). Whitelist : les 10 primaires + les clés secondaires AUTORISÉES
 * passées par l'appelant (catalogue serveur `enabled + runtimeStatus implemented`).
 * Toute autre clé est ignorée. Champs vides / 0 / non numériques omis.
 */
export function cleanStatBonuses(
  draft: Record<string, string> | null | undefined,
  allowedSecondaryKeys: readonly string[] = [],
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!draft) return out;
  const keys = [...PRIMARY_KEYS, ...allowedSecondaryKeys];
  for (const key of keys) {
    const raw = draft[key];
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value !== 0) out[key] = value;
  }
  return out;
}

/** requiredLevel : entier >= 1 ; vide/invalide → 1. */
export function normalizeRequiredLevel(raw: string | number | null | undefined): number {
  const value = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) return 1;
  return value;
}

/** requiredClass : trim ; vide/espaces → null. */
export function normalizeRequiredClass(raw: string | null | undefined): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

/** requiredMasteries : ne garde que clé non vide + valeur entière > 0. */
export function cleanRequiredMasteries(
  raw: Record<string, number> | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw)) {
    if (key.trim().length > 0 && typeof value === "number" && Number.isInteger(value) && value > 0) {
      out[key] = value;
    }
  }
  return out;
}

/** Égalité stable de deux Records (ordre de clés indifférent). */
export function recordsEqual(
  a: Record<string, number> | null | undefined,
  b: Record<string, number> | null | undefined,
): boolean {
  return stableStringify(a ?? {}) === stableStringify(b ?? {});
}
