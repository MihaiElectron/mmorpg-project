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

  @Column({ type: 'jsonb', nullable: true, name: 'loot_pool', default: null })
  lootPool: any[] | null;

  /** Clé du skill de récolte (ex: 'woodcutting', 'mining'). Null → pas d'XP. */
  @Column({ type: 'varchar', length: 64, name: 'skill_key', nullable: true, default: null })
  skillKey: string | null;

  /** XP accordée par tick de récolte réussi. 0 → pas d'XP. */
  @Column('int', { name: 'gathering_xp_reward', default: 0 })
  gatheringXpReward: number;
}
