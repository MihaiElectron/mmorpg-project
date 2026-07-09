import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute les 3 nouvelles stats primaires distribuables (Esprit/Volonté/
 * Charisme) suite au remplacement de Critique (devenue dérivée, cf.
 * CharacterStatsCalculator). ADD COLUMN non destructif, DEFAULT 0, aucune
 * donnée existante affectée.
 *
 * `baseCritical` N'EST PAS supprimée (legacy, cf. commentaire sur l'entité
 * `Character`) : les points qui y sont encore investis sont remboursés en
 * `unspentStatPoints` puis la colonne est remise à 0 par
 * `AdminService.recalculateCharacterProgression` (recalcul global, action
 * admin explicite) — jamais automatiquement au démarrage du serveur.
 *
 * IMPORTANT — état de la base locale de développement : ces 3 colonnes ont
 * déjà été ajoutées par `synchronize: true` (ADD COLUMN sur une table
 * existante avec DEFAULT est sans risque, contrairement à un RENAME — voir
 * la migration `RenameSkillToMastery` pour le cas qui avait cassé). Cette
 * migration échouera si exécutée sur une base où les colonnes existent déjà
 * (`column already exists`). Vérifier l'état réel de la base cible avant
 * toute exécution.
 *
 * Aucun exécuteur de migration n'est actuellement câblé dans ce projet (pas
 * de `data-source.ts` CLI, pas de script `migration:run`, pas de
 * `migrationsRun` dans `app.module.ts`) : ce fichier sert uniquement à
 * versionner le changement pour une future mise en place de migrations prod.
 */
export class AddNewPrimaryStatsColumns1783728000000 implements MigrationInterface {
  name = 'AddNewPrimaryStatsColumns1783728000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE character ADD COLUMN "baseSpirit" integer NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE character ADD COLUMN "baseWillpower" integer NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE character ADD COLUMN "baseCharisma" integer NOT NULL DEFAULT 0',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE character DROP COLUMN "baseCharisma"');
    await queryRunner.query('ALTER TABLE character DROP COLUMN "baseWillpower"');
    await queryRunner.query('ALTER TABLE character DROP COLUMN "baseSpirit"');
  }
}
