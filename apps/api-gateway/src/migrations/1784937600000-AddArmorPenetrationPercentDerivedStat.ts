import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remplace la pénétration PLATE `defensePenetration` (V4-A initial, obsolète)
 * par la pénétration d'armure en POURCENTAGE `armorPenetrationPercent`.
 *
 * Décision gameplay : une pénétration en % pénalise davantage les cibles très
 * armurées (tanks) et peu les cibles légères — comportement voulu —, alors
 * qu'une pénétration plate faisait l'inverse.
 *
 * NON destructif :
 *  - insère `armorPenetrationPercent` si absente (`ON CONFLICT DO NOTHING`) ;
 *  - **conserve** la ligne `defensePenetration` si elle existe, mais la RETIRE
 *    des cibles de maîtrise (masteryEligible=false, runtimeStatus='calculatedOnly',
 *    aucun mode) pour ne jamais exposer les deux stats simultanément.
 *
 * IMPORTANT — en dev, `synchronize: true` crée/ajuste les colonnes mais ne
 * réinsère aucune ligne : `DerivedStatsService.seedMissingDefaults()` +
 * `demoteLegacyDefensePenetration()` font le même travail au démarrage. Aucun
 * exécuteur de migration n'est câblé dans ce projet : ce fichier versionne le
 * changement pour la prod, il ne s'exécute pas automatiquement.
 */
export class AddArmorPenetrationPercentDerivedStat1784937600000 implements MigrationInterface {
  name = 'AddArmorPenetrationPercentDerivedStat1784937600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "derived_stat_definition"
         ("key", "label", "category", "baseValue", "rawStatSource",
          "primaryCoefficients", "minValue", "maxValue", "displayOrder",
          "enabled", "masteryEligible", "allowedModifierModes",
          "runtimeStatus", "description")
       VALUES
         ('armorPenetrationPercent', 'Pénétration d''armure', 'offensive', 0, NULL,
          '{}'::jsonb, 0, 100, 25,
          true, true, '["percentPerLevel","flatPerLevel"]'::jsonb,
          'implemented', 'Ignore un pourcentage de l''armure de la cible lors des dégâts physiques.')
       ON CONFLICT ("key") DO NOTHING`,
    );

    // Démote l'ancienne pénétration plate (conservée mais retirée des targets).
    await queryRunner.query(
      `UPDATE "derived_stat_definition"
         SET "masteryEligible" = false,
             "runtimeStatus" = 'calculatedOnly',
             "allowedModifierModes" = '[]'::jsonb
       WHERE "key" = 'defensePenetration'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Restaure l'ancienne pénétration comme cible et retire la nouvelle.
    await queryRunner.query(
      `UPDATE "derived_stat_definition"
         SET "masteryEligible" = true,
             "runtimeStatus" = 'implemented',
             "allowedModifierModes" = '["percentPerLevel","flatPerLevel"]'::jsonb
       WHERE "key" = 'defensePenetration'`,
    );
    await queryRunner.query(
      `DELETE FROM "derived_stat_definition" WHERE "key" = 'armorPenetrationPercent'`,
    );
  }
}
