/**
 * Calcul pur du taux de succès d'un craft.
 *
 * Aucune dépendance NestJS, aucun accès DB, aucun effet de bord : la fonction
 * reçoit des paramètres explicites (jamais un objet Recipe/Job complet) pour
 * rester indépendante du modèle de données. Utilisée par
 * `CraftJobService.complete()` sur le snapshot immuable du job.
 *
 * Formule : `clamp(baseSuccessRate + (skillLevel − requiredSkillLevel) ×
 * successBonusPerLevel, minSuccessRate, maxSuccessRate)`.
 */
export interface CraftSuccessRateParams {
  baseSuccessRate: number;
  successBonusPerLevel: number;
  minSuccessRate: number;
  maxSuccessRate: number;
  requiredSkillLevel: number;
  skillLevel: number;
}

export function computeCraftSuccessRate(params: CraftSuccessRateParams): number {
  const raw =
    params.baseSuccessRate +
    (params.skillLevel - params.requiredSkillLevel) * params.successBonusPerLevel;
  return Math.min(params.maxSuccessRate, Math.max(params.minSuccessRate, raw));
}
