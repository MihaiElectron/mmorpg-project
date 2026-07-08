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
 * Utilisé pour l'aperçu Studio et le recalcul global admin (ADR-0018 §1).
 */
export function totalStatPointsForLevel(level: number, p: ProgressionParams): number {
  const effectiveLevel = Math.max(1, level);
  return p.statPointsAtLevelOne + (effectiveLevel - 1) * p.statPointsPerLevel;
}

/**
 * Niveau maximum atteignable par la progression normale : le plus petit des
 * deux bornes (cap de niveau actuellement débloqué, niveau max absolu).
 * `characterCurrentLevelCap` (ex. 60 au lancement) borne la progression
 * normale ; `characterMaxLevel` (ex. 120) est la limite absolue réservée à un
 * déblocage futur (ADR-0018 §1).
 */
function effectiveLevelCap(p: ProgressionParams): number {
  return Math.min(p.characterCurrentLevelCap, p.characterMaxLevel);
}

/**
 * Recalcule le niveau atteint à partir d'une XP cumulée totale et de la
 * courbe XP courante (source de vérité pour tout recalcul de progression,
 * ADR-0018 §1).
 *
 * Cherche le plus grand `level` tel que `cumulativeXpToLevel(level, p) <=
 * cumulativeExperience`, borné à `[1, effectiveLevelCap(p)]`. Un personnage
 * ayant cumulé plus d'XP que nécessaire pour atteindre le cap reste au cap —
 * l'excédent est visible via `experienceIntoCurrentLevel` (peut dépasser
 * `nextLevelXpForLevel(cap)`, ce qui indique un excédent gelé au cap).
 */
export function levelFromCumulativeXp(
  cumulativeExperience: number,
  p: ProgressionParams,
): number {
  const cap = Math.max(1, effectiveLevelCap(p));
  const xp = Math.max(0, cumulativeExperience);

  let level = 1;
  while (level < cap && cumulativeXpToLevel(level + 1, p) <= xp) {
    level++;
  }
  return level;
}

/**
 * XP restante dans le niveau courant (partielle, pour compatibilité avec le
 * champ `Character.experience` existant) :
 *   experienceIntoCurrentLevel = cumulativeExperience - cumulativeXpToLevel(level, p)
 *
 * `level` doit être cohérent avec `cumulativeExperience` (typiquement le
 * résultat de `levelFromCumulativeXp`). Jamais négatif.
 */
export function experienceIntoCurrentLevel(
  cumulativeExperience: number,
  level: number,
  p: ProgressionParams,
): number {
  const xp = Math.max(0, cumulativeExperience);
  return Math.max(0, xp - cumulativeXpToLevel(level, p));
}

/**
 * XP nécessaire pour avancer du niveau `level` au niveau `level + 1`.
 * Alias explicite de `xpToAdvanceFromLevel` — ne duplique pas la formule,
 * uniquement un nom plus lisible pour les appelants du recalcul de
 * progression (`levelFromCumulativeXp` / `experienceIntoCurrentLevel`).
 * 0 si `level` a atteint le cap effectif (aucune marche suivante).
 */
export function nextLevelXpForLevel(level: number, p: ProgressionParams): number {
  if (level >= effectiveLevelCap(p)) return 0;
  return xpToAdvanceFromLevel(level, p);
}

/** Sous-ensemble de Character nécessaire à `resolveCumulativeExperience`. */
export interface CharacterCumulativeXpSource {
  level: number;
  experience: number;
  cumulativeExperience: number;
}

/**
 * Reconstitue l'XP cumulée d'un personnage qui n'a jamais été migré vers ce
 * modèle (`cumulativeExperience` encore à 0 alors qu'il a déjà `level`/
 * `experience`). Backfill ESTIMÉ à partir de la courbe XP actuellement en
 * vigueur au moment de l'appel — voir `Character.entity.ts`. Réutilisée par
 * le gain d'XP normal (`ProgressionService`) et le recalcul admin
 * (`AdminService.recalculateCharacterProgression`) : point d'implémentation
 * unique, jamais dupliqué.
 *
 * Idempotent : si `cumulativeExperience` est déjà > 0, elle est retournée
 * telle quelle — jamais recalculée ni écrasée.
 */
export function resolveCumulativeExperience(
  character: CharacterCumulativeXpSource,
  p: ProgressionParams,
): number {
  if (character.cumulativeExperience > 0) return character.cumulativeExperience;
  return cumulativeXpToLevel(character.level, p) + character.experience;
}
