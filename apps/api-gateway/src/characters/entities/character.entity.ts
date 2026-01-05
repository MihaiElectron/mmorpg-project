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
  OneToMany,
} from 'typeorm';
import { CharacterEquipment } from './character-equipment.entity';

@Entity('characters')
export class Character {
  @PrimaryGeneratedColumn()
  id: number;

  // ID du joueur propriétaire (unique : 1 joueur = 1 personnage)
  @Column({ unique: true })
  userId: number;

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
}
