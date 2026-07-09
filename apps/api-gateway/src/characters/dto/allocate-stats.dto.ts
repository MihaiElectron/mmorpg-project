import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Points à ajouter aux stats principales (Progression V1).
 * Toutes optionnelles, entières, >= 0. Le service valide la somme totale
 * contre `unspentStatPoints` et refuse une somme nulle.
 */
export class AllocateStatsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  strength?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  vitality?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  endurance?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  agility?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dexterity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  intelligence?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  wisdom?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  spirit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  willpower?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  charisma?: number;
}
