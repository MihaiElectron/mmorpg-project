export type AnimalDto = {
  id: string;
  templateKey: string;
  type: string;
  /** Clé de texture Phaser explicite (= template.textureKey). Redondant avec type en Phase 1,
   *  utile quand type et textureKey divergeront. */
  textureKey: string;
  name: string;
  /** Coordonnées WU — source de vérité. Null si non encore initialisées au premier tick. */
  worldX: number | null;
  worldY: number | null;
  mapId: number | null;
  /** Cache pixel isométrique dérivé de worldX/worldY. Conservé pour fallback legacy. */
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  armor: number;
  attack: number;
  state: 'alive' | 'fighting' | 'escaping' | 'dead';
  respawnAt: Date | null;
};
