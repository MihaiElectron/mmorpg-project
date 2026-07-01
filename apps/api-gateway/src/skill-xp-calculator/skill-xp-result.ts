/**
 * Résultat retourné par calculateSkillXp.
 *
 * Pas de persistance. Pas de PlayerSkill.
 * L'appelant est responsable de passer ce résultat à SkillsService.applySkillXpInTx.
 */
export interface SkillXpResult {
  /** Clé de la SkillDefinition qui doit recevoir l'XP (correspond à SkillDefinition.key). */
  skillDefinitionKey: string;

  /** Montant d'XP à accorder. Toujours >= 1. */
  xpAmount: number;
}
