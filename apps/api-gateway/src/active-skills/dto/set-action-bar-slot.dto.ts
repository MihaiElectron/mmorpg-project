import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Corps de `PUT /characters/me/action-bar/slots/:slotIndex` (Skills V1-I).
 *
 * `{ "skillKey": "test_heal" }` équipe un skill ; `{ "skillKey": null }` vide le
 * slot. `@IsOptional` ignore null/undefined (→ vidage) ; une chaîne doit être
 * non vide. Le ValidationPipe global (whitelist + forbidNonWhitelisted) rejette
 * tout champ inconnu. Le personnage et le slotIndex viennent de la route/JWT,
 * jamais du corps.
 */
export class SetActionBarSlotDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  skillKey?: string | null;
}
