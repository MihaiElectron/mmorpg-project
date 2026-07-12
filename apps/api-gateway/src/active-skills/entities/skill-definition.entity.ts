import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  SkillDamageType,
  SkillEffectType,
  SkillKind,
  SkillResourceType,
  SkillTargetMode,
} from '../active-skills.constants';

/**
 * SkillDefinition — catalogue serveur des skills actifs (ADR-0019, V1-A).
 *
 * Config uniquement : aucune donnée d'état joueur (le déverrouillage joueur est
 * hors scope V1-A). Édité exclusivement par `ActiveSkillsService` via les routes
 * admin — jamais d'INSERT direct ni de mutation hors service.
 *
 * Table dédiée : ne réutilise JAMAIS `mastery_definition`. Un Skill (action
 * active) et une Mastery (progression passive) sont deux domaines distincts.
 *
 * Plusieurs champs sont « préparés » pour l'évolution ADR-0018 sans être
 * pleinement actifs en V1 : `requiredClass` (pas de modèle de classe),
 * `castTimeMs` (V1 instantané), coûts `mana`/`energy` (ressources courantes non
 * implémentées). Ils sont persistés mais leur activation viendra d'ADR
 * ultérieures.
 */
@Entity('skill_definition')
export class SkillDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Clé contrôlée, stable, unique — référence runtime future, immuable après usage. */
  @Column({ type: 'varchar', length: 64, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 256 })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  /** AssetPath public Vite (ex: "/assets/skills/xxx.png"). Nullable. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  iconAssetPath: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  // ── Nature & déverrouillage (V1-H) ──────────────────────────────────────────

  /** active | passive | aura. Seuls les `active` sont lançables (défaut). */
  @Column({ type: 'varchar', length: 16, default: 'active' })
  skillKind: SkillKind;

  /**
   * Si true, le skill est disponible pour tous les personnages sans ligne
   * `player_skill_unlock` (rétro-compat). Si false, il faut un déverrouillage
   * explicite par personnage. Règle : débloqué = `autoUnlock === true` OU
   * ligne `player_skill_unlock` présente.
   */
  @Column({ type: 'boolean', default: true })
  autoUnlock: boolean;

  // ── Prérequis ──────────────────────────────────────────────────────────────

  @Column({ type: 'int', default: 1 })
  requiredLevel: number;

  /** Différé V1 : aucun modèle de classe n'existe encore. Jamais bloquant si null. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  requiredClass: string | null;

  /** Prérequis masteries : { masteryKey: levelMinimum }. */
  @Column({ type: 'jsonb', default: {} })
  requiredMasteries: Record<string, number>;

  /**
   * Type d'arme auquel le skill est explicitement lié (V1-D-Skills-A).
   * Même contrat string libre que `item.weaponType` (`two_handed_sword`,
   * `bow`…). null = skill non lié à une arme (sort, soin, utilitaire) :
   * il ne recevra JAMAIS de bonus de maîtrise d'arme. Déclaratif seulement
   * en V1-D-Skills-A — n'impose pas l'arme pour caster, n'applique aucun
   * bonus (branchement prévu en V1-D-Skills-B).
   */
  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  weaponType: string | null;

  // ── Coût (préparé) ───────────────────────────────────────────────────────────

  /** health | mana | energy — null = aucun coût. mana/energy non exécutables V1. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  resourceType: SkillResourceType | null;

  @Column({ type: 'int', default: 0 })
  resourceCost: number;

  // ── Timing / portée ─────────────────────────────────────────────────────────

  @Column({ type: 'int', default: 1000 })
  cooldownMs: number;

  /** Préparé — V1 attend 0 (instantané). */
  @Column({ type: 'int', default: 0 })
  castTimeMs: number;

  /** Portée de validation serveur (distance Chebyshev en WU). */
  @Column({ type: 'int', default: 1 })
  rangeWU: number;

  /** Rayon d'effet (préparé — 0 = mono-cible en V1). */
  @Column({ type: 'int', default: 0 })
  radiusWU: number;

  // ── Ciblage / effet ─────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 16, default: 'creature' })
  targetMode: SkillTargetMode;

  @Column({ type: 'varchar', length: 16, default: 'damage' })
  effectType: SkillEffectType;

  /**
   * Type de dégâts (V4-B) : `physical` (armure + `armorPenetrationPercent`
   * appliquées) ou `raw` (ignore armure et pénétration). Défaut `physical`.
   * Pertinent uniquement pour `effectType: 'damage'` — ignoré pour un soin.
   */
  @Column({ type: 'varchar', length: 16, default: 'physical' })
  damageType: SkillDamageType;

  /**
   * Coefficients de scaling serveur, ex :
   * { primaryCoefficients: { strength: 1.2 }, derivedCoefficients: { physicalAttack: 0.5 },
   *   masteryCoefficients: { two_handed: 0.1 } }.
   * Interprété par le futur calculateur pur (V1-B). Ici : stockage/validation seuls.
   */
  @Column({ type: 'jsonb', default: {} })
  scaling: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
