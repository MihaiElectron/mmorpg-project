import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Modèle de déverrouillage des skills par personnage (Skills V1-H-A).
 *
 * Non destructif :
 *  - ADD COLUMN `skill_definition.skillKind` (default 'active') et
 *    `skill_definition.autoUnlock` (default true) — comportement inchangé pour
 *    les skills existants (tous 'active' + autoUnlock, donc disponibles sans
 *    ligne d'unlock, rétro-compat).
 *  - CREATE TABLE `player_skill_unlock` (FK CASCADE character + skill_definition,
 *    unique (characterId, skillDefinitionId), index sur characterId).
 * Aucun DROP, aucune donnée supprimée.
 *
 * IMPORTANT — état de la base locale de développement : en dev, ces colonnes et
 * cette table sont déjà créées par `synchronize: true` au premier démarrage du
 * backend après ce chantier. Cette migration échouera alors si exécutée telle
 * quelle (`column already exists` / `relation already exists`). Vérifier l'état
 * réel de la base cible avant toute exécution.
 *
 * Aucun exécuteur de migration n'est actuellement câblé dans ce projet (pas de
 * `data-source.ts` CLI, pas de script `migration:run`, pas de `migrationsRun`
 * dans `app.module.ts`) : ce fichier versionne le changement pour une future
 * mise en place de migrations prod, il ne s'exécute pas automatiquement.
 */
export class AddSkillUnlockModel1783987200000 implements MigrationInterface {
  name = 'AddSkillUnlockModel1783987200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── skill_definition : skillKind + autoUnlock ──────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD COLUMN "skillKind" character varying(16) NOT NULL DEFAULT 'active'`,
    );
    await queryRunner.query(
      `ALTER TABLE "skill_definition" ADD COLUMN "autoUnlock" boolean NOT NULL DEFAULT true`,
    );

    // ── player_skill_unlock ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "player_skill_unlock" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "characterId" uuid NOT NULL,
        "skillDefinitionId" uuid NOT NULL,
        "source" character varying(16),
        "unlockedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_player_skill_unlock" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_player_skill_unlock_char_skill" UNIQUE ("characterId", "skillDefinitionId"),
        CONSTRAINT "FK_player_skill_unlock_character" FOREIGN KEY ("characterId")
          REFERENCES "character"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_player_skill_unlock_skill" FOREIGN KEY ("skillDefinitionId")
          REFERENCES "skill_definition"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_player_skill_unlock_characterId" ON "player_skill_unlock" ("characterId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "player_skill_unlock"');
    await queryRunner.query('ALTER TABLE "skill_definition" DROP COLUMN "autoUnlock"');
    await queryRunner.query('ALTER TABLE "skill_definition" DROP COLUMN "skillKind"');
  }
}
