import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * GameConfig — règles globales de gameplay (singleton id=1).
 *
 * Source de vérité serveur unique pour la progression du personnage
 * (ADR-0018). Le Studio configure/inspecte ces valeurs ; le serveur reste le
 * seul à calculer XP, niveaux et points de stats à partir d'elles.
 *
 * Étape 1A : stockage + lecture/écriture admin. Le recalcul destructif des
 * personnages existants (réaffectation des points, ADR-0018 §1) N'EST PAS
 * exécuté à cette étape.
 */
@Entity('game_config')
export class GameConfig {
  @PrimaryColumn()
  id: number;

  // ── XP — modèle par tranches multiplicatives (ADR-0018) ─────────────────────
  // XP requise pour atteindre le niveau N = XP requise du niveau précédent
  // × multiplicateur de la tranche du niveau N. La première marche (1 → 2) coûte
  // startingXp.
  @Column('int', { default: 100, name: 'starting_xp' })
  startingXp: number;

  @Column('float', { default: 1.2, name: 'xp_multiplier_level_1_10' })
  xpMultiplierLevel1To10: number;

  @Column('float', { default: 1.15, name: 'xp_multiplier_level_11_30' })
  xpMultiplierLevel11To30: number;

  @Column('float', { default: 1.12, name: 'xp_multiplier_level_31_60' })
  xpMultiplierLevel31To60: number;

  @Column('float', { default: 1.1, name: 'xp_multiplier_level_61_120' })
  xpMultiplierLevel61To120: number;

  // ── XP — champs LEGACY (ancien modèle base × level^exp × coeff) ──────────────
  // Conservés pour compatibilité et non-perte de données. Ne sont plus utilisés
  // par le calcul de progression. Ne pas supprimer dans cette étape.
  @Column('int', { default: 100, name: 'character_base_xp_per_level' })
  characterBaseXpPerLevel: number;

  @Column('float', { default: 1.5, name: 'character_xp_curve_exponent' })
  characterXpCurveExponent: number;

  @Column('float', { default: 1.0, name: 'character_xp_coefficient' })
  characterXpCoefficient: number;

  @Column('float', { default: 1.0, name: 'high_level_xp_multiplier' })
  highLevelXpMultiplier: number;

  // ── Niveaux ─────────────────────────────────────────────────────────────────
  /** Niveau maximum final absolu (ADR-0018 : 120). */
  @Column('int', { default: 120, name: 'character_max_level' })
  characterMaxLevel: number;

  /**
   * Cap de niveau actuellement débloqué (ADR-0018 : 60 au lancement).
   * Au-delà, la progression est ralentie par highLevelXpMultiplier.
   */
  @Column('int', { default: 60, name: 'character_current_level_cap' })
  characterCurrentLevelCap: number;

  // ── Points de stats ─────────────────────────────────────────────────────────
  /** Points de stats libres accordés au niveau 1. */
  @Column('int', { default: 3, name: 'stat_points_at_level_one' })
  statPointsAtLevelOne: number;

  /** Points de stats libres accordés à chaque niveau gagné. */
  @Column('int', { default: 3, name: 'stat_points_per_level' })
  statPointsPerLevel: number;

  // ── Masteries (caps globaux — inertes tant que les masteries ne sont pas
  //     implémentées ; stockés ici pour Studio, ADR-0018) ────────────────────
  @Column('int', { default: 1000, name: 'mastery_natural_cap' })
  masteryNaturalCap: number;

  @Column('int', { default: 2000, name: 'mastery_overcap' })
  masteryOvercap: number;
}
