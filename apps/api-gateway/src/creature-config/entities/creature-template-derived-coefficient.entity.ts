import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CreatureTemplateDerivedStatOverride } from './creature-template-derived-stat-override.entity';

/**
 * Coefficient primaire d'un override de dérivation : `primaryStatKey × coefficient`
 * pour la statistique dérivée du marqueur parent. 0..n lignes par override
 * (zéro = map vide volontaire). `coefficient` fini, négatif autorisé.
 *
 * `onDelete: CASCADE` depuis le marqueur parent. Unicité (override, primaire)
 * pour interdire un doublon de primaire sur une même dérivée d'un même template.
 */
@Entity('creature_template_derived_coefficient')
@Unique('UQ_ctdc_override_primary', ['overrideId', 'primaryStatKey'])
export class CreatureTemplateDerivedCoefficient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  overrideId: string;

  @ManyToOne(() => CreatureTemplateDerivedStatOverride, (o) => o.coefficients, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'overrideId' })
  override: CreatureTemplateDerivedStatOverride;

  /** Clé primaire (`PRIMARY_STAT_KEYS`) — ex: `strength`. */
  @Column({ type: 'varchar', length: 64 })
  primaryStatKey: string;

  @Column({ type: 'double precision' })
  coefficient: number;
}
