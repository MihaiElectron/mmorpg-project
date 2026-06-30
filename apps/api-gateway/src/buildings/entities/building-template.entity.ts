import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BuildingType } from '../enums/building-type.enum';
import { Building } from './building.entity';

@Entity('building_template')
export class BuildingTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 256 })
  name: string;

  @Column({ type: 'varchar', length: 64 })
  buildingType: BuildingType;

  @Column({ type: 'varchar', length: 128, nullable: true, default: null })
  textureKey: string | null;

  @Column({ type: 'int', default: 1536 })
  interactionRadiusWU: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @OneToMany(() => Building, (b) => b.template)
  buildings: Building[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
