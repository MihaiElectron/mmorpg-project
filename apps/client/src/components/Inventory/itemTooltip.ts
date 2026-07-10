/**
 * itemTooltip — formatage PUR du survol d'un item (Équipement V1-B).
 *
 * Retourne une chaîne multi-ligne destinée à l'attribut `title` natif (aucun
 * tooltip custom, aucun style). N'affiche QUE des données brutes de l'item :
 * le client ne recalcule jamais de stat dérivée (serveur autoritaire). Les
 * sections vides sont masquées ; jamais de `undefined`/`null` rendu.
 */

/** Labels FR des 10 stats primaires connues (whitelist d'affichage). */
const PRIMARY_STAT_LABELS: Record<string, string> = {
  strength: "Force",
  vitality: "Vitalité",
  endurance: "Endurance",
  agility: "Agilité",
  dexterity: "Dextérité",
  intelligence: "Intelligence",
  wisdom: "Sagesse",
  spirit: "Esprit",
  willpower: "Volonté",
  charisma: "Charisme",
};

/** Forme minimale attendue — tous les champs sont optionnels (payload variable). */
export interface TooltipItem {
  name?: string | null;
  type?: string | null;
  category?: string | null;
  slot?: string | null;
  attack?: number | null;
  defense?: number | null;
  range?: number | null;
  weaponType?: string | null;
  statBonuses?: Record<string, number> | null;
  requiredLevel?: number | null;
  requiredClass?: string | null;
  requiredMasteries?: Record<string, number> | null;
}

export interface FormatItemTooltipOptions {
  /** Ligne d'action ajoutée en fin de tooltip (ex: "Double-clic pour équiper"). */
  actionHint?: string;
}

/** Nombre fini ? */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** `+X` si positif, `-X` si négatif (sans forcer un signe sur 0). */
function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/**
 * Construit le texte multi-ligne du tooltip d'un item. `item` peut être partiel.
 */
export function formatItemTooltip(
  item: TooltipItem | null | undefined,
  options: FormatItemTooltipOptions = {},
): string {
  if (!item) return options.actionHint ?? "";

  const lines: string[] = [];

  if (item.name) lines.push(item.name);
  if (item.type) lines.push(`Type : ${item.type}`);
  if (item.category) lines.push(`Catégorie : ${item.category}`);

  // Slot / équipabilité.
  if (item.slot) lines.push(`Slot : ${item.slot}`);
  else lines.push("Non équipable");

  // Stats brutes (affichées telles quelles, aucun recalcul).
  if (isFiniteNumber(item.attack) && item.attack !== 0) lines.push(`Attaque : ${signed(item.attack)}`);
  if (isFiniteNumber(item.defense) && item.defense !== 0) lines.push(`Défense : ${signed(item.defense)}`);
  if (isFiniteNumber(item.range) && item.range > 0) lines.push(`Portée : ${item.range}`);
  if (item.weaponType) lines.push(`Arme : ${item.weaponType}`);

  // Bonus de stats primaires : whitelist + valeurs finies non nulles.
  const bonusLines: string[] = [];
  const statBonuses = item.statBonuses ?? {};
  for (const key of Object.keys(PRIMARY_STAT_LABELS)) {
    const value = statBonuses[key];
    if (isFiniteNumber(value) && value !== 0) {
      bonusLines.push(`- ${PRIMARY_STAT_LABELS[key]} ${signed(value)}`);
    }
  }
  if (bonusLines.length > 0) {
    lines.push("Bonus :");
    lines.push(...bonusLines);
  }

  // Prérequis : niveau (> 1), classe, maîtrises.
  const reqLines: string[] = [];
  if (isFiniteNumber(item.requiredLevel) && item.requiredLevel > 1) {
    reqLines.push(`- Niveau ${item.requiredLevel}`);
  }
  if (item.requiredClass) reqLines.push(`- Classe ${item.requiredClass}`);
  const requiredMasteries = item.requiredMasteries ?? {};
  for (const key of Object.keys(requiredMasteries)) {
    const value = requiredMasteries[key];
    if (isFiniteNumber(value) && value > 0) reqLines.push(`- Maîtrise ${key} ${value}`);
  }
  if (reqLines.length > 0) {
    lines.push("Prérequis :");
    lines.push(...reqLines);
  }

  if (options.actionHint) lines.push(options.actionHint);

  return lines.join("\n");
}
