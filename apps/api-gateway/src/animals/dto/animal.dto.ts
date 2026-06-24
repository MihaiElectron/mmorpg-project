export type AnimalDto = {
  id: string;
  templateKey: string;
  type: string;
  /** Clé de texture Phaser explicite (= template.textureKey). Redondant avec type en Phase 1,
   *  utile quand type et textureKey divergeront. */
  textureKey: string;
  name: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  armor: number;
  attack: number;
  state: 'alive' | 'fighting' | 'escaping' | 'dead';
  respawnAt: Date | null;
};
