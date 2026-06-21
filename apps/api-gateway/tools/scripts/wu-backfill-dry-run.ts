/**
 * WU Backfill Dry-Run — outil de vérification lecture seule
 *
 * Se connecte à la DB, lit les 5 entités positionnelles, génère un rapport
 * de ce que le futur backfill pixel → WU produirait. N'écrit JAMAIS en base.
 *
 * Exécution :
 *   npm run wu:dry-run
 *   # ou directement :
 *   ts-node tools/scripts/wu-backfill-dry-run.ts
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';

// Chargement du .env (transitive dep de @nestjs/config)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
} catch (_) {
  // dotenv absent — les vars d'env doivent être définies par l'environnement
}

import { Character } from '../../src/characters/entities/character.entity';
import { CharacterEquipment } from '../../src/characters/entities/character-equipment.entity';
import { Animal } from '../../src/animals/entities/animal.entity';
import { CreatureSpawn } from '../../src/animals/entities/creature-spawn.entity';
import { CreatureTemplate } from '../../src/animals/entities/creature-template.entity';
import { Resource } from '../../src/resources/entities/resource.entity';
import { RespawnPoint } from '../../src/world/entities/respawn-point.entity';
import { User } from '../../src/users/entities/user.entity';
import { Inventory } from '../../src/inventory/entities/inventory.entity';
import { Item } from '../../src/items/entities/item.entity';
import {
  generateEntityReport,
  generateDryRunReport,
  formatReport,
  PositionedRecord,
} from '../../src/common/wu-backfill-report';

// ─── Connexion DB ─────────────────────────────────────────────────────────────

function buildDataSource(): DataSource {
  const host     = process.env.DB_HOST     ?? 'localhost';
  const port     = Number(process.env.DB_PORT ?? 5432);
  const username = process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!username || !password || !database) {
    console.error('[wu-dry-run] Variables manquantes : DB_USERNAME, DB_PASSWORD, DB_NAME');
    process.exit(1);
  }

  return new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    // Toutes les entités du graphe de relations doivent être déclarées,
    // même celles qu'on ne lit pas directement.
    entities: [
      Character, CharacterEquipment,
      Animal, CreatureSpawn, CreatureTemplate,
      Resource,
      RespawnPoint,
      User,
      Inventory,
      Item,
    ],
    // synchronize: false — ce script ne modifie jamais le schéma
    synchronize: false,
    logging: false,
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[wu-dry-run] Connexion à la base de données…');

  const ds = buildDataSource();
  await ds.initialize();

  console.log('[wu-dry-run] Lecture des entités…\n');

  const [characters, animals, resources, spawns, respawnPoints] = await Promise.all([
    ds.getRepository(Character).find(),
    ds.getRepository(Animal).find(),
    ds.getRepository(Resource).find(),
    ds.getRepository(CreatureSpawn).find(),
    ds.getRepository(RespawnPoint).find(),
  ]);

  // ── Rapport par entité ────────────────────────────────────────────────────

  const entityReports = [

    generateEntityReport(
      'character',
      characters as unknown as PositionedRecord[],
      (r) => {
        const c = r as unknown as Character;
        return { x: c.positionX, y: c.positionY };
      },
    ),

    generateEntityReport(
      'animal',
      animals as unknown as PositionedRecord[],
      (r) => {
        const a = r as unknown as Animal;
        return { x: a.x, y: a.y };
      },
    ),

    generateEntityReport(
      'resource',
      resources as unknown as PositionedRecord[],
      (r) => {
        const res = r as unknown as Resource;
        return { x: res.x, y: res.y };
      },
    ),

    generateEntityReport(
      'creature_spawn',
      spawns as unknown as PositionedRecord[],
      (r) => {
        const s = r as unknown as CreatureSpawn;
        return { x: s.spawnX, y: s.spawnY };
      },
    ),

    generateEntityReport(
      'respawn_point',
      respawnPoints as unknown as PositionedRecord[],
      (r) => {
        const rp = r as unknown as RespawnPoint;
        return { x: rp.x, y: rp.y };
      },
      // Note : respawn_point.radius n'est pas inclus dans ce dry-run.
      // Il sera traité séparément lors de la calibration gameplay (Phase 8).
    ),

  ];

  // ── Affichage ─────────────────────────────────────────────────────────────

  const report = generateDryRunReport(entityReports);
  console.log(formatReport(report));

  await ds.destroy();
  console.log('\n[wu-dry-run] Terminé. Aucune écriture effectuée en base.');
}

main().catch((err: Error) => {
  console.error('[wu-dry-run] ERREUR:', err.message);
  process.exit(1);
});
