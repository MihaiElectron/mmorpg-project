/**
 * User Entity
 * -----------
 * Représente un utilisateur dans la base de données.
 *
 * Champs :
 * - id : identifiant unique
 * - username : nom d'utilisateur unique
 * - password : mot de passe hashé
 * - isActive : indique si le compte est actif (true par défaut)
 * - createdAt : date de création automatique
 * - updatedAt : date de mise à jour automatique
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne, // ajout nécessaire
} from 'typeorm';

import { Character } from '../characters/entities/character.entity'; // ajout nécessaire

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // Relation One-to-One avec Character
  @OneToOne(() => Character, character => character.user)
  character: Character;
}
