import { MigrationInterface, QueryRunner } from 'typeorm';
import { DEFAULT_DERIVED_STAT_DEFINITIONS } from '../derived-stats/derived-stats.constants';

/**
 * Crée la table `derived_stat_definition` (config serveur des formules de
 * calcul des 24 stats dérivées, remplace les coefficients hardcodés de
 * CharacterStatsCalculator — chantier "coefficients configurables DevTools").
 *
 * Non destructif : CREATE TABLE + seed des 24 lignes V1 (mêmes valeurs
 * exactes que DEFAULT_DERIVED_STAT_DEFINITIONS, aucun changement de
 * gameplay). Ne touche à aucune autre table, ne drop rien, ne touche pas
 * `baseCritical`.
 *
 * IMPORTANT — état de la base locale de développement : cette table a déjà
 * été créée par `synchronize: true` avec son seed appliqué au premier
 * démarrage du backend après ce chantier (`DerivedStatsService.onModuleInit`
 * seed automatiquement si la table est vide). Cette migration échouera si
 * exécutée sur une base où la table existe déjà (`relation already exists`).
 * Vérifier l'état réel de la base cible avant toute exécution.
 *
 * Aucun exécuteur de migration n'est actuellement câblé dans ce projet (pas
 * de `data-source.ts` CLI, pas de script `migration:run`, pas de
 * `migrationsRun` dans `app.module.ts`) : ce fichier sert uniquement à
 * versionner le changement pour une future mise en place de migrations prod.
 */
export class CreateDerivedStatDefinitionTable1783814400000 implements MigrationInterface {
  name = 'CreateDerivedStatDefinitionTable1783814400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "derived_stat_definition" (
        "key" character varying NOT NULL,
        "label" character varying NOT NULL,
        "category" character varying NOT NULL,
        "baseValue" double precision NOT NULL DEFAULT 0,
        "rawStatSource" character varying,
        "primaryCoefficients" jsonb NOT NULL DEFAULT '{}',
        "minValue" double precision,
        "maxValue" double precision,
        "displayOrder" integer NOT NULL DEFAULT 0,
        "enabled" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_derived_stat_definition" PRIMARY KEY ("key")
      )
    `);

    for (const d of DEFAULT_DERIVED_STAT_DEFINITIONS) {
      await queryRunner.query(
        `INSERT INTO "derived_stat_definition"
          ("key", "label", "category", "baseValue", "rawStatSource", "primaryCoefficients", "minValue", "maxValue", "displayOrder", "enabled")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          d.key,
          d.label,
          d.category,
          d.baseValue,
          d.rawStatSource,
          JSON.stringify(d.primaryCoefficients),
          d.minValue,
          d.maxValue,
          d.displayOrder,
          d.enabled,
        ],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "derived_stat_definition"');
  }
}
