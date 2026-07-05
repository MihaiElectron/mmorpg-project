import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { CharacterEquipment } from './character-equipment.entity';
import { Inventory } from '../../inventory/entities/inventory.entity';

/**
 * Character Entity
 * ----------------
 * Représente un personnage de jeu appartenant à un utilisateur.
 * - Relation N-1 avec User (un utilisateur peut avoir plusieurs personnages)
 * - Relation 1-N avec CharacterEquipment (un personnage peut avoir plusieurs équipements)
 */
@Entity()
export class Character {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ default: 1 })
  level: number;

  @Column({ default: 100 })
  health: number;

  @Column({ default: 100 })
  maxHealth: number;

  @Column({ default: 0 })
  experience: number;

  @Column({ default: 0 })
  baseAttack: number;

  @Column({ default: 0 })
  baseDefense: number;

  @Column({ default: 0 })
  attack: number; // stat finale = baseAttack + Σ équipement

  @Column({ default: 0 })
  defense: number; // stat finale = baseDefense + Σ équipement

  // ── Stats principales (Progression V1) ────────────────────────────────────
  // Points permanents alloués par le joueur. L'équipement / buffs / passifs /
  // debuffs viendront plus tard sous forme de modifiers (voir
  // CharacterStatsCalculator). Le frontend ne recalcule jamais les stats finales.
  @Column({ default: 0 })
  baseStrength: number;

  @Column({ default: 0 })
  baseVitality: number;

  @Column({ default: 0 })
  baseEndurance: number;

  @Column({ default: 0 })
  baseAgility: number;

  @Column({ default: 0 })
  baseDexterity: number;

  @Column({ default: 0 })
  baseIntelligence: number;

  @Column({ default: 0 })
  baseWisdom: number;

  @Column({ default: 0 })
  baseCritical: number;

  // Points de stats gagnés au level-up et pas encore dépensés.
  @Column({ default: 0 })
  unspentStatPoints: number;

  // ── Coordonnées WU ───────────────────────────────────────────────────────
  @Column({ type: 'int', nullable: true })
  worldX: number | null;

  @Column({ type: 'int', nullable: true })
  worldY: number | null;

  @Column({ type: 'int', nullable: true })
  mapId: number | null;

  @ManyToOne(() => User, (user) => user.characters, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ nullable: false })
  sex: string;

  @OneToMany(
    () => CharacterEquipment,
    (characterEquipment) => characterEquipment.character,
    { cascade: true },
  )
  equipment: CharacterEquipment[];

  @OneToMany(() => Inventory, (inventory) => inventory.character)
  inventory: Inventory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
