/**
 * Formules de progression PURES (aucune I/O, aucune injection).
 * ---------------------------------------------------------------------------
 * Source unique serveur des règles d'XP et de points de stats (ADR-0018).
 * Réutilisée par :
 *   - `ProgressionService` (calcul réel, level-up) ;
 *   - l'aperçu Studio (`AdminService.previewGameConfig`, valeurs brouillon).
 *
 * Le Studio n'implémente jamais ces formules côté client : il affiche les
 * exemples et simulations calculés serveur.
 *
 * Modèle XP — progression multiplicative par tranches de niveaux :
 *   - la première marche (1 → 2) coûte `startingXp` ;
 *   - pour tout niveau cible N ≥ 3 :
 *       xpToReach(N) = xpToReach(N-1) × multiplicateur(tranche de N).
 * Tranches : 1–10, 11–30, 31–60, 61–120.
 */

/** Sous-ensemble de GameConfig nécessaire aux formules de progression. */
export interface ProgressionParams {
  // Modèle XP par tranches (actif).
  startingXp: number;
  xpMultiplierLevel1To10: number;
  xpMultiplierLevel11To30: number;
  xpMultiplierLevel31To60: number;
  xpMultiplierLevel61To120: number;
  // Niveaux.
  characterMaxLevel: number;
  characterCurrentLevelCap: number;
  // Points de stats.
  statPointsAtLevelOne: number;
  statPointsPerLevel: number;
}

/**
 * Multiplicateur de la tranche à laquelle appartient le niveau cible.
 * Niveaux hors bornes connues : rattachés à la tranche la plus haute.
 */
export function xpTierMultiplier(targetLevel: number, p: ProgressionParams): number {
  if (targetLevel <= 10) return p.xpMultiplierLevel1To10;
  if (targetLevel <= 30) return p.xpMultiplierLevel11To30;
  if (targetLevel <= 60) return p.xpMultiplierLevel31To60;
  return p.xpMultiplierLevel61To120;
}

/**
 * XP requise pour la transition (targetLevel - 1) → targetLevel.
 *   - targetLevel ≤ 1 : 0 (on démarre au niveau 1) ;
 *   - targetLevel = 2 : startingXp ;
 *   - targetLevel ≥ 3 : xpToReach(N-1) × multiplicateur(tranche de N), arrondi.
 */
export function xpToReachLevel(targetLevel: number, p: ProgressionParams): number {
  if (targetLevel <= 1) return 0;
  let xp = p.startingXp; // coût 1 → 2
  for (let level = 3; level <= targetLevel; level++) {
    xp = Math.round(xp * xpTierMultiplier(level, p));
  }
  return Math.round(xp);
}

/**
 * XP requise pour avancer DU niveau `level` AU niveau `level + 1`.
 * Équivaut à `xpToReachLevel(level + 1)`. Utilisé par `ProgressionService`.
 */
export function xpToAdvanceFromLevel(level: number, p: ProgressionParams): number {
  return xpToReachLevel(level + 1, p);
}

/**
 * XP cumulée totale depuis le niveau 1 jusqu'à `targetLevel`
 *   = Σ xpToReachLevel(k) pour k de 2 à targetLevel.
 */
export function cumulativeXpToLevel(targetLevel: number, p: ProgressionParams): number {
  if (targetLevel <= 1) return 0;
  let total = 0;
  let xp = p.startingXp; // coût 1 → 2
  total += xp;
  for (let level = 3; level <= targetLevel; level++) {
    xp = Math.round(xp * xpTierMultiplier(level, p));
    total += xp;
  }
  return total;
}

/**
 * Total de points de stats libres théoriquement accordés à un personnage
 * ayant atteint `level`, sans aucune allocation :
 *   statPointsAtLevelOne + (level - 1) × statPointsPerLevel
 *
 * Utilisé pour l'aperçu Studio. Le recalcul/réaffectation réel des
 * personnages existants n'est PAS exécuté en Étape 1A (ADR-0018 §1).
 */
export function totalStatPointsForLevel(level: number, p: ProgressionParams): number {
  const effectiveLevel = Math.max(1, level);
  return p.statPointsAtLevelOne + (effectiveLevel - 1) * p.statPointsPerLevel;
}
