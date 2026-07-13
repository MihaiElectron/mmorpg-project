import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stats de combat avancées créature (V5-D2-A) sur `creature_template` :
 * healing_power, critical_chance, critical_damage, accuracy,
 * armor_penetration_percent.
 *
 * Non destructif et idempotent (`ADD COLUMN IF NOT EXISTS`). Défauts sûrs qui
 * PRÉSERVENT le comportement V5-B/D1 :
 *  - critical_chance / accuracy / armor_penetration_percent = 0 → aucun effet ;
 *  - critical_damage = 150 (multiplicateur total %, inerte tant que crit = 0) ;
 *  - healing_power = 0 → le runtime retombe sur attackPower (hack V5-D1 conservé,
 *    donc les soins existants ne deviennent pas nuls après migration).
 *
 * En dev, `synchronize: true` crée déjà ces colonnes ; ce fichier versionne le
 * changement pour la prod (aucun runner câblé). Aucune table joueur/skill touchée.
 */
export class AddCreatureAdvancedCombatStats1785628800000 implements MigrationInterface {
  name = 'AddCreatureAdvancedCombatStats1785628800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "creature_template"
        ADD COLUMN IF NOT EXISTS "healing_power" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "critical_chance" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "critical_damage" integer NOT NULL DEFAULT 150,
        ADD COLUMN IF NOT EXISTS "accuracy" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "armor_penetration_percent" integer NOT NULL DEFAULT 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "creature_template"
        DROP COLUMN IF EXISTS "armor_penetration_percent",
        DROP COLUMN IF EXISTS "accuracy",
        DROP COLUMN IF EXISTS "critical_damage",
        DROP COLUMN IF EXISTS "critical_chance",
        DROP COLUMN IF EXISTS "healing_power"
    `);
  }
}
