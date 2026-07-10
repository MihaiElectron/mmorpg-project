import { IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
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

  // ── Équipement V1-C-A ──────────────────────────────────────────────────────
  // Le contenu (clés/valeurs) est validé et NETTOYÉ côté service (whitelist).
  // Le DTO ne garantit ici que la forme « objet » ; le serveur reste autoritaire.

  /** Bonus de stats primaires (ex: { strength: 5 }). Sanitizé au service. */
  @IsObject()
  @IsOptional()
  statBonuses?: Record<string, number>;

  /** Niveau minimum requis (entier >= 1). Absent → défaut entity (1). */
  @IsInt()
  @Min(1)
  @IsOptional()
  requiredLevel?: number;

  /** Classe requise (informatif, non appliqué en V1). null accepté. */
  @IsString()
  @IsOptional()
  requiredClass?: string | null;

  /** Maîtrises requises (ex: { woodcutting: 2 }). Sanitizé au service. */
  @IsObject()
  @IsOptional()
  requiredMasteries?: Record<string, number>;
}
