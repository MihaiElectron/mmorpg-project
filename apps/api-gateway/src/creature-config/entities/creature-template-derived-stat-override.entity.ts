import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CreatureTemplate } from '../../creatures/entities/creature-template.entity';
import { CreatureTemplateDerivedCoefficient } from './creature-template-derived-coefficient.entity';

/**
 * Marqueur d'override de dérivation par (template, statistique dérivée).
 *
 * La PRÉSENCE d'une ligne signifie que les coefficients de cette dérivée sont
 * contrôlés par le template : la map (= les {@link CreatureTemplateDerivedCoefficient}
 * enfants, éventuellement ZÉRO) remplace intégralement la map globale. Son
 * absence = fallback historique. Ce marqueur est indispensable pour distinguer
 * une « map vide volontaire » (override présent, zéro enfant) d'un « pas
 * d'override » (aucune ligne).
 *
 * `onDelete: CASCADE` : supprimer un template retire ses overrides (config, pas
 * d'audit).
 */
@Entity('creature_template_derived_stat_override')
@Unique('UQ_ctdso_template_stat', ['creatureTemplateId', 'derivedStatKey'])
export class CreatureTemplateDerivedStatOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  @Index()
  creatureTemplateId: number;

  @ManyToOne(() => CreatureTemplate, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'creatureTemplateId' })
  creatureTemplate: CreatureTemplate;

  /** Clé canonique du catalogue `derived_stat_definition` (ex: `physicalAttack`). */
  @Column({ type: 'varchar', length: 64 })
  derivedStatKey: string;

  @OneToMany(
    () => CreatureTemplateDerivedCoefficient,
    (coef) => coef.override,
  )
  coefficients: CreatureTemplateDerivedCoefficient[];
}
