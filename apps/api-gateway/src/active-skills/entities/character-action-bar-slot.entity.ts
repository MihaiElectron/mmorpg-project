import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Character } from '../../characters/entities/character.entity';
import { SkillDefinition } from './skill-definition.entity';

/**
 * CharacterActionBarSlot — un slot de la barre d'action persistante d'un
 * personnage (Skills V1-I). `slotIndex` borné 0..ACTION_BAR_SLOT_COUNT-1 (validé
 * serveur, pas par le schéma). `skillDefinitionId` nullable = slot vide.
 *
 * Lien par `skillDefinitionId` (FK), jamais par `key` (cohérent avec
 * `PlayerSkillUnlock`). `onDelete: SET NULL` : supprimer un skill du catalogue
 * VIDE automatiquement les slots qui le référençaient (pas de clé fantôme).
 * `onDelete: CASCADE` côté personnage.
 *
 * Seuls des skills `skillKind === 'active'` peuvent être équipés (validé par
 * `ActionBarService.setActionBarSlot`). Le schéma ne l'impose pas.
 */
@Entity('character_action_bar_slot')
@Unique(['characterId', 'slotIndex'])
export class CharacterActionBarSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Character, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'characterId' })
  character: Character;

  @Index()
  @Column()
  characterId: string;

  @Column({ type: 'int' })
  slotIndex: number;

  @ManyToOne(() => SkillDefinition, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'skillDefinitionId' })
  skillDefinition: SkillDefinition | null;

  @Column({ type: 'uuid', nullable: true })
  skillDefinitionId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
