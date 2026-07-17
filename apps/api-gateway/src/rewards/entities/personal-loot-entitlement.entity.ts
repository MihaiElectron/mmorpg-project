import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Character } from '../../characters/entities/character.entity';
import { Item } from '../../items/entities/item.entity';
import { PersonalLootEntitlementStatus } from '../enums/personal-loot-entitlement-status.enum';

/**
 * Droit de butin personnel — source persistante et AUTORITAIRE d'une récompense
 * attribuée à un personnage précis (butin important/légendaire à venir).
 *
 * Lot 1 — FONDATION SEULEMENT : cette table existe mais n'est branchée à aucun
 * gameplay (ni kill, ni WorldItem, ni inventaire, ni mailbox). Le loot ordinaire
 * reste partagé au sol (`WorldItem.ownerCharacterId = null`). Les futurs lots
 * composeront `entitlement + WorldItem`, puis `entitlement + Inventory`, puis
 * `entitlement + MailMessage` dans une même transaction.
 *
 * Anti-duplication : la clé (killId, characterId, rewardRollId) est unique — un
 * même objet peut être obtenu plusieurs fois dans un kill via des lignes de
 * récompense (rewardRollId) différentes, d'où l'exclusion volontaire de itemId.
 *
 * Politiques de suppression : `onDelete: RESTRICT` sur item ET character pour
 * PRÉSERVER L'AUDIT — un droit ne doit jamais disparaître silencieusement par
 * cascade. `sourceCreatureId`/`sourceEncounterId` restent des scalaires (pas de
 * FK) car ils référencent des entités runtime éphémères.
 */
@Entity()
@Unique('UQ_personal_loot_entitlement_kill_character_roll', [
  'killId',
  'characterId',
  'rewardRollId',
])
@Check('CHK_personal_loot_entitlement_quantity_positive', '"quantity" > 0')
@Index('IDX_personal_loot_entitlement_character_status', ['characterId', 'status'])
@Index('IDX_personal_loot_entitlement_status_ground_expires', [
  'status',
  'groundExpiresAt',
])
@Index('IDX_personal_loot_entitlement_status_mail_expires', [
  'status',
  'mailExpiresAt',
])
export class PersonalLootEntitlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Clé d'idempotence (jetons opaques stables produits par le futur Lot 2) ──
  /** Identifiant stable d'une résolution de mort. Immuable, jamais régénéré au retry. */
  @Column({ type: 'varchar' })
  killId: string;

  /** Personnage bénéficiaire du droit (obligatoire). */
  @Column({ type: 'uuid' })
  characterId: string;

  @ManyToOne(() => Character, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'characterId' })
  character: Character;

  /** Identifiant stable d'une ligne/tirage de récompense. Immuable. */
  @Column({ type: 'varchar' })
  rewardRollId: string;

  // ── Récompense (loot d'objet pour ce lot) ───────────────────────────────────
  /** Référence concrète de la récompense (objet du catalogue) pour ce lot. */
  @Column({ type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'itemId' })
  item: Item;

  /** Quantité (entier strictement positif — garanti par CHECK PostgreSQL). */
  @Column({ type: 'integer' })
  quantity: number;

  // ── État autoritaire ────────────────────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: PersonalLootEntitlementStatus,
    enumName: 'personal_loot_entitlement_status_enum',
    default: PersonalLootEntitlementStatus.GROUND,
  })
  status: PersonalLootEntitlementStatus;

  // ── Cohérence temporelle (schéma prêt, comportements non activés) ────────────
  /** Fin de présence au sol (représentation WorldItem à venir). */
  @Column({ type: 'timestamp', nullable: true })
  groundExpiresAt: Date | null;

  /** Fin de rétention mailbox (canal MailMessage à venir). */
  @Column({ type: 'timestamp', nullable: true })
  mailExpiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  claimedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiredAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  // ── Audit de provenance (scalaires, entités runtime éphémères — pas de FK) ───
  @Column({ type: 'varchar', nullable: true })
  sourceCreatureId: string | null;

  @Column({ type: 'varchar', nullable: true })
  sourceEncounterId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
