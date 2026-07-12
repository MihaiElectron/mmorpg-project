import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Branche la parade + contre-attaque (Combat V4-I) :
 *  - promeut `parryChance` (déjà existante) de `calculatedOnly` vers
 *    `implemented` + `masteryEligible` + les 2 modes (percent/flat). Ses
 *    coefficients (`strength 0.15`, `dexterity 0.15`), sa `maxValue 40` et sa
 *    catégorie `defensive` sont conservés — seules ses métadonnées de ciblage
 *    changent ;
 *  - insère la nouvelle dérivée système `counterAttackPower` si absente
 *    (`ON CONFLICT DO NOTHING`) — puissance offensive des contre-attaques
 *    déclenchées par une parade.
 *
 * Les deux deviennent des cibles permanentes de Mastery Effects. Non destructif :
 * n'écrase aucune configuration admin existante ; ne touche pas `accuracy`,
 * `dodgeChance`, `blockChance`, `blockReductionPercent`, `criticalChance`,
 * `criticalDamage`, ni `armorPenetrationPercent`.
 *
 * IMPORTANT — en dev, `synchronize: true` crée les colonnes mais ne réinsère ni
 * ne réajuste les lignes : `DerivedStatsService.seedMissingDefaults()` insère
 * `counterAttackPower` et `reconcileImplementedMasteryTargets()` promeut
 * `parryChance` au démarrage. Aucun exécuteur de migration n'est câblé : ce
 * fichier versionne le changement pour la prod, il ne s'exécute pas seul.
 */
export class AddParryAndCounterAttackAsMasteryTargets1785456000000
  implements MigrationInterface
{
  name = 'AddParryAndCounterAttackAsMasteryTargets1785456000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "derived_stat_definition"
         SET "masteryEligible" = true,
             "runtimeStatus" = 'implemented',
             "allowedModifierModes" = '["percentPerLevel","flatPerLevel"]'
       WHERE "key" = 'parryChance'`,
    );
    await queryRunner.query(
      `INSERT INTO "derived_stat_definition"
         ("key", "label", "category", "baseValue", "rawStatSource",
          "primaryCoefficients", "minValue", "maxValue", "displayOrder",
          "enabled", "masteryEligible", "allowedModifierModes",
          "runtimeStatus", "description")
       VALUES
         ('counterAttackPower', 'Puissance de contre-attaque', 'offensive', 0, NULL,
          '{"dexterity":0.4,"agility":0.3,"intelligence":0.2}'::jsonb, 0, NULL, 27,
          true, true, '["percentPerLevel","flatPerLevel"]'::jsonb,
          'implemented', 'Puissance offensive utilisée par les contre-attaques déclenchées par une parade.')
       ON CONFLICT ("key") DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "derived_stat_definition" WHERE "key" = 'counterAttackPower'`,
    );
    await queryRunner.query(
      `UPDATE "derived_stat_definition"
         SET "masteryEligible" = false,
             "runtimeStatus" = 'calculatedOnly',
             "allowedModifierModes" = '[]'
       WHERE "key" = 'parryChance'`,
    );
  }
}
