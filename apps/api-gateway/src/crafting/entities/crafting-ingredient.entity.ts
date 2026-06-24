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

@Entity('crafting_ingredient')
export class CraftingIngredient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CraftingRecipe, (recipe) => recipe.ingredients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'recipeId' })
  recipe: CraftingRecipe;

  @Column()
  recipeId: string;

  // FK RESTRICT : impossible de supprimer un item utilisé comme ingrédient
  @ManyToOne(() => Item, { onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'itemId' })
  item: Item;

  @Column()
  itemId: string;

  @Column({ type: 'int', default: 1 })
  requiredQuantity: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
