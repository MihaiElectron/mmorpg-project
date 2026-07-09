import { IsObject } from 'class-validator';

/**
 * Prévisualisation des stats (Progression V1) — POST /characters/me/stats-preview.
 *
 * `draftPrimaryStats` = valeurs FINALES souhaitées des 10 stats primaires
 * (base permanente + points en cours de répartition). Le serveur NE PERSISTE
 * RIEN : il calcule et renvoie l'aperçu via `CharacterStatsCalculator`.
 *
 * Validation fine (clés connues, entiers >= 0, cohérence avec les points
 * disponibles) faite dans le service — pas de confiance au client.
 */
export class PreviewStatsDto {
  @IsObject()
  draftPrimaryStats: Record<string, number>;
}
