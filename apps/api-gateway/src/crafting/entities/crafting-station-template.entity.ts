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
  requiredSkillKey: string | null;

  @Column({ type: 'int', default: 1536 })
  interactionRadiusWU: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @OneToMany(() => CraftingStation, (station) => station.template)
  stations: CraftingStation[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
