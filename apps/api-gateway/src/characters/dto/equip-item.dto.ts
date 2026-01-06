/**
 * EquipItemDto
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Représente les données envoyées lorsqu’un joueur équipe un item dans un slot.
 * - Utilisé par l’endpoint POST /characters/equip (MVP).
 *
 * Emplacement :
 * apps/api-gateway/src/characters/dto/equip-item.dto.ts
 *
 * Champs :
 * - slot   : type d’emplacement (enum EquipmentSlot)
 * - itemId : identifiant de l’item à équiper
 *
 * Remarques :
 * - Swagger nécessite @ApiProperty pour afficher correctement les champs.
 * - La validation est assurée par class-validator.
 * - itemId est un simple identifiant numérique ; la logique métier
 *   (vérification de l’inventaire, compatibilité du slot, etc.)
 *   sera gérée dans le service.
 * -----------------------------------------------------------------------------
 */

import { IsEnum, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EquipmentSlot } from '../enums/equipment-slot.enum';

export class EquipItemDto {
  @ApiProperty({
    enum: EquipmentSlot,
    description: 'Slot dans lequel équiper l’item (HEAD, CHEST, LEGS, etc.)',
  })
  @IsEnum(EquipmentSlot)
  slot: EquipmentSlot;

  @ApiProperty({
    type: Number,
    description: 'Identifiant de l’item à équiper',
    example: 101,
  })
  @IsNumber()
  itemId: number;
}
