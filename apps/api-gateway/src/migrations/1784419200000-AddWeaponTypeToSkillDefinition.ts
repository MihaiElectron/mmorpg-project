import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute le lien explicite skill → type d'arme sur `skill_definition`
 * (Masteries V1-D-Skills-A). Non destructif : ADD COLUMN uniquement. Les
 * skills existants restent à NULL (non liés à une arme — jamais de bonus de
 * maîtrise d'arme).
 *
 * `weaponType` = même contrat string libre que `item.weaponType`
 * (`two_handed_sword`, `bow`…), normalisé/validé par `ActiveSkillsService`.
 * Déclaratif en V1-D-Skills-A : aucun bonus appliqué, l'arme n'est pas
 * requise pour caster (branchement prévu en V1-D-Skills-B).
 *
 * IMPORTANT — en dev, cette colonne est déjà créée par `synchronize: true` au
 * premier démarrage : cette migration échouera alors (`column already exists`).
 * Vérifier l'état réel de la base cible avant toute exécution.
 *
 * Aucun exécuteur de migration n'est câblé dans ce projet : ce fichier versionne
 * le changement, il ne s'exécute pas automatiquement.
 */
export class AddWeaponTypeToSkillDefinition1784419200000 implements MigrationInterface {
  name = 'AddWeaponTypeToSkillDefinition1784419200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD COLUMN "weaponType" character varying(64) DEFAULT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "skill_definition" DROP COLUMN "weaponType"`);
  }
}
