import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute les effets contextuels configurables sur `mastery_definition`
 * (Masteries V1-D-A). Non destructif : ADD COLUMN uniquement. Les définitions
 * existantes prennent '{}' (aucun effet — comportement inchangé).
 *
 * `effects` = effets en pourcentage par niveau de maîtrise, validés serveur
 * par `sanitizeMasteryEffects` (V1 : `context.weaponType` +
 * `combat.damagePercentPerLevel` uniquement). Calcul serveur via
 * `computeCombatMasteryEffects` — non branché au combat en V1-D-A.
 *
 * IMPORTANT — en dev, cette colonne est déjà créée par `synchronize: true` au
 * premier démarrage : cette migration échouera alors (`column already exists`).
 * Vérifier l'état réel de la base cible avant toute exécution.
 *
 * Aucun exécuteur de migration n'est câblé dans ce projet : ce fichier versionne
 * le changement, il ne s'exécute pas automatiquement.
 */
export class AddEffectsToMasteryDefinition1784332800000 implements MigrationInterface {
  name = 'AddEffectsToMasteryDefinition1784332800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mastery_definition" ADD COLUMN "effects" jsonb NOT NULL DEFAULT '{}'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mastery_definition" DROP COLUMN "effects"`);
  }
}
