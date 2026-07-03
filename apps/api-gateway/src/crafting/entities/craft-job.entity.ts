import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CraftJobIngredient } from './craft-job-ingredient.entity';
import { CraftJobOutput } from './craft-job-output.entity';

/**
 * États du CraftJob (ADR-0009 V1). Le serveur possède toutes les transitions.
 * QUEUED est volontairement absent de la V1 (introduit avec les files/limites).
 */
export enum CraftJobState {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  CLAIMED = 'CLAIMED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

/**
 * CraftJob — production différée persistante (ADR-0009).
 *
 * Le job porte un SNAPSHOT IMMUABLE des règles au lancement : recipeId/version,
 * station, durée, difficulté, skill, XP, ingrédients et outputs. Le Runtime ne
 * relit jamais la recette/station vivante après le lancement.
 *
 * Les identifiants (recipeId, itemId dans les tables filles) sont stockés en
 * varchar SANS relation FK : le snapshot doit survivre à la suppression ou à la
 * modification des entités vivantes.
 *
 * Aucune matérialisation d'item n'est portée par le job : l'output n'existe qu'au
 * CLAIM (phases suivantes). Cette entité V1 ne fait que naître RUNNING avec ses
 * ingrédients réservés.
 */
@Entity('craft_job')
export class CraftJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  characterId: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: CraftJobState.RUNNING })
  state: CraftJobState;

  // ── Snapshot recette ────────────────────────────────────────────────────────
  @Column({ type: 'varchar' })
  recipeId: string;

  // Nom de la recette figé au lancement (affichage) — jamais relu de la recette
  // vivante, qui peut être renommée, désactivée ou supprimée.
  @Column({ type: 'varchar', length: 256, default: '' })
  recipeName: string;

  // Version de la recette au lancement (contenu : ingrédients, outputs, taux…).
  @Column({ type: 'int', default: 1 })
  recipeVersion: number;

  // Version de la structure CraftJob (schéma du snapshot lui-même).
  @Column({ type: 'int', default: 1 })
  jobVersion: number;

  // Version des règles Runtime (XP, qualité, probabilités) au lancement.
  @Column({ type: 'int', default: 1 })
  serverFormulaVersion: number;

  // ── Snapshot station ─────────────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true, default: null })
  stationId: string | null;

  @Column({ type: 'varchar', length: 64, default: 'none' })
  stationType: string;

  // ── Snapshot production ──────────────────────────────────────────────────────
  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'int', default: 0 })
  craftTimeMs: number;

  @Column({ type: 'int', default: 0 })
  craftingDifficulty: number;

  @Column({ type: 'varchar', length: 64 })
  requiredSkillKey: string;

  @Column({ type: 'int', default: 1 })
  requiredSkillLevel: number;

  @Column({ type: 'int', default: 0 })
  craftCharacterXpReward: number;

  @Column({ type: 'boolean', default: true })
  consumeIngredientsOnFailure: boolean;

  // Barème de succès figé — utilisé par la complétion (phases suivantes).
  @Column({ type: 'float', default: 1.0 })
  baseSuccessRate: number;

  @Column({ type: 'float', default: 0.0 })
  successBonusPerLevel: number;

  @Column({ type: 'float', default: 0.05 })
  minSuccessRate: number;

  @Column({ type: 'float', default: 1.0 })
  maxSuccessRate: number;

  // ── Temps ────────────────────────────────────────────────────────────────────
  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz' })
  finishAt: Date;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  claimedAt: Date | null;

  // ── Résultat figé à la complétion (RUNNING → COMPLETED/FAILED) ────────────────
  // Ce ne sont PAS des items : simples compteurs permettant un claim futur.
  @Column({ type: 'int', default: 0 })
  successes: number;

  @Column({ type: 'int', default: 0 })
  failures: number;

  @OneToMany(() => CraftJobIngredient, (ing) => ing.job, { cascade: true })
  ingredients: CraftJobIngredient[];

  @OneToMany(() => CraftJobOutput, (out) => out.job, { cascade: true })
  outputs: CraftJobOutput[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
