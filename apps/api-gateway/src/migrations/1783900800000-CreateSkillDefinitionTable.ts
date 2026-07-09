import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crée la table `skill_definition` (catalogue des skills actifs, ADR-0019 V1-A).
 *
 * Non destructif : CREATE TABLE uniquement, aucun seed de gameplay (le
 * catalogue démarre vide), aucun DROP, aucune autre table touchée. En
 * particulier, ne touche PAS `mastery_definition` — Skills et Masteries sont
 * deux domaines distincts.
 *
 * IMPORTANT — état de la base locale de développement : en dev, cette table est
 * déjà créée par `synchronize: true` au premier démarrage du backend après ce
 * chantier. Cette migration échouera alors si exécutée telle quelle (`relation
 * "skill_definition" already exists`). Vérifier l'état réel de la base cible
 * avant toute exécution.
 *
 * Aucun exécuteur de migration n'est actuellement câblé dans ce projet (pas de
 * `data-source.ts` CLI, pas de script `migration:run`, pas de `migrationsRun`
 * dans `app.module.ts`) : ce fichier versionne le changement pour une future
 * mise en place de migrations prod, il ne s'exécute pas automatiquement.
 */
export class CreateSkillDefinitionTable1783900800000 implements MigrationInterface {
  name = 'CreateSkillDefinitionTable1783900800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "skill_definition" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "key" character varying(64) NOT NULL,
        "name" character varying(256) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "iconAssetPath" character varying(512),
        "enabled" boolean NOT NULL DEFAULT true,
        "requiredLevel" integer NOT NULL DEFAULT 1,
        "requiredClass" character varying(64),
        "requiredMasteries" jsonb NOT NULL DEFAULT '{}',
        "resourceType" character varying(16),
        "resourceCost" integer NOT NULL DEFAULT 0,
        "cooldownMs" integer NOT NULL DEFAULT 1000,
        "castTimeMs" integer NOT NULL DEFAULT 0,
        "rangeWU" integer NOT NULL DEFAULT 1,
        "radiusWU" integer NOT NULL DEFAULT 0,
        "targetMode" character varying(16) NOT NULL DEFAULT 'creature',
        "effectType" character varying(16) NOT NULL DEFAULT 'damage',
        "scaling" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_skill_definition" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_skill_definition_key" UNIQUE ("key")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "skill_definition"');
  }
}
