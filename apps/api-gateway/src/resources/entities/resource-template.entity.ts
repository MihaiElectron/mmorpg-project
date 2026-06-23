import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('resource_templates')
export class ResourceTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  type: string;

  @Column('int', { name: 'default_remaining_loots', default: 9999 })
  defaultRemainingLoots: number;

  @Column('int', { name: 'respawn_delay_ms', default: 30_000 })
  respawnDelayMs: number;
}
