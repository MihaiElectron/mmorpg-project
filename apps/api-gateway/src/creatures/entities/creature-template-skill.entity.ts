import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CreatureTemplate } from './creature-template.entity';

/**
 * Association CreatureTemplate 1—N CreatureTemplateSkill N—1 SkillDefinition (V5-A).
 *
 * Lie un `CreatureTemplate` à un `SkillDefinition` existant par sa `key` stable
 * (jamais un second système de skills : le catalogue reste `skill_definition`).
 * Config uniquement — AUCUN déclenchement combat en V5-A (l'IA qui consomme ces
 * capacités viendra plus tard). Édité exclusivement via `CreatureAbilitiesService`.
 *
 * `skillKey` référence `skill_definition.key` (même convention de clé stable que
 * les autres domaines) ; l'existence est validée à l'écriture par le service.
 */
@Entity('creature_template_skill')
@Index('idx_creature_template_skill_unique', ['creatureTemplateId', 'skillKey'], {
  unique: true,
})
export class CreatureTemplateSkill {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  creatureTemplateId: number;

  @ManyToOne(() => CreatureTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creatureTemplateId' })
  creatureTemplate: CreatureTemplate;

  /** Clé stable du SkillDefinition associé (skill_definition.key). */
  @Column({ type: 'varchar', length: 64 })
  skillKey: string;

  /** Capacité active pour ce template (désactivable sans la retirer). */
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** Ordre d'affichage / de priorité (l'IA future pourra s'en servir). */
  @Column({ type: 'int', default: 0 })
  displayOrder: number;
}
