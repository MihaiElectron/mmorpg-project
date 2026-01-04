/**
 * EquipItemDto
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Valide les données envoyées lorsqu’un joueur équipe un item dans un slot.
 * - Utilisé par l’endpoint POST /characters/:id/equip.
 *
 * Emplacement :
 * mmorpg-project/apps/api-gateway/src/characters/dto/equip-item.dto.ts
 *
 * Champs :
 * - slot   : type d’emplacement (enum EquipmentSlot)
 * - itemId : identifiant de l’item à équiper
 *
 * Remarques :
 * - La validation est assurée par class-validator.
 * - itemId est un nombre simple : la logique métier sera gérée dans le service.
 * -----------------------------------------------------------------------------
 */

import { IsEnum, IsNumber } from 'class-validator';
import { EquipmentSlot } from '../enums/equipment-slot.enum';

export class EquipItemDto {
  @IsEnum(EquipmentSlot)
  slot: EquipmentSlot;

  @IsNumber()
  itemId: number;
}
