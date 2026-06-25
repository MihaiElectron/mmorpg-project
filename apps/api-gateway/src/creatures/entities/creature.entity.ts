import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CreatureSpawn } from './creature-spawn.entity';

@Entity('animals')
export class Creature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CreatureSpawn, { eager: true, nullable: true })
  @JoinColumn({ name: 'spawn_id' })
  spawn: CreatureSpawn;

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

  @Column('int')
  health: number;

  @Column({ default: 'alive' })
  state: 'alive' | 'fighting' | 'escaping' | 'dead';

  @Column({ type: 'timestamptz', nullable: true, default: null })
  respawnAt: Date | null;

  // Override par instance (null = hérite du spawn, puis du template)
  @Column({ type: 'int', nullable: true, default: null })
  respawnDelayMs: number | null;
}
