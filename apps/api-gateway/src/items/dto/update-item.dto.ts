import { IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
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

  // ── Équipement V1-C-A ──────────────────────────────────────────────────────
  // Forme « objet » validée ici ; contenu nettoyé (whitelist) côté service.

  /** Bonus de stats primaires (ex: { strength: 5 }). Sanitizé au service. */
  @IsOptional()
  @IsObject()
  statBonuses?: Record<string, number>;

  /** Niveau minimum requis (entier >= 1). */
  @IsOptional()
  @IsInt()
  @Min(1)
  requiredLevel?: number;

  /** Classe requise (informatif, non appliqué en V1). null accepté. */
  @IsOptional()
  @IsString()
  requiredClass?: string | null;

  /** Maîtrises requises (ex: { woodcutting: 2 }). Sanitizé au service. */
  @IsOptional()
  @IsObject()
  requiredMasteries?: Record<string, number>;
}
