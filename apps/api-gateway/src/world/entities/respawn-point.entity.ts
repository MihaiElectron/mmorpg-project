import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('respawn_point')
export class RespawnPoint {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  x: number;

  @Column('int')
  y: number;

  @Column('int', { default: 20 })
  radius: number;

  // ── Coordonnées WU (migration Phase 2) — nullable jusqu'au backfill ──────
  @Column({ type: 'int', nullable: true })
  worldX: number | null;

  @Column({ type: 'int', nullable: true })
  worldY: number | null;

  @Column({ type: 'int', nullable: true })
  mapId: number | null;
}
