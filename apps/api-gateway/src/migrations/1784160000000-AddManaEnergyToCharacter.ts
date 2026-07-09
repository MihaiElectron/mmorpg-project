import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute les ressources COURANTES `mana` et `energy` sur `character`
 * (Skills V1-J-A). Non destructif : ADD COLUMN NOT NULL DEFAULT 0 uniquement —
 * les personnages existants passent à 0 (comportement voulu : le refill se fera
 * à la création / allocation ; la consommation viendra en V1-J-B).
 *
 * Le MAX n'a PAS de colonne : `maxMana`/`maxEnergy` restent des stats dérivées
 * (DerivedStatsService / CharacterStatsCalculator). Aucune colonne de max créée.
 *
 * IMPORTANT — en dev, ces colonnes sont déjà créées par `synchronize: true` au
 * premier démarrage : cette migration échouera alors (`column already exists`).
 * Vérifier l'état réel de la base cible avant toute exécution.
 *
 * Aucun exécuteur de migration n'est câblé dans ce projet : ce fichier versionne
 * le changement, il ne s'exécute pas automatiquement.
 */
export class AddManaEnergyToCharacter1784160000000 implements MigrationInterface {
  name = 'AddManaEnergyToCharacter1784160000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "character" ADD COLUMN "mana" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "character" ADD COLUMN "energy" integer NOT NULL DEFAULT 0`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "character" DROP COLUMN "energy"');
    await queryRunner.query('ALTER TABLE "character" DROP COLUMN "mana"');
  }
}
