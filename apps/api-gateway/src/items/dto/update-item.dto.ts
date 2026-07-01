import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
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

  @IsOptional()
  @IsNumber()
  range?: number;

  @IsOptional()
  @IsEnum(EquipmentSlot)
  slot?: EquipmentSlot;

  @IsOptional()
  @IsEnum(ObjectMode)
  objectMode?: ObjectMode;
}
