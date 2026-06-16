import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Character } from '../../characters/entities/character.entity';

export enum UserRole {
  PLAYER = 'player',
  ADMIN = 'admin',
}

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

  /**
   * Role applicatif. Le client ne peut jamais le definir lui-meme
   * (register force toujours PLAYER) ; le passage en ADMIN se fait hors API.
   */
  @Column({ type: 'enum', enum: UserRole, default: UserRole.PLAYER })
  role: UserRole;

  @OneToMany(() => Character, (character) => character.user)
  characters: Character[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
