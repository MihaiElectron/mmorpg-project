import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crée la table singleton `creature_secondary_coefficient_config` (V6-B2.5
 * Lot 2) : configuration serveur globale des 14 coefficients de dérivation des
 * stats secondaires créature.
 *
 * Idempotente et non destructive :
 *   - `CREATE TABLE IF NOT EXISTS` avec defaults = `DEFAULT_CREATURE_SECONDARY_COEFFICIENTS`
 *     (équilibrage V6-B2 inchangé) ;
 *   - seed du singleton `id = 1` via `INSERT … ON CONFLICT (id) DO NOTHING`
 *     (rejouable sans écraser une config existante).
 *
 * Aucune autre table touchée. En dev, `synchronize: true` crée déjà la table ;
 * ce fichier versionne le changement pour la prod (aucun runner câblé).
 */
export class AddCreatureSecondaryCoefficientConfig1785888000000 implements MigrationInterface {
  name = 'AddCreatureSecondaryCoefficientConfig1785888000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creature_secondary_coefficient_config" (
        "id" integer NOT NULL DEFAULT 1,
        "attack_power_per_strength" double precision NOT NULL DEFAULT 2,
        "defense_total_per_endurance" double precision NOT NULL DEFAULT 1,
        "accuracy_per_dexterity" double precision NOT NULL DEFAULT 0.5,
        "dodge_per_agility" double precision NOT NULL DEFAULT 0.3,
        "block_per_endurance" double precision NOT NULL DEFAULT 0.2,
        "block_per_strength" double precision NOT NULL DEFAULT 0.1,
        "block_reduction_percent" double precision NOT NULL DEFAULT 25,
        "parry_per_strength" double precision NOT NULL DEFAULT 0.15,
        "parry_per_dexterity" double precision NOT NULL DEFAULT 0.15,
        "counter_per_dexterity" double precision NOT NULL DEFAULT 0.4,
        "counter_per_agility" double precision NOT NULL DEFAULT 0.3,
        "counter_per_intelligence" double precision NOT NULL DEFAULT 0.2,
        "max_health_per_vitality" double precision NOT NULL DEFAULT 10,
        "secondary_chance_cap" double precision NOT NULL DEFAULT 40,
        CONSTRAINT "PK_creature_secondary_coefficient_config" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "creature_secondary_coefficient_config" (
        "id",
        "attack_power_per_strength", "defense_total_per_endurance", "accuracy_per_dexterity",
        "dodge_per_agility", "block_per_endurance", "block_per_strength", "block_reduction_percent",
        "parry_per_strength", "parry_per_dexterity",
        "counter_per_dexterity", "counter_per_agility", "counter_per_intelligence",
        "max_health_per_vitality", "secondary_chance_cap"
      ) VALUES (
        1,
        2, 1, 0.5,
        0.3, 0.2, 0.1, 25,
        0.15, 0.15,
        0.4, 0.3, 0.2,
        10, 40
      )
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "creature_secondary_coefficient_config"`);
  }
}
