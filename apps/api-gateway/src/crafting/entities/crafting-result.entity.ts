import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { CraftingRecipe } from './crafting-recipe.entity';

@Entity('crafting_result')
export class CraftingResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CraftingRecipe, (recipe) => recipe.results, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'recipeId' })
  recipe: CraftingRecipe;

  @Column()
  recipeId: string;

  // FK RESTRICT : impossible de supprimer un item utilisé comme résultat
  @ManyToOne(() => Item, { onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'itemId' })
  item: Item;

  @Column()
  itemId: string;

  @Column({ type: 'int', default: 1 })
  producedQuantity: number;

  // 0..1 — probabilité de produire cet output (tirage indépendant par résultat)
  @Column({ type: 'float', default: 1.0 })
  chance: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
