import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CreatureTemplate } from '../../creatures/entities/creature-template.entity';

/**
 * Paramètre SCALAIRE par template (pas un coefficient). Générique : une ligne
 * par (template, clé de paramètre), aucune colonne fixe par statistique.
 * `scalarParamKey` ∈ `CREATURE_SCALAR_PARAM_KEYS` (validé serveur). `value`
 * finie. Présence ⇒ override ; absence ⇒ fallback singleton global.
 *
 * `onDelete: CASCADE` : supprimer un template retire ses paramètres.
 */
@Entity('creature_template_scalar_override')
@Unique('UQ_ctso_template_param', ['creatureTemplateId', 'scalarParamKey'])
export class CreatureTemplateScalarOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  @Index()
  creatureTemplateId: number;

  @ManyToOne(() => CreatureTemplate, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'creatureTemplateId' })
  creatureTemplate: CreatureTemplate;

  /** Clé canonique scalaire (`blockReductionPercent` | `secondaryChanceCap`). */
  @Column({ type: 'varchar', length: 64 })
  scalarParamKey: string;

  @Column({ type: 'double precision' })
  value: number;
}
