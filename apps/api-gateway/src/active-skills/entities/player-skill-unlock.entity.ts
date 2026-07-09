import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Character } from '../../characters/entities/character.entity';
import { SkillDefinition } from './skill-definition.entity';
import { SkillUnlockSource } from '../active-skills.constants';

/**
 * PlayerSkillUnlock — déverrouillage d'un skill pour UN personnage (V1-H).
 *
 * Table générique : déverrouille n'importe quel `skillKind` (active, passive,
 * aura). La distinction « castable / affiché » est portée par
 * `SkillDefinition.skillKind` + les filtres de route, jamais par cette table.
 *
 * Lien par `skillDefinitionId` (FK) — jamais par `key` (calqué sur
 * `PlayerMastery`, stabilité + intégrité référentielle). `onDelete: CASCADE`
 * des deux côtés : supprimer un personnage ou un skill nettoie ses unlocks.
 */
@Entity('player_skill_unlock')
@Unique(['characterId', 'skillDefinitionId'])
export class PlayerSkillUnlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Character, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'characterId' })
  character: Character;

  @Index()
  @Column()
  characterId: string;

  @ManyToOne(() => SkillDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillDefinitionId' })
  skillDefinition: SkillDefinition;

  @Column()
  skillDefinitionId: string;

  /** Origine du déverrouillage : admin | level | quest | item | trainer | debug. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  source: SkillUnlockSource | null;

  @CreateDateColumn()
  unlockedAt: Date;
}
