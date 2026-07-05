import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ObjectMode } from '../entities/item.entity';
import { EquipmentSlot } from '../../characters/dto/equip-item.dto';

export class UpdateItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsNumber()
  attack?: number;

  @IsOptional()
  @IsNumber()
  defense?: number;

  // Voir CreateItemDto.range : entier >= 1 si fourni, sinon défaut serveur.
  @IsOptional()
  @IsInt()
  @Min(1)
  range?: number;

  @IsOptional()
  @IsString()
  weaponType?: string | null;

  @IsOptional()
  @IsEnum(EquipmentSlot)
  slot?: EquipmentSlot;

  @IsOptional()
  @IsEnum(ObjectMode)
  objectMode?: ObjectMode;
}
