import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ObjectMode } from '../entities/item.entity';
import { EquipmentSlot } from '../../characters/dto/equip-item.dto';

export class CreateItemDto {
  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsString()
  category: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsNumber()
  @IsOptional()
  attack?: number;

  @IsNumber()
  @IsOptional()
  defense?: number;

  @IsNumber()
  @IsOptional()
  range?: number;

  @IsEnum(EquipmentSlot)
  @IsOptional()
  slot?: EquipmentSlot;

  @IsEnum(ObjectMode)
  @IsOptional()
  objectMode?: ObjectMode;
}
