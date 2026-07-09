/**
 * Résultat retourné par calculateMasteryXp.
 *
 * Pas de persistance. Pas de PlayerMastery.
 * L'appelant est responsable de passer ce résultat à MasteriesService.applyMasteryXpInTx.
 */
export interface MasteryXpResult {
  /** Clé de la MasteryDefinition qui doit recevoir l'XP (correspond à MasteryDefinition.key). */
  masteryDefinitionKey: string;

  /** Montant d'XP à accorder. Toujours >= 1. */
  xpAmount: number;
}
