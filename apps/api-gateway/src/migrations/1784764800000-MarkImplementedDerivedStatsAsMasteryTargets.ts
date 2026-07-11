import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marque les 10 dérivées réellement consommées par un hook runtime comme
 * cibles des Mastery Effects (V3-B). Après V3-A, les lignes existantes avaient
 * `masteryEligible=false` / `runtimeStatus='calculatedOnly'` par défaut, ce qui
 * les rendrait invisibles au nouveau `GET /admin/mastery-effect-targets`
 * (construit depuis les DerivedStatDefinition) — régression des 10 targets V2.
 *
 * Cette migration corrective, restreinte à ces 10 clés, pose :
 *   - masteryEligible = true
 *   - runtimeStatus = 'implemented'
 *   - allowedModifierModes = '["percentPerLevel","flatPerLevel"]'
 *
 * Elle ne touche AUCUNE autre dérivée (les 14 restantes gardent
 * calculatedOnly) ni aucune stat personnalisée créée depuis le Studio (leurs
 * clés ne figurent pas dans la liste). Non destructif au sens métier : elle ne
 * fait que restaurer l'exposition attendue.
 *
 * IMPORTANT — en dev, `synchronize: true` crée les colonnes mais NE réapplique
 * pas ces valeurs aux lignes déjà seedées avant V3-A : l'UPDATE ci-dessous
 * doit être joué manuellement (ou via cette migration) sur les bases peuplées.
 *
 * Aucun exécuteur de migration n'est câblé dans ce projet : ce fichier versionne
 * le changement, il ne s'exécute pas automatiquement.
 */
export class MarkImplementedDerivedStatsAsMasteryTargets1784764800000
  implements MigrationInterface
{
  name = 'MarkImplementedDerivedStatsAsMasteryTargets1784764800000';

  private static readonly KEYS = [
    'physicalAttack',
    'defense',
    'maxHealth',
    'maxMana',
    'maxEnergy',
    'healthRegen',
    'manaRegen',
    'energyRegen',
    'healingPower',
    'magicPower',
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "derived_stat_definition"
         SET "masteryEligible" = true,
             "runtimeStatus" = 'implemented',
             "allowedModifierModes" = '["percentPerLevel","flatPerLevel"]'
       WHERE "key" = ANY($1)`,
      [MarkImplementedDerivedStatsAsMasteryTargets1784764800000.KEYS],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "derived_stat_definition"
         SET "masteryEligible" = false,
             "runtimeStatus" = 'calculatedOnly',
             "allowedModifierModes" = '[]'
       WHERE "key" = ANY($1)`,
      [MarkImplementedDerivedStatsAsMasteryTargets1784764800000.KEYS],
    );
  }
}
