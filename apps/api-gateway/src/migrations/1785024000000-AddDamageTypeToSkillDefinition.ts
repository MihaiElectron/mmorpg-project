import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute le type de dégâts configurable sur `skill_definition` (Combat V4-B).
 * `damageType` ∈ {`physical`, `raw`}, défaut `physical` :
 *  - `physical` applique l'armure de la cible + `armorPenetrationPercent` ;
 *  - `raw` ignore armure et pénétration.
 * Pertinent uniquement pour `effectType: 'damage'`.
 *
 * Non destructif : ADD COLUMN NOT NULL DEFAULT 'physical' → les skills
 * existants sont backfillés à `physical` (comportement inchangé). CHECK simple
 * pour interdire toute autre valeur.
 *
 * IMPORTANT — en dev, cette colonne est déjà créée par `synchronize: true` au
 * premier démarrage : cette migration échouera alors (`column already exists`).
 * Vérifier l'état réel de la base cible avant toute exécution.
 *
 * Aucun exécuteur de migration n'est câblé dans ce projet : ce fichier versionne
 * le changement, il ne s'exécute pas automatiquement.
 */
export class AddDamageTypeToSkillDefinition1785024000000 implements MigrationInterface {
  name = 'AddDamageTypeToSkillDefinition1785024000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD COLUMN "damageType" character varying(16) NOT NULL DEFAULT 'physical'`,
    );
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD CONSTRAINT "chk_skill_damage_type" CHECK ("damageType" IN ('physical', 'raw'))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "skill_definition" DROP CONSTRAINT "chk_skill_damage_type"`,
    );
    await queryRunner.query(`ALTER TABLE "skill_definition" DROP COLUMN "damageType"`);
  }
}
