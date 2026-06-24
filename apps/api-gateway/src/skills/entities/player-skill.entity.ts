import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Character } from '../../characters/entities/character.entity';
import { SkillDefinition } from './skill-definition.entity';

@Entity('player_skill')
@Unique(['characterId', 'skillDefinitionId'])
export class PlayerSkill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Character, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'characterId' })
  character: Character;

  @Column()
  characterId: string;

  @ManyToOne(() => SkillDefinition, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'skillDefinitionId' })
  skillDefinition: SkillDefinition;

  @Column()
  skillDefinitionId: string;

  // Level dénormalisé — recalculé à chaque addXp, jamais lu sans recalcul
  @Column({ type: 'int', default: 1 })
  level: number;

  // XP accumulée vers le prochain level (reset + carry-over à chaque level up)
  @Column({ type: 'int', default: 0 })
  xp: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
