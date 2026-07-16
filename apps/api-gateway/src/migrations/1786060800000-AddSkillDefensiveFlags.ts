import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute les flags défensifs par skill sur `skill_definition` (Lot A).
 * Serveur-autoritaires — décident si le défenseur peut esquiver/bloquer/parer
 * le skill :
 *  - `canBeDodged`  : défaut `true`  (esquive autorisée) ;
 *  - `canBeBlocked` : défaut `true`  (blocage autorisé) ;
 *  - `canBeParried` : défaut `false` (parade DÉSACTIVÉE — un skill n'est parable
 *    que si explicitement activé, préservant l'impact des skills).
 *
 * Non destructif : ADD COLUMN NOT NULL DEFAULT → les skills existants sont
 * backfillés (esquive/blocage conservés, parade off). Aucun effet combat à cette
 * étape (le branchement pipeline arrive en Lot B).
 *
 * IMPORTANT — en dev, ces colonnes sont déjà créées par `synchronize: true` au
 * premier démarrage : cette migration échouera alors (`column already exists`).
 * Vérifier l'état réel de la base cible avant toute exécution.
 *
 * Aucun exécuteur de migration n'est câblé dans ce projet : ce fichier versionne
 * le changement, il ne s'exécute pas automatiquement.
 */
export class AddSkillDefensiveFlags1786060800000 implements MigrationInterface {
  name = 'AddSkillDefensiveFlags1786060800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD COLUMN "canBeDodged" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD COLUMN "canBeBlocked" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD COLUMN "canBeParried" boolean NOT NULL DEFAULT false`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "skill_definition" DROP COLUMN "canBeParried"`);
    await queryRunner.query(`ALTER TABLE "skill_definition" DROP COLUMN "canBeBlocked"`);
    await queryRunner.query(`ALTER TABLE "skill_definition" DROP COLUMN "canBeDodged"`);
  }
}
