import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CraftJob } from './craft-job.entity';

/**
 * Output snapshoté d'un CraftJob (ADR-0009).
 *
 * Décrit ce qui SERA produit — aucun item n'existe tant que le CLAIM n'a pas eu
 * lieu (phases suivantes). `itemId` en varchar sans FK (immuabilité du snapshot).
 */
@Entity('craft_job_output')
export class CraftJobOutput {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CraftJob, (job) => job.outputs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jobId' })
  job: CraftJob;

  @Column({ type: 'varchar' })
  jobId: string;

  @Column({ type: 'varchar' })
  itemId: string;

  @Column({ type: 'varchar', length: 20 })
  objectMode: string;

  @Column({ type: 'int', default: 1 })
  producedQuantity: number;

  @Column({ type: 'float', default: 1.0 })
  chance: number;
}
