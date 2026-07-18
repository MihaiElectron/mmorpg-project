import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crée les 3 tables d'overrides de dérivation PAR CreatureTemplate (ADR-0021 —
 * sous-lot backend). Objectif : rendre les coefficients de dérivation (et les
 * paramètres scalaires) configurables par template, tout en conservant le
 * singleton global `creature_secondary_coefficient_config` comme FALLBACK.
 *
 *  - `creature_template_derived_stat_override` : marqueur (template, dérivée).
 *    Présence = coefficients contrôlés par le template ; distingue « map vide
 *    volontaire » de « pas d'override ».
 *  - `creature_template_derived_coefficient` : 0..n coefficients primaires par
 *    marqueur (FK CASCADE, unicité (override, primaire)).
 *  - `creature_template_scalar_override` : paramètres scalaires par template
 *    (blockReductionPercent, secondaryChanceCap…), générique (unicité
 *    (template, paramètre)).
 *
 * TABLES VIDES : aucune copie automatique des coefficients globaux, aucun
 * override créé. Sans override, le runtime reste STRICTEMENT identique. FK vers
 * `creature_template(id)` en CASCADE (config, pas d'audit). Réversible.
 *
 * IMPORTANT — en dev, `synchronize: true` crée ces tables au démarrage : cette
 * migration échouera alors (`already exists`). Aucun exécuteur de migration
 * n'est câblé : ce fichier versionne le changement pour la prod.
 */
export class CreateCreatureTemplateOverrideTables1786078800000
  implements MigrationInterface
{
  name = 'CreateCreatureTemplateOverrideTables1786078800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "creature_template_derived_stat_override" (
        "id"                 uuid NOT NULL DEFAULT gen_random_uuid(),
        "creatureTemplateId" integer NOT NULL,
        "derivedStatKey"     character varying(64) NOT NULL,
        CONSTRAINT "PK_ctdso" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ctdso_template_stat" UNIQUE ("creatureTemplateId", "derivedStatKey"),
        CONSTRAINT "FK_ctdso_template" FOREIGN KEY ("creatureTemplateId")
          REFERENCES "creature_template"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ctdso_template" ON "creature_template_derived_stat_override" ("creatureTemplateId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "creature_template_derived_coefficient" (
        "id"             uuid NOT NULL DEFAULT gen_random_uuid(),
        "overrideId"     uuid NOT NULL,
        "primaryStatKey" character varying(64) NOT NULL,
        "coefficient"    double precision NOT NULL,
        CONSTRAINT "PK_ctdc" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ctdc_override_primary" UNIQUE ("overrideId", "primaryStatKey"),
        CONSTRAINT "FK_ctdc_override" FOREIGN KEY ("overrideId")
          REFERENCES "creature_template_derived_stat_override"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ctdc_override" ON "creature_template_derived_coefficient" ("overrideId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "creature_template_scalar_override" (
        "id"                 uuid NOT NULL DEFAULT gen_random_uuid(),
        "creatureTemplateId" integer NOT NULL,
        "scalarParamKey"     character varying(64) NOT NULL,
        "value"              double precision NOT NULL,
        CONSTRAINT "PK_ctso" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ctso_template_param" UNIQUE ("creatureTemplateId", "scalarParamKey"),
        CONSTRAINT "FK_ctso_template" FOREIGN KEY ("creatureTemplateId")
          REFERENCES "creature_template"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ctso_template" ON "creature_template_scalar_override" ("creatureTemplateId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "creature_template_scalar_override"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "creature_template_derived_coefficient"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "creature_template_derived_stat_override"`);
  }
}
