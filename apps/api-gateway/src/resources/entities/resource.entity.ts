// apps/api-gateway/src/resources/entities/resource.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('resources')
export class Resource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  type: string; // ex: "dead_tree", "ore"

  @Column('int')
  x: number;

  @Column('int')
  y: number;

  @Column({ default: 'alive' })
  state: 'alive' | 'dead';
}
