import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Promeut la dérivée `accuracy` (précision) de `calculatedOnly` vers
 * `implemented` (Combat V4-G) : elle est désormais branchée au combat — la
 * précision de l'attaquant réduit l'esquive EFFECTIVE du défenseur
 * (`effectiveDodge = clamp(dodgeChance − accuracy, 0, 100)`) — et exposée comme
 * cible de Mastery Effects.
 *
 *  - masteryEligible = true
 *  - runtimeStatus = 'implemented'
 *  - allowedModifierModes = '["percentPerLevel","flatPerLevel"]'
 *
 * `baseValue` (0), `primaryCoefficients` ({ dexterity: 0.5 }) et l'absence de
 * `maxValue` NE sont PAS touchés — la promotion ne change que les métadonnées
 * de ciblage. Non destructif, restreint à cette clé ; ne touche pas
 * dodgeChance / criticalChance / criticalDamage / armorPenetrationPercent.
 *
 * IMPORTANT — en dev, `synchronize: true` crée les colonnes mais ne réapplique
 * pas ces valeurs aux lignes déjà seedées : `DerivedStatsService`
 * (reconcileImplementedMasteryTargets) fait le même travail au démarrage.
 * Aucun exécuteur de migration n'est câblé dans ce projet : ce fichier versionne
 * le changement pour la prod, il ne s'exécute pas automatiquement.
 */
export class PromoteAccuracyAsMasteryTarget1785283200000 implements MigrationInterface {
  name = 'PromoteAccuracyAsMasteryTarget1785283200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "derived_stat_definition"
         SET "masteryEligible" = true,
             "runtimeStatus" = 'implemented',
             "allowedModifierModes" = '["percentPerLevel","flatPerLevel"]'
       WHERE "key" = 'accuracy'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "derived_stat_definition"
         SET "masteryEligible" = false,
             "runtimeStatus" = 'calculatedOnly',
             "allowedModifierModes" = '[]'
       WHERE "key" = 'accuracy'`,
    );
  }
}
