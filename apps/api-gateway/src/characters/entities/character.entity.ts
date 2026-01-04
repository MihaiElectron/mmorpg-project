/**
 * Character Entity
 * -----------------------------------------------------------------------------
 * Role:
 * - Represents a playable character in the MMORPG.
 * - Stores identity, appearance, and core attributes.
 * - Hosts the inverse relation to CharacterEquipment.
 *
 * Location:
 * mmorpg-project/apps/api-gateway/src/characters/entities/character.entity.ts
 *
 * Properties:
 * - userId       : owner player ID
 * - gender       : male / female / other
 * - name         : character name
 * - avatar       : image or visual identifier
 * - constitution : base stat
 * - strength     : base stat
 * - endurance    : base stat
 * - agility      : base stat
 * - dexterity    : base stat
 * - intelligence : base stat
 *
 * Notes:
 * - Skills (blacksmithing, magic, hunting, etc.) will be added later.
 * - OneToMany relation allows loading all equipment slots for a character.
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
  
    @Column()
    userId: number;
  
    @Column()
    gender: string;
  
    @Column()
    name: string;
  
    @Column({ nullable: true })
    avatar: string;
  
    @Column()
    constitution: number;
  
    @Column()
    strength: number;
  
    @Column()
    endurance: number;
  
    @Column()
    agility: number;
  
    @Column()
    dexterity: number;
  
    @Column()
    intelligence: number;
  
    @OneToMany(
      () => CharacterEquipment,
      (equipment) => equipment.character,
      { cascade: true }
    )
    equipment: CharacterEquipment[];
  
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;
  
    @Column({
      type: 'timestamp',
      default: () => 'CURRENT_TIMESTAMP',
      onUpdate: 'CURRENT_TIMESTAMP',
    })
    updatedAt: Date;
  }
  