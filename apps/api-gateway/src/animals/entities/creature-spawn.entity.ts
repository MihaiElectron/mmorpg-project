import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CreatureTemplate } from './creature-template.entity';

@Entity('creature_spawn')
export class CreatureSpawn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @ManyToOne(() => CreatureTemplate, { eager: true, nullable: false })
  @JoinColumn({ name: 'template_id' })
  template: CreatureTemplate;

  @Column('int')
  spawnX: number;

  @Column('int')
  spawnY: number;

  // ── Coordonnées WU (migration Phase 2) — nullable jusqu'au backfill ──────
  @Column({ type: 'int', nullable: true })
  worldX: number | null;

  @Column({ type: 'int', nullable: true })
  worldY: number | null;

  @Column({ type: 'int', nullable: true })
  mapId: number | null;

  @Column('int', { default: 30000 })
  respawnDelayMs: number;
}
