import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute les métadonnées Studio « Stats secondaires » sur
 * `derived_stat_definition` (V3-A). Non destructif : ADD COLUMN uniquement,
 * les définitions existantes prennent les valeurs par défaut :
 *   - masteryEligible false        (pas ciblable par les Mastery Effects)
 *   - allowedModifierModes '[]'    (aucun mode autorisé)
 *   - runtimeStatus 'calculatedOnly'
 *   - description NULL
 *
 * Ces champs sont purement informatifs/configuration en V3-A (aucun hook
 * gameplay) ; ils prépareront l'alimentation de
 * `GET /admin/mastery-effect-targets` en V3-B.
 *
 * IMPORTANT — en dev, ces colonnes sont déjà créées par `synchronize: true` au
 * premier démarrage : cette migration échouera alors (`column already exists`).
 * Vérifier l'état réel de la base cible avant toute exécution.
 *
 * Aucun exécuteur de migration n'est câblé dans ce projet : ce fichier versionne
 * le changement, il ne s'exécute pas automatiquement.
 */
export class AddStudioFieldsToDerivedStatDefinition1784678400000 implements MigrationInterface {
  name = 'AddStudioFieldsToDerivedStatDefinition1784678400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "derived_stat_definition" ADD COLUMN "masteryEligible" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "derived_stat_definition" ADD COLUMN "allowedModifierModes" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "derived_stat_definition" ADD COLUMN "runtimeStatus" character varying(32) NOT NULL DEFAULT 'calculatedOnly'`,
    );
    await queryRunner.query(
      `ALTER TABLE "derived_stat_definition" ADD COLUMN "description" text DEFAULT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "derived_stat_definition" DROP COLUMN "description"`);
    await queryRunner.query(`ALTER TABLE "derived_stat_definition" DROP COLUMN "runtimeStatus"`);
    await queryRunner.query(`ALTER TABLE "derived_stat_definition" DROP COLUMN "allowedModifierModes"`);
    await queryRunner.query(`ALTER TABLE "derived_stat_definition" DROP COLUMN "masteryEligible"`);
  }
}
