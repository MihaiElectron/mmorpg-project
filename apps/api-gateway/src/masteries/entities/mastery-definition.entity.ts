import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('mastery_definition')
export class MasteryDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Clé contrôlée — jamais modifiée après seed (référencée par CraftingRecipe)
  @Column({ type: 'varchar', length: 64, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 256 })
  name: string;

  // Famille de masteries : gathering | crafting | combat | social | leadership | general
  @Column({ type: 'varchar', length: 64, default: 'general' })
  category: string;

  @Column({ type: 'int', default: 100 })
  maxLevel: number;

  // Paramètres de la formule : nextLevelXp = baseXpPerLevel × level ^ xpCurveExponent
  @Column({ type: 'int', default: 100 })
  baseXpPerLevel: number;

  @Column({ type: 'float', default: 1.5 })
  xpCurveExponent: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
