import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Character } from '../../characters/entities/character.entity';

/**
 * User Entity
 * -----------
 * Représente un utilisateur du système.
 * - Relation 1-N avec Character (un utilisateur peut avoir plusieurs personnages)
 * - Mot de passe hashé avec bcrypt
 * - isActive pour désactiver un compte sans le supprimer
 */
@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string; // Hashé avec bcrypt

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Character, (character) => character.user)
  characters: Character[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
