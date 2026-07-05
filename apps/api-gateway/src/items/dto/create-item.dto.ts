import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
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

  // Rayon d'attaque legacy en pixels. Optionnel : absent = portée par défaut
  // serveur. Si fourni, doit être un entier >= 1 (range 0 rendait le combat
  // inutilisable : portée effective 0 WU).
  @IsInt()
  @Min(1)
  @IsOptional()
  range?: number;

  @IsString()
  @IsOptional()
  weaponType?: string | null;

  @IsEnum(EquipmentSlot)
  @IsOptional()
  slot?: EquipmentSlot;

  @IsEnum(ObjectMode)
  @IsOptional()
  objectMode?: ObjectMode;
}
