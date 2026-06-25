/**
 * WU Backfill Réel — écriture des coordonnées WU en base
 *
 * Flux d'exécution :
 *   1. Dry-run identique au script wu-backfill-dry-run.
 *   2. Si la moindre anomalie est détectée → arrêt immédiat, aucune écriture.
 *   3. Écriture de worldX / worldY / mapId uniquement sur les lignes où
 *      ces trois colonnes sont NULL (idempotent).
 *   4. Rapport final post-écriture.
 *
 * Garanties :
 *   - Les colonnes pixel legacy (positionX/Y, x/y, spawnX/Y) ne sont jamais touchées.
 *   - respawn_point.radius n'est pas modifié.
 *   - Aucune ligne n'est supprimée.
 *   - synchronize: false — le schéma n'est pas modifié.
 *   - Idempotent : une ligne déjà backfillée (worldX != null) est ignorée.
 *
 * Exécution :
 *   npm run wu:backfill
 */

import 'reflect-metadata';
import { DataSource, Repository } from 'typeorm';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (_) {}

import { Character } from '../../src/characters/entities/character.entity';
import { CharacterEquipment } from '../../src/characters/entities/character-equipment.entity';
import { Creature } from '../../src/creatures/entities/creature.entity';
import { CreatureSpawn } from '../../src/creatures/entities/creature-spawn.entity';
import { CreatureTemplate } from '../../src/creatures/entities/creature-template.entity';
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
  DEFAULT_MAP_BOUNDS,
} from '../../src/common/wu-backfill-report';
import { pixelToWUWithMap } from '../../src/common/legacy-pixel-position.adapter';

// ─── DataSource ───────────────────────────────────────────────────────────────

function buildDataSource(): DataSource {
  const host     = process.env.DB_HOST     ?? 'localhost';
  const port     = Number(process.env.DB_PORT ?? 5432);
  const username = process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!username || !password || !database) {
    console.error('[wu-backfill] Variables manquantes : DB_USERNAME, DB_PASSWORD, DB_NAME');
    process.exit(1);
  }

  return new DataSource({
    type: 'postgres',
    host, port, username, password, database,
    entities: [
      Character, CharacterEquipment,
      Creature, CreatureSpawn, CreatureTemplate,
      Resource, RespawnPoint,
      User, Inventory, Item,
    ],
    synchronize: false,
    logging: false,
  });
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

interface AllEntities {
  characters: Character[];
  creatures: Creature[];
  resources: Resource[];
  spawns: CreatureSpawn[];
  respawnPoints: RespawnPoint[];
}

async function readAll(ds: DataSource): Promise<AllEntities> {
  const [characters, creatures, resources, spawns, respawnPoints] = await Promise.all([
    ds.getRepository(Character).find(),
    ds.getRepository(Creature).find(),
    ds.getRepository(Resource).find(),
    ds.getRepository(CreatureSpawn).find(),
    ds.getRepository(RespawnPoint).find(),
  ]);
  return { characters, creatures, resources, spawns, respawnPoints };
}

// ─── Rapport ──────────────────────────────────────────────────────────────────

function buildReports(data: AllEntities) {
  return [
    generateEntityReport(
      'character', data.characters as unknown as PositionedRecord[],
      (r) => { const c = r as unknown as Character; return { x: c.positionX, y: c.positionY }; },
      3, DEFAULT_MAP_BOUNDS,
    ),
    generateEntityReport(
      'creature', data.creatures as unknown as PositionedRecord[],
      (r) => { const a = r as unknown as Creature; return { x: a.x, y: a.y }; },
      3, DEFAULT_MAP_BOUNDS,
    ),
    generateEntityReport(
      'resource', data.resources as unknown as PositionedRecord[],
      (r) => { const res = r as unknown as Resource; return { x: res.x, y: res.y }; },
      3, DEFAULT_MAP_BOUNDS,
    ),
    generateEntityReport(
      'creature_spawn', data.spawns as unknown as PositionedRecord[],
      (r) => { const s = r as unknown as CreatureSpawn; return { x: s.spawnX, y: s.spawnY }; },
      3, DEFAULT_MAP_BOUNDS,
    ),
    generateEntityReport(
      'respawn_point', data.respawnPoints as unknown as PositionedRecord[],
      (r) => { const rp = r as unknown as RespawnPoint; return { x: rp.x, y: rp.y }; },
      3, DEFAULT_MAP_BOUNDS,
    ),
  ];
}

