import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Catégories d'affichage/regroupement DevTools (Character Progression).
 * Purement organisationnelles — n'influencent aucun calcul.
 */
export type DerivedStatCategory =
  | 'resources'
  | 'offensive'
  | 'defensive'
  | 'elemental_resistance'
  | 'mobility_control'
  | 'social_threat';

/**
 * DerivedStatDefinition — source de vérité serveur des formules de calcul des
 * stats dérivées (remplace les coefficients hardcodés de
 * CharacterStatsCalculator, cf. ADR Runtime-Driven Architecture).
 *
 * Formule appliquée par dérivée (CharacterStatsCalculator) :
 *   valeur = (rawStatSource ? character[rawStatSource] : baseValue)
 *            + Σ( primaryCoefficients[primaire] × final[primaire] )
 *   puis clamp [minValue, maxValue] si définis.
 *
 * `rawStatSource` couvre le cas des 3 dérivées combat V1 (maxHealth,
 * physicalAttack, defense) qui s'additionnent à une colonne Character brute
 * (incluant l'équipement legacy) plutôt qu'à une constante — jamais les deux
 * à la fois.
 */
@Entity('derived_stat_definition')
export class DerivedStatDefinition {
  /** Clé stable = nom du champ dans DerivedStats (ex: "criticalChance"). */
  @PrimaryColumn()
  key: string;

  @Column()
  label: string;

  @Column({ type: 'varchar' })
  category: DerivedStatCategory;

  @Column('float', { default: 0 })
  baseValue: number;

  /**
   * Si renseigné, remplace baseValue par la colonne brute correspondante du
   * Character (ex: "maxHealth", "attack", "defense") — utilisé uniquement
   * par les 3 dérivées branchées combat V1.
   */
  @Column({ type: 'varchar', nullable: true })
  rawStatSource: string | null;

  /** Coefficients par stat primaire finale, ex: { dexterity: 0.3, agility: 0.2 }. */
  @Column('jsonb', { default: {} })
  primaryCoefficients: Record<string, number>;

  @Column('float', { nullable: true })
  minValue: number | null;

  @Column('float', { nullable: true })
  maxValue: number | null;

  /** Ordre d'affichage DevTools/panneau joueur au sein de sa catégorie. */
  @Column('int', { default: 0 })
  displayOrder: number;

  /**
   * Si false, la dérivée est forcée à 0 (jamais omise de DerivedStats — le
   * contrat de sortie garde toujours ses 24 clés pour ne pas casser les
   * consommateurs qui lisent `stats.derived.<key>` sans garde). Prévu pour
   * désactiver une dérivée sans supprimer sa définition ; jamais utilisé en
   * V1 (toutes enabled=true par défaut).
   */
  @Column({ default: true })
  enabled: boolean;
}
