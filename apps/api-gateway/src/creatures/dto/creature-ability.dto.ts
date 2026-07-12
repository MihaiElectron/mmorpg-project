import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Capacité d'un CreatureTemplate enrichie du catalogue skill (V5-A, lecture).
 * Le serveur est la source : le Studio n'invente jamais le nom/kind du skill.
 */
export type CreatureAbilityDto = {
  skillKey: string;
  enabled: boolean;
  displayOrder: number;
  /** Nom lisible du skill (skill_definition.name), null si la clé n'existe plus. */
  skillName: string | null;
  /** active | passive | aura — null si la clé n'existe plus au catalogue. */
  skillKind: string | null;
  /** true si le skill est activé au catalogue (skill_definition.enabled). */
  skillEnabled: boolean | null;
  /** V5-C3-A : métadonnées lecture seule du SkillDefinition lié (null si orphelin). */
  effectType: string | null;
  damageType: string | null;
  rangeWU: number | null;
  cooldownMs: number | null;
  /** true si `skillKey` est absent du catalogue (référence orpheline). */
  missing: boolean;
};

/** Une entrée d'entrée pour le remplacement de liste (PUT). */
export class CreatureAbilityInputDto {
  @IsString()
  @Matches(/^[a-z0-9_]+$/, {
    message: 'skillKey doit être en minuscules, chiffres ou underscore ([a-z0-9_]).',
  })
  skillKey: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

/** Corps de `PUT /admin/templates/:key/abilities` — remplace toute la liste. */
export class ReplaceCreatureAbilitiesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatureAbilityInputDto)
  abilities: CreatureAbilityInputDto[];
}
