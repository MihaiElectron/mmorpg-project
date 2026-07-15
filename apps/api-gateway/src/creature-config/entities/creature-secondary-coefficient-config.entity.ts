import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * CreatureSecondaryCoefficientConfig — coefficients globaux de dérivation des
 * stats secondaires créature (singleton id=1, V6-B2.5 Lot 2).
 *
 * Source de vérité serveur unique des 14 coefficients (primaires → secondaires).
 * Les valeurs par défaut reproduisent exactement
 * `DEFAULT_CREATURE_SECONDARY_COEFFICIENTS` (équilibrage V6-B2 inchangé). Le
 * serveur applique ces coefficients dans `resolveCombatStats` ; le Studio les
 * éditera (lots suivants). Aucune configuration par créature.
 *
 * Colonnes `double precision` NOT NULL (coefficients décimaux). `synchronize:
 * true` crée la table en dev ; la migration dédiée la versionne pour la prod.
 */
@Entity('creature_secondary_coefficient_config')
export class CreatureSecondaryCoefficientConfig {
  @PrimaryColumn('int', { default: 1 })
  id: number;

  // ── Actifs en combat ────────────────────────────────────────────────────────
  @Column('double precision', { default: 2, name: 'attack_power_per_strength' })
  attackPowerPerStrength: number;

  @Column('double precision', { default: 1, name: 'defense_total_per_endurance' })
  defenseTotalPerEndurance: number;

  @Column('double precision', { default: 0.5, name: 'accuracy_per_dexterity' })
  accuracyPerDexterity: number;

  // ── Calculés, non actifs en défense ─────────────────────────────────────────
  @Column('double precision', { default: 0.3, name: 'dodge_per_agility' })
  dodgePerAgility: number;

  @Column('double precision', { default: 0.2, name: 'block_per_endurance' })
  blockPerEndurance: number;

  @Column('double precision', { default: 0.1, name: 'block_per_strength' })
  blockPerStrength: number;

  @Column('double precision', { default: 25, name: 'block_reduction_percent' })
  blockReductionPercent: number;

  @Column('double precision', { default: 0.15, name: 'parry_per_strength' })
  parryPerStrength: number;

  @Column('double precision', { default: 0.15, name: 'parry_per_dexterity' })
  parryPerDexterity: number;

  @Column('double precision', { default: 0.4, name: 'counter_per_dexterity' })
  counterPerDexterity: number;

  @Column('double precision', { default: 0.3, name: 'counter_per_agility' })
  counterPerAgility: number;

  @Column('double precision', { default: 0.2, name: 'counter_per_intelligence' })
  counterPerIntelligence: number;

  @Column('double precision', { default: 10, name: 'max_health_per_vitality' })
  maxHealthPerVitality: number;

  @Column('double precision', { default: 40, name: 'secondary_chance_cap' })
  secondaryChanceCap: number;
}
