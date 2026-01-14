import { IsEnum, IsOptional, IsUUID } from 'class-validator';

/**
 * Enum des slots possibles pour l'équipement
 * Les valeurs correspondent exactement aux classes CSS / frontend
 */
export enum EquipmentSlot {
  LEFT_EARRING = 'left-earring',
  RIGHT_EARRING = 'right-earring',
  HEADGEAR = 'headgear',
  RANGED_WEAPON = 'ranged-weapon',

  NECKLACE = 'necklace',
  CHEST_ARMOR = 'chest-armor',

  LEFT_BRACELET = 'left-bracelet',
  RIGHT_BRACELET = 'right-bracelet',

  RIGHT_HAND = 'right-hand',
  LEFT_HAND = 'left-hand',

  GLOVES = 'gloves',
  LEG_ARMOR = 'leg-armor',

  LEFT_RING = 'left-ring',
  RIGHT_RING = 'right-ring',

  BOOTS = 'boots',
  BAG = 'bag',
}

/**
 * DTO pour équiper un item
 * - `slot` est optionnel pour les earrings (backend choisit automatiquement)
 * - Doit être un UUID valide pour `itemId`
 */
export class EquipItemDto {
  @IsUUID()
  itemId: string;

  @IsOptional()
  @IsEnum(EquipmentSlot)
  slot?: EquipmentSlot;
}
