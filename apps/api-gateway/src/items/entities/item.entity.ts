import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CharacterEquipment } from '../../characters/entities/character-equipment.entity';
import { EquipmentSlot } from '../../characters/dto/equip-item.dto';
import { Inventory } from '../../inventory/entities/inventory.entity';

/**
 * Entity représentant un item du jeu
 */
@Entity()
export class Item {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  type: string;

  @Column()
  category: string;

  @Column({ nullable: true })
  attack: number;

  @Column({ nullable: true })
  defense: number;

  /**
   * Slot où l'item peut être équipé
   * Utilise l'enum EquipmentSlot pour la cohérence frontend / backend / DB
   */
  @Column({
    type: 'enum',
    enum: EquipmentSlot,
    nullable: true,
  })
  slot: EquipmentSlot;

  @Column({ nullable: true })
  image: string;

  /**
   * Relation avec l'équipement des personnages
   * Un item peut être équipé par plusieurs personnages
   */
  @OneToMany(
    () => CharacterEquipment,
    (characterEquipment) => characterEquipment.item,
  )
  characterEquipment: CharacterEquipment[];

  @OneToMany(() => Inventory, (inventory) => inventory.item)
  inventory: Inventory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
