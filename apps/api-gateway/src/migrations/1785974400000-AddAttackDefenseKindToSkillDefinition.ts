import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute la nature défensive de l'attaque sur `skill_definition` (V6-B5 Lot 1).
 * `attackDefenseKind` ∈ {`physical`, `magic`}, défaut `physical` :
 *  - `physical` : attaque parable (mêlée ou distance), pipeline défensif physique ;
 *  - `magic` : sort pur non parable (futur pipeline résistances magiques).
 *
 * AXE DISTINCT de `damageType` (physical/raw = mitigation d'armure) : les deux
 * cohabitent. Aucun effet combat en Lot 1 (donnée seule, base de la parade V6-B6).
 *
 * Non destructif : ADD COLUMN NOT NULL DEFAULT 'physical' → les skills existants
 * sont backfillés à `physical` (comportement inchangé). CHECK simple pour
 * interdire toute autre valeur (même pattern que `chk_skill_damage_type`).
 *
 * IMPORTANT — en dev, cette colonne est déjà créée par `synchronize: true` au
 * premier démarrage : cette migration échouera alors (`column already exists`).
 * Vérifier l'état réel de la base cible avant toute exécution.
 *
 * Aucun exécuteur de migration n'est câblé dans ce projet : ce fichier versionne
 * le changement, il ne s'exécute pas automatiquement.
 */
export class AddAttackDefenseKindToSkillDefinition1785974400000 implements MigrationInterface {
  name = 'AddAttackDefenseKindToSkillDefinition1785974400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD COLUMN "attackDefenseKind" character varying(16) NOT NULL DEFAULT 'physical'`,
    );
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD CONSTRAINT "chk_skill_attack_defense_kind" CHECK ("attackDefenseKind" IN ('physical', 'magic'))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "skill_definition" DROP CONSTRAINT "chk_skill_attack_defense_kind"`,
    );
    await queryRunner.query(`ALTER TABLE "skill_definition" DROP COLUMN "attackDefenseKind"`);
  }
}
