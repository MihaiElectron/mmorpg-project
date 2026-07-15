import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('creature_template')
export class CreatureTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  key: string;

  @Column()
  name: string;

  @Column()
  textureKey: string;

  @Column('int')
  baseHealth: number;

  @Column('int')
  baseArmor: number;

  @Column('int')
  baseAttack: number;

  @Column('int')
  patrolRadius: number;

  @Column('int')
  speedMin: number;

  @Column('int')
  speedMax: number;

  @Column('int', { default: 500 })
  pauseMinMs: number;

  @Column('int', { default: 3000 })
  pauseMaxMs: number;

  @Column('int', { default: 0 })
  aggroRadius: number;

  @Column('int', { default: 0 })
  fleeThresholdPct: number;

  @Column('int', { default: 20000 })
  respawnDelayMs: number;

  @Column({ type: 'jsonb', nullable: true, name: 'loot_pool', default: null })
  lootPool: any[] | null;

  /** XP globale accordée au personnage à chaque kill de cette créature. 0 = pas d'XP. */
  @Column('int', { default: 0, name: 'kill_character_xp_reward' })
  killCharacterXpReward: number;

  // ── Stats de combat avancées (V5-D2-A) ────────────────────────────────────
  // Valeurs de config lues directement (pas de RuntimeModifier pour l'instant).
  // Défauts = comportement V5-B/D1 inchangé (0 → pas de crit/accuracy/pénétration).

  /** Puissance de soin. 0 → fallback runtime sur attackPower (comportement V5-D1). */
  @Column('int', { default: 0, name: 'healing_power' })
  healingPower: number;

  /** Chance de critique en % (0–100). 0 = jamais de critique. */
  @Column('int', { default: 0, name: 'critical_chance' })
  criticalChance: number;

  /** Multiplicateur critique total en % (150 = ×1.5). Pertinent si criticalChance > 0. */
  @Column('int', { default: 150, name: 'critical_damage' })
  criticalDamage: number;

  /** Précision en points de % (réduit l'esquive effective de la cible). 0 = aucune. */
  @Column('int', { default: 0, name: 'accuracy' })
  accuracy: number;

  /** Pénétration d'armure en % (0–100) appliquée aux dégâts physiques. 0 = aucune. */
  @Column('int', { default: 0, name: 'armor_penetration_percent' })
  armorPenetrationPercent: number;

  // ── Stats primaires (V6-B1) ────────────────────────────────────────────────
  // Fondation de données uniquement : ces primaires ne sont PAS branchées au
  // combat (aucune dérivation active en V6-B1). Défaut 0 → créatures existantes
  // strictement inchangées. La dérivation primaires → secondaires viendra en V6-B2.

  @Column('int', { default: 0 })
  strength: number;

  @Column('int', { default: 0 })
  vitality: number;

  @Column('int', { default: 0 })
  endurance: number;

  @Column('int', { default: 0 })
  agility: number;

  @Column('int', { default: 0 })
  dexterity: number;

  @Column('int', { default: 0 })
  intelligence: number;

  @Column('int', { default: 0 })
  wisdom: number;

  @Column('int', { default: 0 })
  spirit: number;

  @Column('int', { default: 0 })
  willpower: number;

  @Column('int', { default: 0 })
  charisma: number;
}
