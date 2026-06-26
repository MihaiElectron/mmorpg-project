import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('creature_template')
export class CreatureTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  key: string;

  @Column()
  name: string;

  @Column()
  textureKey: string;

  @Column('int')
  baseHealth: number;

  @Column('int')
  baseArmor: number;

  @Column('int')
  baseAttack: number;

  @Column('int')
  patrolRadius: number;

  @Column('int')
  speedMin: number;

  @Column('int')
  speedMax: number;

  @Column('int', { default: 500 })
  pauseMinMs: number;

  @Column('int', { default: 3000 })
  pauseMaxMs: number;

  @Column('int', { default: 0 })
  aggroRadius: number;

  @Column('int', { default: 0 })
  fleeThresholdPct: number;

  @Column('int', { default: 20000 })
  respawnDelayMs: number;

  @Column({ type: 'jsonb', nullable: true, name: 'loot_pool', default: null })
  lootPool: any[] | null;
}
