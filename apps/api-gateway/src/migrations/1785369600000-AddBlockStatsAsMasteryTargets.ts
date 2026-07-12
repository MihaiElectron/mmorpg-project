import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Branche le blocage (Combat V4-H) :
 *  - insère la nouvelle dérivée `blockReductionPercent` si absente
 *    (`ON CONFLICT DO NOTHING`) — % des dégâts réduits quand un blocage réussit ;
 *  - promeut `blockChance` (déjà existante) de `calculatedOnly` vers
 *    `implemented` + `masteryEligible` + les 2 modes.
 *
 * Les deux deviennent des cibles permanentes de Mastery Effects. Non destructif :
 * n'écrase aucune configuration admin d'une autre stat ; ne touche pas
 * `parryChance` (hors scope), ni dodge/accuracy/crit/armorPen. `blockChance`
 * conserve `maxValue 40` et ses coefficients ; seules ses métadonnées de ciblage
 * changent.
 *
 * IMPORTANT — en dev, `synchronize: true` crée les colonnes mais ne réinsère ni
 * ne réajuste les lignes : `DerivedStatsService.seedMissingDefaults()` insère
 * `blockReductionPercent` et `reconcileImplementedMasteryTargets()` promeut
 * `blockChance` au démarrage. Aucun exécuteur de migration n'est câblé : ce
 * fichier versionne le changement pour la prod, il ne s'exécute pas seul.
 */
export class AddBlockStatsAsMasteryTargets1785369600000 implements MigrationInterface {
  name = 'AddBlockStatsAsMasteryTargets1785369600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "derived_stat_definition"
         ("key", "label", "category", "baseValue", "rawStatSource",
          "primaryCoefficients", "minValue", "maxValue", "displayOrder",
          "enabled", "masteryEligible", "allowedModifierModes",
          "runtimeStatus", "description")
       VALUES
         ('blockReductionPercent', 'Réduction de blocage', 'defensive', 25, NULL,
          '{}'::jsonb, 0, 100, 26,
          true, true, '["percentPerLevel","flatPerLevel"]'::jsonb,
          'implemented', 'Pourcentage des dégâts restants absorbés lorsqu''un blocage réussit (physique).')
       ON CONFLICT ("key") DO NOTHING`,
    );
    await queryRunner.query(
      `UPDATE "derived_stat_definition"
         SET "masteryEligible" = true,
             "runtimeStatus" = 'implemented',
             "allowedModifierModes" = '["percentPerLevel","flatPerLevel"]'
       WHERE "key" = 'blockChance'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "derived_stat_definition"
         SET "masteryEligible" = false,
             "runtimeStatus" = 'calculatedOnly',
             "allowedModifierModes" = '[]'
       WHERE "key" = 'blockChance'`,
    );
    await queryRunner.query(
      `DELETE FROM "derived_stat_definition" WHERE "key" = 'blockReductionPercent'`,
    );
  }
}
