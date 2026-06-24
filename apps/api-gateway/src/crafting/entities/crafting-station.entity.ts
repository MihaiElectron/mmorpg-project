import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DEFAULT_MAP_ID } from '../../common/world-coordinates';
import { CraftingStationTemplate } from './crafting-station-template.entity';

@Entity('crafting_station')
export class CraftingStation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  templateId: string;

  @ManyToOne(() => CraftingStationTemplate, (template) => template.stations, {
    onDelete: 'RESTRICT',
    nullable: false,
  })
  @JoinColumn({ name: 'templateId' })
  template: CraftingStationTemplate;

  @Column({ type: 'int', default: DEFAULT_MAP_ID })
  mapId: number;

  @Column({ type: 'int' })
  worldX: number;

  @Column({ type: 'int' })
  worldY: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
