import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Autorise `damageType = 'magic'` sur `skill_definition` (ADR-0022 — mitigation
 * magique). La contrainte `chk_skill_damage_type` passe de {physical, raw} à
 * {physical, magic, raw} :
 *  - `physical` : armure + `armorPenetrationPercent` ;
 *  - `magic`    : ignore l'armure, applique la résistance magique de l'école
 *    (`magicSchool` obligatoire côté validation serveur) — pas de pénétration ;
 *  - `raw`      : ignore armure ET résistance.
 *
 * Non destructif : seule la contrainte CHECK est remplacée (aucune donnée
 * modifiée, aucun skill migré). Réversible.
 *
 * IMPORTANT — en dev, `synchronize: true` ne recrée pas les contraintes CHECK
 * personnalisées : vérifier l'état réel de la base cible avant exécution. Aucun
 * exécuteur de migration n'est câblé : ce fichier versionne le changement pour
 * la prod, il ne s'exécute pas automatiquement.
 */
export class AllowMagicDamageTypeOnSkillDefinition1786075200000
  implements MigrationInterface
{
  name = 'AllowMagicDamageTypeOnSkillDefinition1786075200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "skill_definition" DROP CONSTRAINT "chk_skill_damage_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD CONSTRAINT "chk_skill_damage_type" ` +
        `CHECK ("damageType" IN ('physical', 'magic', 'raw'))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Refus explicite si des skills `magic` existent : restaurer la contrainte
    // {physical, raw} violerait ces lignes. Préférable à une perte silencieuse.
    const magicRows: Array<{ count: string }> = await queryRunner.query(
      `SELECT COUNT(*)::text AS count FROM "skill_definition" WHERE "damageType" = 'magic'`,
    );
    if (magicRows.length > 0 && Number(magicRows[0].count) > 0) {
      throw new Error(
        `Rollback impossible : ${magicRows[0].count} skill(s) ont damageType = 'magic'. ` +
          `Réassigner ces skills à 'physical' ou 'raw' avant de restaurer la contrainte.`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "skill_definition" DROP CONSTRAINT "chk_skill_damage_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD CONSTRAINT "chk_skill_damage_type" ` +
        `CHECK ("damageType" IN ('physical', 'raw'))`,
    );
  }
}
