import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute le flag `canCrit` sur `skill_definition` (règle canonique du critique).
 *
 * Un critique n'est possible QUE pour un skill à DÉGÂTS PHYSIQUES avec
 * `canCrit: true` ; magic, raw et les effets non dommageants ne critiquent
 * JAMAIS (serveur-autoritaire, `effectiveCanCrit` dans le pipeline combat).
 *
 * Non destructif : ADD COLUMN NOT NULL DEFAULT false, puis BACKFILL des skills
 * de DÉGÂTS PHYSIQUES existants à `true` (préserve leur capacité à critiquer,
 * comportement historique). Les skills magic / raw / soin restent `false`.
 *
 * IMPORTANT — en dev, la colonne est déjà créée par `synchronize: true` au
 * premier démarrage : cette migration échouera alors (`column already exists`).
 * Le backfill reste utile pour aligner les lignes existantes (à jouer
 * manuellement si besoin). Aucun exécuteur de migration n'est câblé : ce fichier
 * versionne le changement, il ne s'exécute pas automatiquement. NON exécutée sur
 * la base utilisateur.
 */
export class AddCanCritToSkillDefinition1786161600000 implements MigrationInterface {
  name = 'AddCanCritToSkillDefinition1786161600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD COLUMN "canCrit" boolean NOT NULL DEFAULT false`,
    );
    // Backfill : les dégâts physiques existants conservent la capacité de critique.
    await queryRunner.query(
      `UPDATE "skill_definition" SET "canCrit" = true WHERE "effectType" = 'damage' AND "damageType" = 'physical'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "skill_definition" DROP COLUMN "canCrit"`);
  }
}
