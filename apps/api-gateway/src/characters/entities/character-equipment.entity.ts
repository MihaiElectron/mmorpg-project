import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Character } from './character.entity';
import { Item } from '../../items/entities/item.entity';

/**
 * CharacterEquipment Entity
 * -------------------------
 * Table de liaison entre Character et Item pour gérer l'équipement.
 * - Un personnage peut avoir un seul item par slot (unique constraint)
 * - Relation N-1 avec Character
 * - Relation N-1 avec Item
 */
@Entity()
@Unique(['characterId', 'slot'])
export class CharacterEquipment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Character, (character) => character.equipment, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'characterId' })
  character: Character;

  @Column()
  characterId: string;

  @ManyToOne(() => Item, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'itemId' })
  item: Item;

  @Column()
  itemId: string;

  @Column()
  slot: string; // 'head', 'chest', 'legs', 'weapon', 'shield', etc.

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
