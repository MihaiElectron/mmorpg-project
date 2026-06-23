// apps/api-gateway/src/resources/entities/resource.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('resources')
export class Resource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  type: string; // ex: "dead_tree", "ore"

  @Column('int')
  x: number;

  @Column('int')
  y: number;

  // ── Coordonnées WU (migration Phase 2) — nullable jusqu'au backfill ──────
  @Column({ type: 'int', nullable: true })
  worldX: number | null;

  @Column({ type: 'int', nullable: true })
  worldY: number | null;

  @Column({ type: 'int', nullable: true })
  mapId: number | null;

  @Column({ default: 'alive' })
  state: 'alive' | 'dead';

  @Column('int', { name: 'remaining_loots', default: 9999 })
  remainingLoots: number;

  @Column({ type: 'timestamptz', nullable: true, name: 'respawn_at', default: null })
  respawnAt: Date | null;

  // Override par instance (null = hérite du template)
  @Column({ type: 'int', nullable: true, name: 'respawn_delay_ms', default: null })
  respawnDelayMs: number | null;
}
