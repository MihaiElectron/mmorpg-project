import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SkillDefinition } from '../../skills/entities/skill-definition.entity';

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

  @Column('int', { default: 10, name: 'kill_skill_xp_reward' })
  killSkillXpReward: number;

  @Column('int', { default: 0, name: 'kill_character_xp_reward' })
  killCharacterXpReward: number;

  @Column({ type: 'uuid', nullable: true, name: 'kill_skill_definition_id' })
  killSkillDefinitionId: string | null;

  @ManyToOne(() => SkillDefinition, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'kill_skill_definition_id' })
  killSkillDefinition: SkillDefinition | null;
}
