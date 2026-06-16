export type AnimalDto = {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  armor: number;
  attack: number;
  state: 'alive' | 'dead';
};
