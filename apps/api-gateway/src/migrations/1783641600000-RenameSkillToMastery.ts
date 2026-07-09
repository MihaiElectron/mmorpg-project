import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Versionne le renommage Skill → Mastery (refactor vocabulaire ADR-0018 §4-5).
 *
 * Non destructive : uniquement des `RENAME TABLE` / `RENAME COLUMN` /
 * `RENAME CONSTRAINT`, aucune donnée supprimée, aucun DROP. Postgres met à jour
 * automatiquement les clés étrangères qui référencent les objets renommés, MAIS
 * ne renomme PAS les noms de contrainte/index (PK, UNIQUE) lors d'un
 * `RENAME TABLE` : ce fichier renomme donc explicitement la PK et la contrainte
 * UNIQUE héritées de l'ancien `skill_definition` vers des noms propres à
 * `mastery_definition`, pour éviter une collision de noms schema-globaux quand
 * une table `skill_definition` est réintroduite (Skills actifs V1).
 *
 * IMPORTANT — état de la base locale de développement :
 * ce renommage a déjà été appliqué manuellement en SQL direct le 2026-07-09
 * pour débloquer un backend qui ne démarrait plus (`synchronize: true` avait
 * tenté d'ADD COLUMN une colonne NOT NULL sans backfill). Sur toute base déjà
 * dans cet état (colonnes/tables déjà en noms Mastery), cette migration
 * échouera si elle est exécutée telle quelle (`ALTER TABLE skill_definition`
 * introuvable). Elle ne doit être exécutée que sur une base encore en ancien
 * schéma (`skill_definition`/`player_skill`/`*SkillKey`/`*SkillLevel`/
 * `grantedSkillXp`/`skill_key` présents). Vérifier l'état réel de la base
 * cible avant toute exécution — ne pas lancer aveuglément.
 *
 * Aucun exécuteur de migration n'est actuellement câblé dans ce projet
 * (pas de `data-source.ts` CLI, pas de script `migration:run`, pas de
 * `migrationsRun` dans `app.module.ts`) : ce fichier sert uniquement à
 * versionner le changement pour une future mise en place de migrations
 * prod, il ne s'exécute pas automatiquement.
 */
export class RenameSkillToMastery1783641600000 implements MigrationInterface {
  name = 'RenameSkillToMastery1783641600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Tables
    await queryRunner.query('ALTER TABLE skill_definition RENAME TO mastery_definition');
    await queryRunner.query('ALTER TABLE player_skill RENAME TO player_mastery');

    // Contraintes index-backed héritées de l'ancien `skill_definition`.
    // Postgres NE renomme PAS les noms de contrainte/index lors d'un
    // `RENAME TABLE` : `mastery_definition` conserverait donc les noms générés
    // par TypeORM pour `skill_definition` (`PK_…`/`UQ_…`, hash de table+colonne).
    // Ces noms sont schema-globaux (adossés à un index) : à la réintroduction
    // d'une table `skill_definition` (Skills actifs V1), TypeORM recalcule les
    // MÊMES noms → collision `relation "…" already exists`. On les renomme donc
    // vers des noms propres à `mastery_definition`. Aucune donnée touchée
    // (RENAME uniquement). Les NOT NULL (`skill_definition_*_not_null`) sont
    // table-scoped → aucune collision, laissés tels quels.
    await queryRunner.query(
      'ALTER TABLE mastery_definition RENAME CONSTRAINT "PK_ab618148005f56f13c23bfb4323" TO "PK_mastery_definition_id"',
    );
    await queryRunner.query(
      'ALTER TABLE mastery_definition RENAME CONSTRAINT "UQ_0afbddf73e142606f4147f3de00" TO "UQ_mastery_definition_key"',
    );

    // Colonne de jointure
    await queryRunner.query(
      'ALTER TABLE player_mastery RENAME COLUMN "skillDefinitionId" TO "masteryDefinitionId"',
    );

    // Champs applicatifs — crafting_recipe
    await queryRunner.query(
      'ALTER TABLE crafting_recipe RENAME COLUMN "requiredSkillKey" TO "requiredMasteryKey"',
    );
    await queryRunner.query(
      'ALTER TABLE crafting_recipe RENAME COLUMN "requiredSkillLevel" TO "requiredMasteryLevel"',
    );

    // Champs applicatifs — crafting_station_template
    await queryRunner.query(
      'ALTER TABLE crafting_station_template RENAME COLUMN "requiredSkillKey" TO "requiredMasteryKey"',
    );

    // Champs applicatifs — craft_job
    await queryRunner.query(
      'ALTER TABLE craft_job RENAME COLUMN "requiredSkillKey" TO "requiredMasteryKey"',
    );
    await queryRunner.query(
      'ALTER TABLE craft_job RENAME COLUMN "requiredSkillLevel" TO "requiredMasteryLevel"',
    );
    await queryRunner.query(
      'ALTER TABLE craft_job RENAME COLUMN "grantedSkillXp" TO "grantedMasteryXp"',
    );

    // Champs applicatifs — resource_templates
    await queryRunner.query(
      'ALTER TABLE resource_templates RENAME COLUMN skill_key TO mastery_key',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Inverse exact, dans l'ordre inverse.
    await queryRunner.query(
      'ALTER TABLE resource_templates RENAME COLUMN mastery_key TO skill_key',
    );

    await queryRunner.query(
      'ALTER TABLE craft_job RENAME COLUMN "grantedMasteryXp" TO "grantedSkillXp"',
    );
    await queryRunner.query(
      'ALTER TABLE craft_job RENAME COLUMN "requiredMasteryLevel" TO "requiredSkillLevel"',
    );
    await queryRunner.query(
      'ALTER TABLE craft_job RENAME COLUMN "requiredMasteryKey" TO "requiredSkillKey"',
    );

    await queryRunner.query(
      'ALTER TABLE crafting_station_template RENAME COLUMN "requiredMasteryKey" TO "requiredSkillKey"',
    );

    await queryRunner.query(
      'ALTER TABLE crafting_recipe RENAME COLUMN "requiredMasteryLevel" TO "requiredSkillLevel"',
    );
    await queryRunner.query(
      'ALTER TABLE crafting_recipe RENAME COLUMN "requiredMasteryKey" TO "requiredSkillKey"',
    );

    await queryRunner.query(
      'ALTER TABLE player_mastery RENAME COLUMN "masteryDefinitionId" TO "skillDefinitionId"',
    );

    await queryRunner.query('ALTER TABLE player_mastery RENAME TO player_skill');

    // Restaurer les noms de contrainte d'origine AVANT de renommer la table :
    // on référence encore la table par son nom courant `mastery_definition`.
    // Après le rename ci-dessous, `skill_definition` retrouve ses noms
    // `PK_…`/`UQ_…` historiques.
    await queryRunner.query(
      'ALTER TABLE mastery_definition RENAME CONSTRAINT "PK_mastery_definition_id" TO "PK_ab618148005f56f13c23bfb4323"',
    );
    await queryRunner.query(
      'ALTER TABLE mastery_definition RENAME CONSTRAINT "UQ_mastery_definition_key" TO "UQ_0afbddf73e142606f4147f3de00"',
    );

    await queryRunner.query('ALTER TABLE mastery_definition RENAME TO skill_definition');
  }
}
