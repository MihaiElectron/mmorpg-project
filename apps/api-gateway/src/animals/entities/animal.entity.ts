import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CreatureSpawn } from './creature-spawn.entity';

@Entity('animals')
export class Animal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CreatureSpawn, { eager: true, nullable: true })
  @JoinColumn({ name: 'spawn_id' })
  spawn: CreatureSpawn;

  @Column('int')
  x: number;

  @Column('int')
  y: number;

  @Column('int')
  health: number;

  @Column({ default: 'alive' })
  state: 'alive' | 'fighting' | 'escaping' | 'dead';
}
