import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CraftingIngredient } from './crafting-ingredient.entity';
import { CraftingResult } from './crafting-result.entity';

@Entity('crafting_recipe')
export class CraftingRecipe {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Clé contrôlée — jamais modifiée après seed
  @Column({ type: 'varchar', length: 128, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 256 })
  name: string;

  @Column({ type: 'text', nullable: true, default: null })
  description: string | null;

  // Famille de recettes — correspond à la category du skill requis
  @Column({ type: 'varchar', length: 64, default: 'smithing' })
  category: string;

  // Couplage Skill — le CraftingService vérifie le level avant craft
  @Column({ type: 'varchar', length: 64 })
  requiredSkillKey: string;

  @Column({ type: 'int', default: 1 })
  requiredSkillLevel: number;

  // Formule succès : clamp(base + (playerLevel - required) × bonus, min, max)
  @Column({ type: 'float', default: 1.0 })
  baseSuccessRate: number;

  @Column({ type: 'float', default: 0.02 })
  successBonusPerLevel: number;

  @Column({ type: 'float', default: 0.05 })
  minSuccessRate: number;

  @Column({ type: 'float', default: 1.0 })
  maxSuccessRate: number;

  // XP legacy (pré-ADR-0016) — plus utilisée par le Runtime craft pour la Skill
  // XP (désormais calculée via calculateSkillXp). Conservée pour compat données.
  @Column({ type: 'int', default: 10 })
  xpReward: number;

  // ADR-0016 : Character XP portée par la recette (appliquée via ProgressionService).
  @Column({ type: 'int', default: 0 })
  craftCharacterXpReward: number;

  // ADR-0016 : difficulté 0–100 alimentant SkillXpContext.difficulty (Skill Xp
  // calculée par le Runtime). Jamais une valeur d'XP skill stockée.
  @Column({ type: 'int', default: 0 })
  craftingDifficulty: number;

  // true = ingrédients perdus même en cas d'échec (comportement par défaut punitif)
  @Column({ type: 'boolean', default: true })
  consumeIngredientsOnFailure: boolean;

  @Column({ type: 'int', default: 0 })
  craftTimeMs: number;

  // Futur : station requise (workbench, forge, alchemy_table…)
  @Column({ type: 'varchar', length: 64, default: 'none' })
  stationType: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  // Distingue les recettes de référence des recettes admin custom
  @Column({ type: 'boolean', default: true })
  isDefault: boolean;

  // Version incrémentée à chaque édition (ADR-0009) — snapshotée par CraftJob
  // pour qu'un job ancien termine avec exactement les règles de son lancement.
  @Column({ type: 'int', default: 1 })
  version: number;

  @OneToMany(() => CraftingIngredient, (ing) => ing.recipe, { cascade: true })
  ingredients: CraftingIngredient[];

  @OneToMany(() => CraftingResult, (res) => res.recipe, { cascade: true })
  results: CraftingResult[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
