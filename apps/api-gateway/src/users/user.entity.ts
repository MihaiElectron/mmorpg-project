/**
 * Entité User
 * ----------------------------
 * Représente la table "users" dans la base de données.
 * Chaque instance correspond à un utilisateur persistant.
 *
 * Colonnes :
 * - id        : identifiant unique auto-généré
 * - username  : nom d'utilisateur (unique)
 * - password  : mot de passe (stocké hashé)
 */

import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;
}
