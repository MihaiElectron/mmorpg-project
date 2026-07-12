import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Promeut la dérivée `dodgeChance` (esquive) de `calculatedOnly` vers
 * `implemented` (Combat V4-F) : elle est désormais branchée au combat (hit
 * avoidance, avant le bloc attaque) et exposée comme cible de Mastery Effects.
 *
 *  - masteryEligible = true
 *  - runtimeStatus = 'implemented'
 *  - allowedModifierModes = '["percentPerLevel","flatPerLevel"]'
 *
 * `baseValue`, `maxValue` (40) et `primaryCoefficients` ({ agility: 0.3 }) NE
 * sont PAS touchés — la promotion ne change que les métadonnées de ciblage.
 * Non destructif, restreint à cette clé ; ne touche pas criticalChance/
 * criticalDamage/armorPenetrationPercent.
 *
 * IMPORTANT — en dev, `synchronize: true` crée les colonnes mais ne réapplique
 * pas ces valeurs aux lignes déjà seedées : `DerivedStatsService`
 * (reconcileImplementedMasteryTargets) fait le même travail au démarrage.
 * Aucun exécuteur de migration n'est câblé dans ce projet : ce fichier versionne
 * le changement pour la prod, il ne s'exécute pas automatiquement.
 */
export class PromoteDodgeChanceAsMasteryTarget1785196800000 implements MigrationInterface {
  name = 'PromoteDodgeChanceAsMasteryTarget1785196800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "derived_stat_definition"
         SET "masteryEligible" = true,
             "runtimeStatus" = 'implemented',
             "allowedModifierModes" = '["percentPerLevel","flatPerLevel"]'
       WHERE "key" = 'dodgeChance'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "derived_stat_definition"
         SET "masteryEligible" = false,
             "runtimeStatus" = 'calculatedOnly',
             "allowedModifierModes" = '[]'
       WHERE "key" = 'dodgeChance'`,
    );
  }
}