// ─── Écriture par entité ──────────────────────────────────────────────────────

// Seules les 3 colonnes WU sont écrites. Le critère null garantit l'idempotence.

async function writeWU<T extends { worldX: number | null; worldY: number | null; mapId: number | null }>(
  repo: Repository<T>,
  entities: T[],
  getId: (e: T) => string | number,
  getLegacy: (e: T) => { x: number; y: number },
): Promise<number> {
  let n = 0;
  for (const e of entities) {
    if (e.worldX !== null || e.worldY !== null || e.mapId !== null) continue;
    const wu = pixelToWUWithMap(getLegacy(e));
    await repo.update(
      getId(e) as any,
      { worldX: wu.worldX, worldY: wu.worldY, mapId: wu.mapId } as any,
    );
    n++;
  }
  return n;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[wu-backfill] Connexion à la base de données…');
  const ds = buildDataSource();
  await ds.initialize();

  // ── Phase 1 : dry-run pré-écriture ────────────────────────────────────────
  console.log('[wu-backfill] Vérification pré-backfill (dry-run)…\n');
  const before = await readAll(ds);
  const beforeReport = generateDryRunReport(buildReports(before));
  console.log(formatReport(beforeReport));

  if (beforeReport.totalAnomalies > 0) {
    console.error(
      `\n[wu-backfill] ARRÊT — ${beforeReport.totalAnomalies} anomalie(s) détectée(s). Aucune écriture effectuée.`,
    );
    await ds.destroy();
    process.exit(1);
  }

  if (beforeReport.totalToBackfill === 0) {
    console.log('\n[wu-backfill] Rien à backfiller — toutes les lignes ont déjà des coordonnées WU.');
    await ds.destroy();
    process.exit(0);
  }

  // ── Phase 2 : écriture ────────────────────────────────────────────────────
  console.log(`\n[wu-backfill] Écriture de ${beforeReport.totalToBackfill} ligne(s)…`);

  const charRepo   = ds.getRepository(Character);
  const creatureRepo = ds.getRepository(Creature);
  const resRepo    = ds.getRepository(Resource);
  const spawnRepo  = ds.getRepository(CreatureSpawn);
  const rpRepo     = ds.getRepository(RespawnPoint);

  const updated =
    await writeWU(charRepo,   before.characters,   (e) => e.id,  (e) => ({ x: e.positionX, y: e.positionY })) +
    await writeWU(creatureRepo, before.creatures,       (e) => e.id,  (e) => ({ x: e.x,         y: e.y         })) +
    await writeWU(resRepo,    before.resources,     (e) => e.id,  (e) => ({ x: e.x,         y: e.y         })) +
    await writeWU(spawnRepo,  before.spawns,        (e) => e.id,  (e) => ({ x: e.spawnX,    y: e.spawnY    })) +
    await writeWU(rpRepo,     before.respawnPoints, (e) => e.id,  (e) => ({ x: e.x,         y: e.y         }));

  // ── Phase 3 : rapport final post-écriture ─────────────────────────────────
  console.log('\n[wu-backfill] Lecture post-backfill…\n');
  const after = await readAll(ds);
  const afterReport = generateDryRunReport(buildReports(after));
  console.log(formatReport(afterReport));

  console.log(`\n[wu-backfill] Terminé — ${updated} ligne(s) mise(s) à jour.`);
  await ds.destroy();
}

main().catch((err: Error) => {
  console.error('[wu-backfill] ERREUR:', err.message);
  process.exit(1);
});
