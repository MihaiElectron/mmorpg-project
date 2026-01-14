import { IsUUID, IsInt, Min, IsOptional, IsBoolean } from 'class-validator';

export class CreateInventoryDto {
  @IsUUID()
  characterId: string;

  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsBoolean()
  equipped?: boolean;
}
