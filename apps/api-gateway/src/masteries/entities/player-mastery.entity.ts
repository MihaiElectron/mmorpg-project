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
import { MasteryDefinition } from './mastery-definition.entity';

@Entity('player_mastery')
@Unique(['characterId', 'masteryDefinitionId'])
export class PlayerMastery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Character, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'characterId' })
  character: Character;

  @Column()
  characterId: string;

  @ManyToOne(() => MasteryDefinition, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'masteryDefinitionId' })
  masteryDefinition: MasteryDefinition;

  @Column()
  masteryDefinitionId: string;

  // Level dénormalisé — recalculé à chaque addXp, jamais lu sans recalcul.
  // Démarre à 0 : le niveau affiché = nombre réel de coefficients d'effet
  // appliqués (bonus = level × value), aucun niveau gratuit.
  @Column({ type: 'int', default: 0 })
  level: number;

  // XP accumulée vers le prochain level (reset + carry-over à chaque level up)
  @Column({ type: 'int', default: 0 })
  xp: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
