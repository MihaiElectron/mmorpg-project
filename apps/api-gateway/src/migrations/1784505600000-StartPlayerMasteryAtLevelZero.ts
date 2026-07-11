import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Les maîtrises démarrent au niveau 0 (Mastery Effects V2). Le niveau affiché
 * devient le nombre réel de coefficients d'effet appliqués
 * (`bonus = level × value`) — plus de « niveau 1 gratuit ».
 *
 * - DEFAULT de `player_mastery.level` : 1 → 0.
 * - Données existantes : les lignes level=1 / xp=0 (jamais pratiquées, créées
 *   par l'ancien plancher) sont ramenées à 0. Les niveaux montés (level > 1 ou
 *   xp > 0) sont CONSERVÉS tels quels — pas de décrément automatique, pour ne
 *   pas casser les données de dev et les tests runtime.
 *
 * IMPORTANT — en dev, `synchronize: true` ajuste le DEFAULT au démarrage mais
 * ne touche PAS aux lignes existantes : l'UPDATE ci-dessous doit être joué
 * manuellement (ou via cette migration) sur les bases déjà peuplées.
 *
 * Aucun exécuteur de migration n'est câblé dans ce projet : ce fichier versionne
 * le changement, il ne s'exécute pas automatiquement.
 */
export class StartPlayerMasteryAtLevelZero1784505600000 implements MigrationInterface {
  name = 'StartPlayerMasteryAtLevelZero1784505600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "player_mastery" ALTER COLUMN "level" SET DEFAULT 0`,
    );
    await queryRunner.query(
      `UPDATE "player_mastery" SET "level" = 0 WHERE "level" = 1 AND "xp" = 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "player_mastery" ALTER COLUMN "level" SET DEFAULT 1`,
    );
    await queryRunner.query(
      `UPDATE "player_mastery" SET "level" = 1 WHERE "level" = 0 AND "xp" = 0`,
    );
  }
}
