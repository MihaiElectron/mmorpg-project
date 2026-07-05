/**
 * statsAllocation.js — helpers PURS de l'allocation locale (Progression V1).
 *
 * Le buffer local représente les points ajoutés côté client AVANT validation
 * serveur. Le serveur reste autoritaire : ces helpers ne calculent jamais de
 * stat finale, ils gèrent seulement le brouillon de répartition des points.
 */

/** Les 8 stats principales, dans l'ordre d'affichage. Clé API + libellé FR. */
export const STAT_FIELDS = [
  { key: "strength", label: "Force", base: "baseStrength", final: "strength" },
  { key: "vitality", label: "Vitalité", base: "baseVitality", final: "vitality" },
  { key: "endurance", label: "Endurance", base: "baseEndurance", final: "endurance" },
  { key: "agility", label: "Agilité", base: "baseAgility", final: "agility" },
  { key: "dexterity", label: "Dextérité", base: "baseDexterity", final: "dexterity" },
  { key: "intelligence", label: "Intelligence", base: "baseIntelligence", final: "intelligence" },
  { key: "wisdom", label: "Sagesse", base: "baseWisdom", final: "wisdom" },
  { key: "critical", label: "Critique", base: "baseCritical", final: "critical" },
];

/** Buffer vide : toutes les stats à 0. */
export function emptyBuffer() {
  return STAT_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: 0 }), {});
}

/** Total de points actuellement répartis dans le buffer local. */
export function totalAllocated(buffer) {
  return STAT_FIELDS.reduce((sum, f) => sum + (buffer[f.key] || 0), 0);
}

/** Points encore disponibles = points serveur non dépensés − buffer local. */
export function remainingPoints(unspentStatPoints, buffer) {
  return (unspentStatPoints || 0) - totalAllocated(buffer);
}

/**
 * Ajoute un point à une stat si des points restent disponibles.
 * Retourne un NOUVEAU buffer (immutabilité), le même si aucun point dispo.
 */
export function increment(buffer, key, unspentStatPoints) {
  if (remainingPoints(unspentStatPoints, buffer) <= 0) return buffer;
  return { ...buffer, [key]: (buffer[key] || 0) + 1 };
}

/**
 * Retire un point d'une stat si le buffer local en contient sur cette stat.
 * Retourne un NOUVEAU buffer, le même si rien à retirer.
 */
export function decrement(buffer, key) {
  if ((buffer[key] || 0) <= 0) return buffer;
  return { ...buffer, [key]: buffer[key] - 1 };
}

/**
 * Construit le payload à envoyer : uniquement les stats > 0.
 * Un buffer vide produit un objet vide (rien à valider).
 */
export function buildAllocationPayload(buffer) {
  const payload = {};
  for (const f of STAT_FIELDS) {
    const v = buffer[f.key] || 0;
    if (v > 0) payload[f.key] = v;
  }
  return payload;
}
