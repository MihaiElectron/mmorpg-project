// apps/api-gateway/src/player-runtime/player-runtime.types.ts

/**
 * Stats directement issues de Character (avant tout calcul dérivé).
 * Source unique : la DB. Jamais inventées ni extrapolées côté runtime.
 */
export interface BaseStats {
  level: number;
  health: number;
  maxHealth: number;
  attack: number;
  defense: number;
  experience: number;
}

/**
 * Stats calculées depuis BaseStats + future contribution Equipment/Buffs/Talents.
 *
 * Phase actuelle (Phase 1) :
 *   - maxHp / attackPower / defenseTotal = valeurs de base uniquement
 *   - speed / gatheringRange / attackRange = documentés mais non calculés (0)
 *
 * Prochaine étape : ajouter la contribution Equipment quand recalculateStats()
 * sera implémentée dans CharacterService.
 */
export interface DerivedStats {
  maxHp: number;
  attackPower: number;
  defenseTotal: number;
  // Documenté — pas encore de stat speed dans Character
  speed: number;
  // Documenté — défini par WorldService.checkInteraction, non exposé ici
  gatheringRange: number;
  // Documenté — combat range pas encore implémenté
  attackRange: number;
}

/**
 * Représentation vivante d'un personnage connecté.
 *
 * Règles :
 * - Ne jamais écrire en DB depuis cette structure.
 * - Ne remplace pas Character (source de vérité DB).
 * - Position issue de ConnectedPlayer si en ligne, sinon dernière valeur DB.
 */
export interface PlayerRuntime {
  characterId: string;
  name: string;
  worldX: number;
  worldY: number;
  mapId: number;
  baseStats: BaseStats;
  derivedStats: DerivedStats;
  isConnected: boolean;
  socketId: string | null;
}

export interface RuntimeStatsResult {
  base: BaseStats;
  derived: DerivedStats;
}
