import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute les données d'équipement configurables sur `item` (Équipement V1-A).
 * Non destructif : ADD COLUMN uniquement, aucune colonne existante renommée ou
 * supprimée. Les items existants prennent les valeurs par défaut :
 *   - statBonuses '{}'          (aucun bonus primaire)
 *   - requiredLevel 1
 *   - requiredClass NULL        (aucune restriction)
 *   - requiredMasteries '{}'    (aucune maîtrise requise)
 *
 * `statBonuses` = bonus de stats PRIMAIRES uniquement (whitelist serveur), agrégés
 * dans `modifiers.equipment` du calculateur. N'affecte PAS `attack`/`defense`
 * plats (chemin `recalculateEquipmentStats` conservé).
 *
 * IMPORTANT — en dev, ces colonnes sont déjà créées par `synchronize: true` au
 * premier démarrage : cette migration échouera alors (`column already exists`).
 * Vérifier l'état réel de la base cible avant toute exécution.
 *
 * Aucun exécuteur de migration n'est câblé dans ce projet : ce fichier versionne
 * le changement, il ne s'exécute pas automatiquement.
 */
export class AddEquipmentBonusesToItem1784246400000 implements MigrationInterface {
  name = 'AddEquipmentBonusesToItem1784246400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "item" ADD COLUMN "statBonuses" jsonb NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "item" ADD COLUMN "requiredLevel" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "item" ADD COLUMN "requiredClass" character varying DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "item" ADD COLUMN "requiredMasteries" jsonb NOT NULL DEFAULT '{}'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "item" DROP COLUMN "requiredMasteries"`);
    await queryRunner.query(`ALTER TABLE "item" DROP COLUMN "requiredClass"`);
    await queryRunner.query(`ALTER TABLE "item" DROP COLUMN "requiredLevel"`);
    await queryRunner.query(`ALTER TABLE "item" DROP COLUMN "statBonuses"`);
  }
}
