import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute l'école magique sur `skill_definition` (ADR-0022 — lot fondation).
 * `magicSchool` ∈ {`fire`,`water`,`air`,`earth`,`sacred`,`poison`} ou `null`
 * (skill sans école, physique/raw). AXE DISTINCT de `damageType` (mitigation
 * d'armure) et `attackDefenseKind` (pipeline défensif).
 *
 * Aucun effet combat dans ce lot : donnée persistée et validée seulement
 * (résistances, mitigation par école, immunités = Planned). CHECK simple pour
 * interdire toute valeur inconnue (même pattern que `chk_skill_damage_type` /
 * `chk_skill_attack_defense_kind`).
 *
 * RÉVERSIBILITÉ : le `up` ne modifie QUE `magicSchool` (colonne + contrainte +
 * backfill). Il ne réécrit JAMAIS `damageType` ni `attackDefenseKind` — sinon le
 * `down` (qui ne supprime que la colonne/contrainte) laisserait ces axes altérés
 * de façon irréversible. La cohérence de ces axes est du ressort de la VALIDATION
 * runtime (création/édition de skill), pas de cette migration de schéma.
 *
 * Backfill DÉTERMINISTE et DÉFENSIF de `magicSchool` par clé stable (le catalogue
 * peut être vide ou ne pas contenir Heal selon l'environnement — l'UPDATE affecte
 * alors 0 ligne, sans échec) :
 *  - `heal` : magicSchool = 'sacred' (verrou canonique appliqué au runtime).
 *
 * Le backfill de `strike` à `magicSchool = NULL` est OMIS : la colonne est créée
 * `DEFAULT NULL`, donc `strike` (comme tout skill sans école) est déjà `NULL` —
 * un UPDATE explicite serait strictement redondant.
 *
 * DETTE DE DONNÉES possible : un `heal` legacy dont `attackDefenseKind` ≠ `magic`
 * reçoit `magicSchool = 'sacred'` sans que son axe défensif soit corrigé (la
 * migration ne touche pas cet axe). La ligne reste alors incohérente jusqu'à sa
 * ré-édition admin (qui exigera `magic` + `sacred`). Correction volontairement
 * NON destructive : aucun axe existant n'est réécrit ici.
 *
 * IMPORTANT — en dev, cette colonne est déjà créée par `synchronize: true` au
 * premier démarrage : cette migration échouera alors (`column already exists`).
 * Vérifier l'état réel de la base cible avant toute exécution.
 *
 * Aucun exécuteur de migration n'est câblé dans ce projet : ce fichier versionne
 * le changement, il ne s'exécute pas automatiquement.
 */
export class AddMagicSchoolToSkillDefinition1786068000000
  implements MigrationInterface
{
  name = 'AddMagicSchoolToSkillDefinition1786068000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD COLUMN "magicSchool" character varying(16) DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD CONSTRAINT "chk_skill_magic_school" ` +
        `CHECK ("magicSchool" IS NULL OR "magicSchool" IN ('fire', 'water', 'air', 'earth', 'sacred', 'poison'))`,
    );

    // Backfill défensif de magicSchool uniquement (0 ligne si absent — jamais
    // d'échec). Aucune réécriture de damageType / attackDefenseKind.
    await queryRunner.query(
      `UPDATE "skill_definition" SET "magicSchool" = 'sacred' WHERE "key" = 'heal'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Réversible : supprime uniquement la contrainte et la colonne magicSchool.
    // Aucun autre axe n'ayant été modifié par `up`, le schéma antérieur est
    // exactement restauré.
    await queryRunner.query(
      `ALTER TABLE "skill_definition" DROP CONSTRAINT "chk_skill_magic_school"`,
    );
    await queryRunner.query(
      `ALTER TABLE "skill_definition" DROP COLUMN "magicSchool"`,
    );
  }
}
