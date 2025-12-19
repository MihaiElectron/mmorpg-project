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
} from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

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
}
