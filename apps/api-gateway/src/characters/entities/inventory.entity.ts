/**
 * Inventory Entity
 * ----------------
 * Représente une ligne d’inventaire appartenant à un personnage.
 *
 * Structure alignée sur la base de données :
 * - Table : inventory
 * - character_id : FK → characters.id
 * - item_id      : identifiant d’un item (pas encore d’entité Item dans le backend)
 * - quantity     : quantité de l’item
 *
 * Relations :
 * - ManyToOne → Character (un personnage peut avoir plusieurs lignes d’inventaire)
 *
 * Notes :
 * - onDelete: 'CASCADE' garantit que si un personnage est supprimé,
 *   toutes ses lignes d’inventaire le sont aussi.
 * - Aucun autre module n’est impacté.
 */

import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Character } from './character.entity';

@Entity('inventory')
export class Inventory {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ---------------------------------------------------------
  // character_id : FK vers characters.id
  // ---------------------------------------------------------
  @Column({ name: 'character_id' })
  characterId: string;

  @ManyToOne(() => Character, character => character.inventory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character: Character;

  // ---------------------------------------------------------
  // item_id : simple colonne (pas encore d'entité Item)
  // ---------------------------------------------------------
  @Column({ name: 'item_id' })
  itemId: string;

  // ---------------------------------------------------------
  // quantity : simple colonne numérique
  // ---------------------------------------------------------
  @Column()
  quantity: number;
}
