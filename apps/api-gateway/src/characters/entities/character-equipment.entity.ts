/**
 * CharacterEquipment Entity
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Représente un emplacement d’équipement occupé par un item pour un personnage.
 * - Chaque ligne correspond à un slot (HEADGEAR, MAIN_WEAPON, etc.) et l’item
 *   actuellement équipé dans ce slot.
 *
 * Emplacement :
 * mmorpg-project/apps/api-gateway/src/characters/entities/character-equipment.entity.ts
 *
 * Relations :
 * - ManyToOne → Character : un personnage possède plusieurs slots d’équipement.
 *
 * Remarques :
 * - La relation inverse (character.equipment) doit être ajoutée dans
 *   character.entity.ts pour que TypeORM puisse la résoudre.
 * - itemId est nullable car un slot peut être vide.
 * -----------------------------------------------------------------------------
 */

import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Character } from './character.entity';
import { EquipmentSlot } from '../enums/equipment-slot.enum';

@Entity('character_equipment')
export class CharacterEquipment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Character, (character) => character.equipment, {
    onDelete: 'CASCADE',
  })
  character: Character;

  @Column({
    type: 'enum',
    enum: EquipmentSlot,
  })
  slot: EquipmentSlot;

  @Column({
    type: 'int',
    nullable: true,
  })
  itemId: number | null;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
