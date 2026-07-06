import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class InventorySlotAssignmentDto {
  /** "stack" = ligne Inventory ; "instance" = ItemInstance. */
  @IsIn(['stack', 'instance'])
  kind: 'stack' | 'instance';

  /** UUID de la ligne Inventory (stack) ou de l'ItemInstance (instance). */
  @IsUUID()
  id: string;

  /** Position absolue dans la grille (>= 0). */
  @IsInt()
  @Min(0)
  slotIndex: number;
}

export class UpdateInventorySlotsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InventorySlotAssignmentDto)
  entries: InventorySlotAssignmentDto[];
}
