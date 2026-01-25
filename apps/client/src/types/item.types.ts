// apps/client/src/types/item.types.ts

export type ItemSlot =
  | 'left-earring'
  | 'right-earring'
  | 'headgear'
  | 'ranged-weapon'
  | 'necklace'
  | 'chest-armor'
  | 'left-bracelet'
  | 'main-weapon'
  | 'off-hand'
  | 'gloves'
  | 'right-bracelet'
  | 'leg-armor'
  | 'left-ring'
  | 'right-ring'
  | 'boots'
  | 'bag';

export interface Item {
  id: string;
  name: string;
  slot: ItemSlot;
  image: string; // chemin vers l’icône (DB = image)
  stats?: {
    strength?: number;
    agility?: number;
    intelligence?: number;
    vitality?: number;
  };
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';
}
