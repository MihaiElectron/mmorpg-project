export type AnimalDto = {
  id: string;
  templateKey: string;
  type: string;
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
