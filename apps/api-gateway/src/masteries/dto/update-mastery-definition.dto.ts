import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Patch partiel d'une MasteryDefinition (PATCH /admin/mastery-definitions/:key).
 *
 * `key` volontairement absente : la clé est IMMUABLE après création — elle est
 * référencée en copie string par skills.requiredMasteries, items.requiredMasteries,
 * crafting_recipe.requiredMasteryKey et par player_mastery (FK). Le ValidationPipe
 * global (forbidNonWhitelisted) rejette donc toute tentative de rename en 400.
 *
 * Retrait du jeu : PATCH { enabled: false } (disable-only, réversible) — aucun
 * DELETE physique en V1-C.
 */
export class UpdateMasteryDefinitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  baseXpPerLevel?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(10)
  xpCurveExponent?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
