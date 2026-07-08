import { Equals, IsBoolean } from 'class-validator';

/**
 * Confirmation explicite requise pour l'action destructive de recalcul global
 * des points de stats (ADR-0018 §1, Étape 1B).
 *
 * `confirm` doit être exactement `true` — un payload vide, `false`, ou un
 * champ absent rejette la requête. Empêche tout déclenchement accidentel
 * depuis le Studio ou un appel HTTP direct.
 */
export class RecalculateCharacterStatPointsDto {
  @IsBoolean()
  @Equals(true, { message: 'confirm doit être exactement true pour confirmer cette action destructive.' })
  confirm: boolean;
}
