import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('respawn_point')
export class RespawnPoint {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  x: number;

  @Column('int')
  y: number;

  @Column('int', { default: 20 })
  radius: number;
}
