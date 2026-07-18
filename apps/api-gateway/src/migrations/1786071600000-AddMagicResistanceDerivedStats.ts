import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Normalise les résistances magiques en une famille canonique UNIQUE
 * `magicResistance*` (ADR-0022 — fondation), et ajoute la globale + sacred/poison.
 *
 * Contexte : les définitions historiques `magicalResistanceFire/Water/Air/Earth`
 * (scalées Esprit, `calculatedOnly`) faisaient DOUBLON avec la famille
 * canonique. Cette migration RENOMME les 4 legacy vers leurs clés canoniques
 * (préservant intégralement leur configuration — coefficients, flags, Studio :
 * aucune valeur perdue) puis insère les 3 nouvelles (`Global/Sacred/Poison`).
 *
 * `key` est la PRIMARY KEY de `derived_stat_definition` ; audit préalable :
 * AUCUNE clé étrangère ni référence JSONB (mastery/effets/items) ne pointe vers
 * ces clés — seuls le code et la ligne elle-même les référencent. Le renommage
 * est donc sûr.
 *
 * Points de POURCENTAGE, AUCUN clamp (`minValue`/`maxValue` NULL : négatifs et
 * > 100 autorisés, ≥ 100 n'est PAS une immunité). `calculatedOnly` + aucun mode
 * de maîtrise = métadonnées Studio/maîtrise seulement — n'empêche PAS les
 * contributions génériques d'équipement/modifiers (appliquées par le pipeline
 * `RuntimeComputeEngine.resolveStat`). NON consommé par le combat (mitigation =
 * Planned). Aucune donnée de dégâts/armure/skill touchée.
 *
 * Gestion des conflits (base ayant déjà booté sur une version antérieure du lot,
 * où la clé canonique fire/water/air/earth a pu être seedée à l'état « blank ») :
 *  - la définition canonique blank (baseValue 0, aucun coefficient, sans clamp,
 *    calculatedOnly) est supprimée SI la legacy correspondante existe (sa vraie
 *    config est reprise par le renommage) — aucune config réelle perdue ;
 *  - si la canonique existe avec une config RÉELLE alors que la legacy existe
 *    aussi, le renommage (UPDATE de la PK) échoue sur violation d'unicité : la
 *    migration s'arrête explicitement plutôt que de fusionner de façon non
 *    déterministe (cf. exigence « erreur explicite plutôt que perte silencieuse »).
 *
 * IMPORTANT — en dev, `synchronize: true` crée les colonnes mais ne réinsère
 * aucune ligne : `DerivedStatsService.seedMissingDefaults()` insère les clés
 * canoniques manquantes au démarrage (idempotent). Les éventuelles lignes legacy
 * `magicalResistance*` déjà présentes en dev restent orphelines (seed non
 * destructif) tant que cette migration n'est pas jouée. Aucun exécuteur de
 * migration n'est câblé : ce fichier versionne le changement pour la prod.
 */
export class AddMagicResistanceDerivedStats1786071600000
  implements MigrationInterface
{
  name = 'AddMagicResistanceDerivedStats1786071600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Résout un doublon éventuel : supprime la définition canonique « blank »
    //    fire/water/air/earth uniquement si la legacy correspondante existe
    //    (donc porte la vraie config à reprendre). Ne touche jamais une
    //    canonique déjà configurée.
    await queryRunner.query(
      `DELETE FROM "derived_stat_definition" c
        WHERE c."key" IN ('magicResistanceFire','magicResistanceWater','magicResistanceAir','magicResistanceEarth')
          AND c."baseValue" = 0
          AND c."primaryCoefficients" = '{}'::jsonb
          AND c."minValue" IS NULL AND c."maxValue" IS NULL
          AND c."masteryEligible" = false
          AND c."runtimeStatus" = 'calculatedOnly'
          AND EXISTS (
            SELECT 1 FROM "derived_stat_definition" l
             WHERE l."key" = 'magical' || substring(c."key" from 6)
          )`,
    );

    // 2. Renomme les 4 legacy vers leurs clés canoniques (config préservée).
    //    En cas de conflit (canonique réelle déjà présente), l'UPDATE échoue sur
    //    la PK — arrêt explicite, aucune fusion silencieuse.
    await queryRunner.query(
      `UPDATE "derived_stat_definition" SET "key" = 'magicResistanceFire'  WHERE "key" = 'magicalResistanceFire'`,
    );
    await queryRunner.query(
      `UPDATE "derived_stat_definition" SET "key" = 'magicResistanceWater' WHERE "key" = 'magicalResistanceWater'`,
    );
    await queryRunner.query(
      `UPDATE "derived_stat_definition" SET "key" = 'magicResistanceAir'   WHERE "key" = 'magicalResistanceAir'`,
    );
    await queryRunner.query(
      `UPDATE "derived_stat_definition" SET "key" = 'magicResistanceEarth' WHERE "key" = 'magicalResistanceEarth'`,
    );

    // 3. Insère les définitions canoniques manquantes (installation neuve pour
    //    fire/water/air/earth AVEC leurs coefficients Esprit ; nouvelles
    //    Global/Sacred/Poison à baseValue 0). ON CONFLICT DO NOTHING : ne
    //    réécrit jamais une définition déjà présente (legacy renommée ou seedée).
    await queryRunner.query(
      `INSERT INTO "derived_stat_definition"
         ("key", "label", "category", "baseValue", "rawStatSource",
          "primaryCoefficients", "minValue", "maxValue", "displayOrder",
          "enabled", "masteryEligible", "allowedModifierModes",
          "runtimeStatus", "description")
       VALUES
         ('magicResistanceGlobal', 'Résistance magique globale', 'elemental_resistance', 0, NULL,
          '{}'::jsonb, NULL, NULL, 28, true, false, '[]'::jsonb, 'calculatedOnly',
          'Contribution commune ajoutée à la résistance effective de CHAQUE école (pas une seconde mitigation).'),
         ('magicResistanceFire', 'Résistance feu', 'elemental_resistance', 0, NULL,
          '{"spirit":0.5,"wisdom":0.2}'::jsonb, NULL, NULL, 29, true, false, '[]'::jsonb, 'calculatedOnly', NULL),
         ('magicResistanceWater', 'Résistance eau', 'elemental_resistance', 0, NULL,
          '{"spirit":0.5,"intelligence":0.2}'::jsonb, NULL, NULL, 30, true, false, '[]'::jsonb, 'calculatedOnly', NULL),
         ('magicResistanceAir', 'Résistance air', 'elemental_resistance', 0, NULL,
          '{"spirit":0.5,"agility":0.2}'::jsonb, NULL, NULL, 31, true, false, '[]'::jsonb, 'calculatedOnly', NULL),
         ('magicResistanceEarth', 'Résistance terre', 'elemental_resistance', 0, NULL,
          '{"spirit":0.5,"endurance":0.2}'::jsonb, NULL, NULL, 32, true, false, '[]'::jsonb, 'calculatedOnly', NULL),
         ('magicResistanceSacred', 'Résistance sacrée', 'elemental_resistance', 0, NULL,
          '{}'::jsonb, NULL, NULL, 33, true, false, '[]'::jsonb, 'calculatedOnly', NULL),
         ('magicResistancePoison', 'Résistance poison', 'elemental_resistance', 0, NULL,
          '{}'::jsonb, NULL, NULL, 34, true, false, '[]'::jsonb, 'calculatedOnly', NULL)
       ON CONFLICT ("key") DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Retire les définitions introduites par ce lot.
    await queryRunner.query(
      `DELETE FROM "derived_stat_definition"
        WHERE "key" IN ('magicResistanceGlobal', 'magicResistanceSacred', 'magicResistancePoison')`,
    );
    // 2. Restaure les noms legacy des 4 définitions préexistantes (config
    //    intacte — seule la clé est restaurée). Ne supprime jamais ces 4 lignes.
    await queryRunner.query(
      `UPDATE "derived_stat_definition" SET "key" = 'magicalResistanceFire'  WHERE "key" = 'magicResistanceFire'`,
    );
    await queryRunner.query(
      `UPDATE "derived_stat_definition" SET "key" = 'magicalResistanceWater' WHERE "key" = 'magicResistanceWater'`,
    );
    await queryRunner.query(
      `UPDATE "derived_stat_definition" SET "key" = 'magicalResistanceAir'   WHERE "key" = 'magicResistanceAir'`,
    );
    await queryRunner.query(
      `UPDATE "derived_stat_definition" SET "key" = 'magicalResistanceEarth' WHERE "key" = 'magicResistanceEarth'`,
    );
  }
}
