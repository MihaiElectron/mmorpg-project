import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CraftingStation } from './crafting-station.entity';

@Entity('crafting_station_template')
export class CraftingStationTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 256 })
  name: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  stationType: string;

  @Column({ type: 'varchar', length: 64, default: 'crafting' })
  category: string;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  requiredMasteryKey: string | null;

  @Column({ type: 'int', default: 1536 })
  interactionRadiusWU: number;

  /** Texture (AssetPath /assets/... ou clé Phaser legacy). Null → fallback carré. */
  @Column({ type: 'varchar', length: 256, nullable: true, default: null })
  textureKey: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @OneToMany(() => CraftingStation, (station) => station.template)
  stations: CraftingStation[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
