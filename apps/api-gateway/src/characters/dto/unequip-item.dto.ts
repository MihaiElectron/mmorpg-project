/**
 * UnequipItemDto
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Représente les données nécessaires pour déséquiper un item.
 * - Utilisé par CharactersController (POST /characters/unequip).
 * -----------------------------------------------------------------------------
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { EquipmentSlot } from '../enums/equipment-slot.enum';

export class UnequipItemDto {
  @ApiProperty({
    description: 'Slot à déséquiper',
    enum: EquipmentSlot,
  })
  @IsEnum(EquipmentSlot)
  slot: EquipmentSlot;
}
