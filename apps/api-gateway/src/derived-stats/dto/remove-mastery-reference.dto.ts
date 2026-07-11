import { IsInt, IsString, Matches, Min } from 'class-validator';

/**
 * Payload du retrait d'un modifier d'effet de maîtrise ciblant une stat
 * dérivée (POST /admin/derived-stat-definitions/:key/remove-mastery-reference,
 * V3 maintenance).
 */
export class RemoveMasteryReferenceDto {
  @IsString()
  @Matches(/^[a-z0-9_]+$/, {
    message: 'masteryKey doit être en minuscules, chiffres ou underscore ([a-z0-9_]).',
  })
  masteryKey: string;

  @IsInt()
  @Min(0)
  modifierIndex: number;
}
