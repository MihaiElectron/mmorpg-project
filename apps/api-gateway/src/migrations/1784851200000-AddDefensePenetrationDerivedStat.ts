import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute la stat dérivée SYSTÈME `defensePenetration` (V4-A) — premier hook
 * gameplay branché sur la chaîne Stats secondaires → Mastery Effects → combat.
 *
 * Stat offensive : réduit la défense effective de la cible lors des dégâts
 * physiques (`effectiveDefense = max(0, targetDefense - defensePenetration)`).
 * masteryEligible + runtimeStatus 'implemented' + les 2 modes → exposée comme
 * cible des Mastery Effects (`GET /admin/mastery-effect-targets`).
 *
 * Insertion NON destructive : `ON CONFLICT (key) DO NOTHING` — n'écrase jamais
 * une ligne existante (aucune stat custom Studio n'utilise cette clé système).
 *
 * IMPORTANT — en dev, `synchronize: true` crée/ajuste les colonnes mais ne
 * réinsère aucune ligne : `DerivedStatsService.seedMissingDefaults()` insère la
 * définition au démarrage. Aucun exécuteur de migration n'est câblé dans ce
 * projet : ce fichier versionne le changement pour la prod, il ne s'exécute pas
 * automatiquement.
 */
export class AddDefensePenetrationDerivedStat1784851200000 implements MigrationInterface {
  name = 'AddDefensePenetrationDerivedStat1784851200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "derived_stat_definition"
         ("key", "label", "category", "baseValue", "rawStatSource",
          "primaryCoefficients", "minValue", "maxValue", "displayOrder",
          "enabled", "masteryEligible", "allowedModifierModes",
          "runtimeStatus", "description")
       VALUES
         ('defensePenetration', 'Pénétration de défense', 'offensive', 0, NULL,
          '{}'::jsonb, 0, NULL, 25,
          true, true, '["percentPerLevel","flatPerLevel"]'::jsonb,
          'implemented', 'Réduit la défense effective de la cible lors des dégâts physiques.')
       ON CONFLICT ("key") DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "derived_stat_definition" WHERE "key" = 'defensePenetration'`,
    );
  }
}
