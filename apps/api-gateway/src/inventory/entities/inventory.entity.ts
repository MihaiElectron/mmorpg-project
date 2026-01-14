import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Character } from '../../characters/entities/character.entity';
import { Item } from '../../items/entities/item.entity';

/**
 * Inventory
 * ---------------------------------------------------------------------------
 * Représente l’inventaire d’un personnage
 * - Chaque ligne correspond à un item
 * - quantity = nombre de ce type d’item
 * - equipped = si l’item est actuellement équipé
 * ---------------------------------------------------------------------------
 */
@Entity()
@Unique(['character', 'item'])
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Character, (character) => character.inventory, {
    onDelete: 'CASCADE',
  })
  character: Character;

  @ManyToOne(() => Item, (item) => item.inventory, {
    onDelete: 'CASCADE',
  })
  item: Item;

  @Column({ type: 'integer', default: 1 })
  quantity: number;

  @Column({ type: 'boolean', default: false })
  equipped: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
