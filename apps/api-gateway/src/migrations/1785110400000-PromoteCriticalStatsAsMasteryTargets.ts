import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Promeut les dérivées critiques `criticalChance` / `criticalDamage` de
 * `calculatedOnly` vers `implemented` (Combat V4-D) : elles sont désormais
 * branchées au combat (bloc attaque) et exposées comme cibles de Mastery
 * Effects.
 *
 *  - masteryEligible = true
 *  - runtimeStatus = 'implemented'
 *  - allowedModifierModes = '["percentPerLevel","flatPerLevel"]'
 *
 * `baseValue` (criticalChance 0 / criticalDamage 150) et `maxValue`
 * (criticalChance 50) NE sont PAS touchés — la promotion ne change que les
 * métadonnées de ciblage. Non destructif, restreint à ces 2 clés.
 *
 * IMPORTANT — en dev, `synchronize: true` crée les colonnes mais ne réapplique
 * pas ces valeurs aux lignes déjà seedées : `DerivedStatsService`
 * (reconcileImplementedMasteryTargets) fait le même travail au démarrage.
 * Aucun exécuteur de migration n'est câblé dans ce projet : ce fichier versionne
 * le changement pour la prod, il ne s'exécute pas automatiquement.
 */
export class PromoteCriticalStatsAsMasteryTargets1785110400000 implements MigrationInterface {
  name = 'PromoteCriticalStatsAsMasteryTargets1785110400000';

  private static readonly KEYS = ['criticalChance', 'criticalDamage'];

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "derived_stat_definition"
         SET "masteryEligible" = true,
             "runtimeStatus" = 'implemented',
             "allowedModifierModes" = '["percentPerLevel","flatPerLevel"]'
       WHERE "key" = ANY($1)`,
      [PromoteCriticalStatsAsMasteryTargets1785110400000.KEYS],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "derived_stat_definition"
         SET "masteryEligible" = false,
             "runtimeStatus" = 'calculatedOnly',
             "allowedModifierModes" = '[]'
       WHERE "key" = ANY($1)`,
      [PromoteCriticalStatsAsMasteryTargets1785110400000.KEYS],
    );
  }
}
