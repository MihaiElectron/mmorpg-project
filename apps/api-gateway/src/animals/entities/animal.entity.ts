import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('animals')
export class Animal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  type: string;

  @Column()
  name: string;

  @Column('int')
  x: number;

  @Column('int')
  y: number;

  @Column('int', { default: 30 })
  health: number;

  @Column('int', { default: 30 })
  maxHealth: number;

  @Column('int', { default: 2 })
  armor: number;

  @Column({ default: 'alive' })
  state: 'alive' | 'dead';
}
