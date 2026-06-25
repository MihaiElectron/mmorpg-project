/**
 * Type WorldObject minimal côté Studio SDK frontend.
 * Compatible avec la réponse de GET /admin/resources/world-objects
 * et extensible à tout futur domaine exposé via le SDK.
 */

export interface WorldObjectPosition {
  worldX: number;
  worldY: number;
}

export interface WorldObject {
  kind: string;
  category: string;
  id: string;
  type: string;
  mapId: number | null;
  position: WorldObjectPosition | null;
  state: string;
  /** Présent uniquement pour les types qui ont des charges (Resource). */
  remainingLoots?: number;
  /** Présent pour les entités avec barre de vie (Creature). */
  health?: number;
  maxHealth?: number;
  capabilities: string[];
  metadata: Record<string, unknown> & {
    /** Date ISO de réapparition si l'entité est dead et en attente de respawn (Resource ou Creature). */
    respawnAt?: string | Date | null;
    /** Clé du skill de récolte (Resource). Null si non configuré. */
    skillKey?: string | null;
    /** XP accordée par tick de récolte réussi (Resource). Null si template absent. */
    gatheringXpReward?: number | null;
  };
}
