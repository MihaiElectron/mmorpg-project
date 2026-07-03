import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CraftJob } from './craft-job.entity';

/**
 * Ingrédient snapshoté d'un CraftJob (ADR-0009).
 *
 * `itemId` est stocké en varchar sans FK (immuabilité du snapshot). `objectMode`
 * fige la nature au lancement. Pour un ingrédient STACKABLE, `reservedQuantity`
 * mémorise la quantité retirée de l'Inventory. Pour un ingrédient INSTANCE, les
 * instances réservées sont retrouvées via `ItemInstance.containerId = jobId`
 * (état IN_CRAFT_ORDER) — pas de duplication de référence ici.
 */
@Entity('craft_job_ingredient')
export class CraftJobIngredient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CraftJob, (job) => job.ingredients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jobId' })
  job: CraftJob;

  @Column({ type: 'varchar' })
  jobId: string;

  @Column({ type: 'varchar' })
  itemId: string;

  @Column({ type: 'varchar', length: 20 })
  objectMode: string;

  // Quantité requise par craft (snapshot recette).
  @Column({ type: 'int', default: 1 })
  requiredQuantity: number;

  // Quantité totale réservée au lancement (requiredQuantity × quantity).
  @Column({ type: 'int', default: 0 })
  reservedQuantity: number;
}
