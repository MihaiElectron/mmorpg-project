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
import { BuildingState } from '../enums/building-state.enum';
import { BuildingTemplate } from './building-template.entity';

@Entity('building')
export class Building {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  templateId: string;

  @ManyToOne(() => BuildingTemplate, (t) => t.buildings, {
    onDelete: 'RESTRICT',
    nullable: false,
    eager: true,
  })
  @JoinColumn({ name: 'templateId' })
  template: BuildingTemplate;

  @Column({ type: 'int', default: DEFAULT_MAP_ID })
  mapId: number;

  @Column({ type: 'int' })
  worldX: number;

  @Column({ type: 'int' })
  worldY: number;

  @Column({
    type: 'varchar',
    length: 32,
    default: BuildingState.ACTIVE,
  })
  state: BuildingState;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
