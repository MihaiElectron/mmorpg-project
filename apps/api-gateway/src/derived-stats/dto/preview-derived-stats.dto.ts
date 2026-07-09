import { IsObject, IsOptional } from 'class-validator';

/**
 * POST admin/derived-stat-definitions/preview
 *
 * Aperçu serveur : calcule les 24 dérivées à partir de stats primaires
 * d'exemple saisies par l'admin (ou 0 par défaut), avec la config actuelle
 * OU un brouillon de définitions non sauvegardé (`draftDefinitions`). Le
 * client ne calcule jamais les dérivées — uniquement ce endpoint.
 */
export class PreviewDerivedStatsDto {
  /** Valeurs de stats primaires finales d'exemple (0 si omis). */
  @IsOptional()
  @IsObject()
  primaryStats?: Record<string, number>;

  /** Valeurs brutes Character d'exemple pour rawStatSource (0 si omis). */
  @IsOptional()
  @IsObject()
  rawStats?: { maxHealth?: number; attack?: number; defense?: number };

  /**
   * Brouillon de définitions non sauvegardées à utiliser pour la preview au
   * lieu de la config persistée — permet à l'admin de voir l'effet d'une
   * modification avant de l'appliquer. Validé comme un patch normal par
   * définition (mêmes règles que PATCH).
   */
  @IsOptional()
  @IsObject({ each: true })
  draftDefinitions?: Record<string, unknown>[];
}
