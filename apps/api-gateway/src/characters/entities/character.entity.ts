import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { CharacterEquipment } from './character-equipment.entity';
import { Inventory } from '../../inventory/entities/inventory.entity';

/**
 * Character Entity
 * ----------------
 * Représente un personnage de jeu appartenant à un utilisateur.
 * - Relation N-1 avec User (un utilisateur peut avoir plusieurs personnages)
 * - Relation 1-N avec CharacterEquipment (un personnage peut avoir plusieurs équipements)
 */
@Entity()
export class Character {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;
  

  @Column({ default: 1 })
  level: number;

  @Column({ default: 100 })
  health: number;

  @Column({ default: 100 })
  maxHealth: number;

  @Column({ default: 0 })
  experience: number;

  @Column({ default: 0 })
  attack: number; // Attaque de base

  @Column({ default: 0 })
  defense: number; // Défense de base

  @ManyToOne(() => User, (user) => user.characters, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ nullable: false })
  sex: string;


  @OneToMany(
    () => CharacterEquipment,
    (characterEquipment) => characterEquipment.character,
    { cascade: true },
  )
  equipment: CharacterEquipment[];

  @OneToMany(() => Inventory, (inventory) => inventory.character)
  inventory: Inventory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

