/**
 * Character Entity (Version simplifiée pour MVP)
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Représente un personnage jouable.
 * - Correspond EXACTEMENT aux données envoyées par le frontend.
 * - Version minimaliste pour permettre la création d’un personnage
 *   sans stats complexes (constitution, force, etc.).
 *
 * IMPORTANT :
 * - Le frontend envoie : { name, sex }
 * - Donc l’entity doit contenir : name, sex, avatar?, userId
 * - Tous les autres champs (stats) sont retirés pour éviter les erreurs 400.
 *
 * Tu pourras réintroduire les stats plus tard quand ton système sera stable.
 * -----------------------------------------------------------------------------
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { CharacterEquipment } from './character-equipment.entity';
import { Inventory } from './inventory.entity';

@Entity('characters')
export class Character {
  @PrimaryGeneratedColumn()
  id: number;

  // ID du joueur propriétaire (unique : 1 joueur = 1 personnage)
  @Column({ unique: true })
  userId: string;

  // Relation One-to-One avec User (1 user = 1 personnage)
  @OneToOne(() => User, user => user.character, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Sexe du personnage (male / female)
  @Column()
  sex: string;

  // Nom du personnage (unique)
  @Column({ unique: true })
  name: string;

  // Avatar optionnel
  @Column({ nullable: true })
  avatar: string;

  // Relation avec l’équipement (facultatif pour le MVP)
  @OneToMany(
    () => CharacterEquipment,
    (equipment) => equipment.character,
    { cascade: true }
  )
  equipment: CharacterEquipment[];

  // Audit fields
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @OneToMany(() => Inventory, inventory => inventory.character)
  inventory: Inventory[];
}
