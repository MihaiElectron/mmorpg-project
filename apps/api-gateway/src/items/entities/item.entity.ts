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

export enum ObjectMode {
  STACKABLE = 'STACKABLE',
  INSTANCE = 'INSTANCE',
}

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
   * Portée d'attaque en pixels (pour les armes). Si non définie, une portée
   * par défaut s'applique selon le slot (corps à corps ou arme à distance).
   */
  @Column({ nullable: true })
  range: number;

  /**
   * Type d'arme utilisé par le Runtime pour résoudre le skill associé.
   * Exemples : 'bow', 'crossbow', 'two_handed_sword', 'two_handed_axe'.
   * null = item sans skill d'arme associé.
   */
  @Column({ nullable: true })
  weaponType: string | null;

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

  @Column({ type: 'enum', enum: ObjectMode, default: ObjectMode.STACKABLE })
  objectMode: ObjectMode;

  /**
   * Template actif ou non. Un template desactive reste en base (references
   * historiques preservees) mais ne doit plus etre propose a la creation
   * d'instances/stacks. Utilise par la maintenance DevTools.
   */
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

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
