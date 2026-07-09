import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharacterActionBarSlot } from './entities/character-action-bar-slot.entity';
import { Character } from '../characters/entities/character.entity';
import { ActiveSkillsService } from './active-skills.service';
import { MasteriesService } from '../masteries/masteries.service';
import {
  ACTION_BAR_SLOT_COUNT,
  ActionBarUnavailableReason,
  SkillKind,
  isValidActionBarSlotIndex,
} from './active-skills.constants';

/** Vue joueur d'un slot de barre d'action (Skills V1-I). */
export interface ActionBarSlotView {
  slotIndex: number;
  skillKey: string | null;
  name: string | null;
  iconAssetPath: string | null;
  skillKind: SkillKind | null;
  enabled: boolean | null;
  available: boolean;
  /** `null` si disponible ; `"empty"` si vide ; sinon la raison. */
  unavailableReason: ActionBarUnavailableReason | null;
}

const EMPTY_SLOT = (slotIndex: number): ActionBarSlotView => ({
  slotIndex,
  skillKey: null,
  name: null,
  iconAssetPath: null,
  skillKind: null,
  enabled: null,
  available: false,
  unavailableReason: 'empty',
});

/**
 * ActionBarService — barre d'action persistante par personnage (Skills V1-I-A).
 *
 * Toujours 8 slots (`ACTION_BAR_SLOT_COUNT`), même sans ligne DB. Un slot
 * référence une `SkillDefinition` par id (jamais par `key`). Seuls des skills
 * `skillKind === 'active'`, `enabled`, débloqués et dont les prérequis sont
 * satisfaits peuvent être équipés — validation 100 % serveur. Au cast,
 * `SkillCastService` reste l'autorité finale.
 *
 * Réutilise `ActiveSkillsService` (résolution, unlock, règles de disponibilité)
 * et `MasteriesService` (niveaux) — aucune règle dupliquée.
 */
@Injectable()
export class ActionBarService {
  constructor(
    @InjectRepository(CharacterActionBarSlot)
    private readonly slotRepo: Repository<CharacterActionBarSlot>,
    @InjectRepository(Character)
    private readonly characterRepo: Repository<Character>,
    private readonly activeSkills: ActiveSkillsService,
    private readonly masteries: MasteriesService,
  ) {}

  /** Contexte d'évaluation (niveau + masteries + unlocks) pour un personnage. */
  private async loadContext(characterId: string): Promise<{
    characterLevel: number;
    masteryLevels: Record<string, number>;
    unlockedIds: Set<string>;
  }> {
    const [character, masteryRows, unlockedIds] = await Promise.all([
      this.characterRepo.findOne({ where: { id: characterId } }),
      this.masteries.getCharacterMasteries(characterId),
      this.activeSkills.getUnlockedSkillDefinitionIds(characterId),
    ]);
    const masteryLevels: Record<string, number> = {};
    for (const m of masteryRows) masteryLevels[m.key] = m.level;
    return { characterLevel: character?.level ?? 1, masteryLevels, unlockedIds };
  }

  /** Les 8 slots résolus du personnage (slots absents/vides inclus). */
  async getActionBar(characterId: string): Promise<{ slots: ActionBarSlotView[] }> {
    const [rows, definitions, ctx] = await Promise.all([
      this.slotRepo.find({ where: { characterId } }),
      this.activeSkills.listDefinitions(),
      this.loadContext(characterId),
    ]);
    const defById = new Map(definitions.map((d) => [d.id, d]));
    const rowByIndex = new Map(rows.map((r) => [r.slotIndex, r]));

    const slots: ActionBarSlotView[] = [];
    for (let i = 0; i < ACTION_BAR_SLOT_COUNT; i++) {
      const row = rowByIndex.get(i);
      const def = row?.skillDefinitionId ? defById.get(row.skillDefinitionId) : undefined;
      if (!def) {
        // Slot absent, vidé, ou skill supprimé (FK SET NULL) → vide.
        slots.push(EMPTY_SLOT(i));
        continue;
      }
      const reason = this.activeSkills.evaluateSkillAvailability(
        def,
        ctx.characterLevel,
        ctx.masteryLevels,
        ctx.unlockedIds.has(def.id),
      );
      slots.push({
        slotIndex: i,
        skillKey: def.key,
        name: def.name,
        iconAssetPath: def.iconAssetPath,
        skillKind: def.skillKind,
        enabled: def.enabled,
        available: reason === null,
        unavailableReason: reason,
      });
    }
    return { slots };
  }

  /**
   * Équipe (`skillKey` string) ou vide (`skillKey` null) un slot. Validation
   * serveur complète ; le client ne décide jamais. Ré-équiper un slot remplace
   * l'ancien skill (unique(characterId, slotIndex), aucun doublon).
   */
  async setActionBarSlot(
    characterId: string,
    slotIndex: number,
    skillKey: string | null,
  ): Promise<{ slots: ActionBarSlotView[] }> {
    if (!isValidActionBarSlotIndex(slotIndex)) {
      throw new BadRequestException(
        `slotIndex invalide : 0..${ACTION_BAR_SLOT_COUNT - 1} attendu.`,
      );
    }

    // ── Vidage ────────────────────────────────────────────────────────────────
    if (skillKey == null) {
      await this.slotRepo.delete({ characterId, slotIndex });
      return this.getActionBar(characterId);
    }

    // ── Équipement : résolution + validations serveur ──────────────────────────
    const skill = await this.activeSkills.getDefinition(skillKey); // NotFound si inconnue
    const ctx = await this.loadContext(characterId);
    const reason = this.activeSkills.evaluateSkillAvailability(
      skill,
      ctx.characterLevel,
      ctx.masteryLevels,
      ctx.unlockedIds.has(skill.id),
    );
    if (reason !== null) {
      throw new BadRequestException(`Skill "${skillKey}" non équipable (${reason}).`);
    }

    await this.upsertSlot(characterId, slotIndex, skill.id);
    return this.getActionBar(characterId);
  }

  /** Upsert d'un slot (remplace le skill éventuel). Gère le conflit unique concurrent. */
  private async upsertSlot(
    characterId: string,
    slotIndex: number,
    skillDefinitionId: string,
  ): Promise<void> {
    const existing = await this.slotRepo.findOne({ where: { characterId, slotIndex } });
    if (existing) {
      existing.skillDefinitionId = skillDefinitionId;
      await this.slotRepo.save(existing);
      return;
    }
    try {
      await this.slotRepo.save(
        this.slotRepo.create({ characterId, slotIndex, skillDefinitionId }),
      );
    } catch (error: unknown) {
      // Conflit UNIQUE(characterId, slotIndex) — écriture concurrente : on met à jour.
      if ((error as { code?: string }).code === '23505') {
        const reload = await this.slotRepo.findOne({ where: { characterId, slotIndex } });
        if (reload) {
          reload.skillDefinitionId = skillDefinitionId;
          await this.slotRepo.save(reload);
          return;
        }
      }
      throw error;
    }
  }
}
