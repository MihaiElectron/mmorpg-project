import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActiveSkillsService } from './active-skills.service';
import { SkillDefinition } from './entities/skill-definition.entity';
import { calculateSkillEffect } from './calculators/skill-effect.calculator';
import { Character } from '../characters/entities/character.entity';
import { CharacterStatsCalculator } from '../characters/character-stats-calculator';
import { DerivedStatsService } from '../derived-stats/derived-stats.service';
import { MasteriesService } from '../masteries/masteries.service';
import { CreaturesService } from '../creatures/creatures.service';
import { isAttackFailure } from '../creatures/creatures.service';
import type { CreatureDto } from '../creatures/dto/creature.dto';
import type { CharacterXpResult } from '../progression/progression.service';
import type { LootEntry } from '../world/loot.service';

export interface SkillCastSuccess {
  success: true;
  skillKey: string;
  dto: CreatureDto;
  damage: number;
  attackerId: string;
  cooldownMs: number;
  loot?: LootEntry[];
  characterXpUpdate?: CharacterXpResult;
  /** Coût de vie appliqué au lanceur (si resourceType=health). */
  healthCost?: { amount: number; health: number };
}
export interface SkillCastFailure {
  success: false;
  error: string;
}
export type SkillCastResult = SkillCastSuccess | SkillCastFailure;

/** Résultat d'un skill de soin sur soi (V1-G). */
export interface SelfSkillCastSuccess {
  success: true;
  skillKey: string;
  /** PV réellement restaurés (après clamp maxHealth et coût éventuel). */
  heal: number;
  /** PV finaux du lanceur (autorité serveur). */
  health: number;
  cooldownMs: number;
}
export type SelfSkillCastResult = SelfSkillCastSuccess | SkillCastFailure;

export function isSkillCastFailure(
  r: SkillCastResult | SelfSkillCastResult,
): r is SkillCastFailure {
  return r.success === false;
}

/**
 * SkillCastService — orchestration serveur du cast d'un skill actif (V1-D).
 *
 * Toute la logique métier du skill vit ici ; la gateway ne calcule rien. Le
 * côté créature (application des dégâts, mort, loot, XP) est délégué à
 * `CreaturesService.applySkillDamage` pour ne pas dupliquer la logique de mort.
 *
 * Sécurité : aucune donnée de gameplay du client. `attackerPosition` et
 * `characterId` proviennent de l'état socket serveur (`client.data.player`),
 * jamais du payload. Dégâts, portée, cooldown, coût, stats : 100 % serveur.
 *
 * Cooldown : Map mémoire `characterId:skillKey -> lastCastAt` (ms). Jamais
 * persisté, jamais de setTimeout — le reste se calcule à partir de `Date.now()`.
 */
@Injectable()
export class SkillCastService {
  private readonly lastCastAt = new Map<string, number>();

  constructor(
    private readonly activeSkills: ActiveSkillsService,
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
    private readonly derivedStats: DerivedStatsService,
    private readonly masteries: MasteriesService,
    private readonly creatures: CreaturesService,
  ) {}

  private cooldownKey(characterId: string, skillKey: string): string {
    return `${characterId}:${skillKey}`;
  }

  private async findSkill(skillKey: string): Promise<SkillDefinition | null> {
    // Lecture non-throwing (le service getDefinition lève NotFound — inadapté au WS).
    const all = await this.activeSkills.listDefinitions();
    return all.find((s) => s.key === skillKey) ?? null;
  }

  /**
   * Garde-fou V1-H commun aux deux chemins de cast (jamais de confiance au
   * client). Refuse tout skill non `active` (passive/aura non castables) et tout
   * skill verrouillé (`!autoUnlock` sans ligne `player_skill_unlock`). Retourne
   * un message d'erreur, ou `null` si le cast est autorisé.
   */
  private async checkKindAndUnlock(
    characterId: string,
    skill: SkillDefinition,
  ): Promise<string | null> {
    if (skill.skillKind !== 'active') {
      return 'Ce skill ne peut pas être lancé (non actif).';
    }
    if (!skill.autoUnlock && !(await this.activeSkills.isSkillUnlocked(characterId, skill.id))) {
      return 'Skill non débloqué.';
    }
    return null;
  }

  async castCreatureSkill(
    characterId: string,
    attackerPosition: { worldX: number; worldY: number; mapId: number },
    skillKey: string,
    targetId: string,
  ): Promise<SkillCastResult> {
    // ── Contrôles skill (config) ───────────────────────────────────────────
    const skill = await this.findSkill(skillKey);
    if (!skill) return { success: false, error: 'Skill introuvable.' };
    if (!skill.enabled) return { success: false, error: 'Skill désactivé.' };
    const gate = await this.checkKindAndUnlock(characterId, skill);
    if (gate) return { success: false, error: gate };
    if (skill.targetMode !== 'creature') {
      return { success: false, error: 'Ce skill ne cible pas une créature.' };
    }
    if (skill.effectType !== 'damage') {
      return { success: false, error: 'Effet non supporté (V1-D : damage uniquement).' };
    }

    // ── Contrôles personnage ───────────────────────────────────────────────
    const character = await this.characterRepository.findOne({ where: { id: characterId } });
    if (!character) return { success: false, error: 'Personnage introuvable.' };
    if (character.health <= 0) return { success: false, error: 'Personnage mort.' };

    if ((character.level ?? 1) < skill.requiredLevel) {
      return { success: false, error: `Niveau ${skill.requiredLevel} requis.` };
    }

    // Niveaux de masteries (lecture serveur) — réutilisés pour les prérequis
    // ET le scaling.
    const masteryRows = await this.masteries.getCharacterMasteries(characterId);
    const masteryLevels: Record<string, number> = {};
    for (const m of masteryRows) masteryLevels[m.key] = m.level;

    for (const [key, minLevel] of Object.entries(skill.requiredMasteries ?? {})) {
      if ((masteryLevels[key] ?? 0) < minLevel) {
        return { success: false, error: `Mastery "${key}" niveau ${minLevel} requise.` };
      }
    }

    // ── Coût ───────────────────────────────────────────────────────────────
    const hasCost = skill.resourceType != null && skill.resourceCost > 0;
    if (hasCost) {
      if (skill.resourceType === 'mana' || skill.resourceType === 'energy') {
        return {
          success: false,
          error: `Coût ${skill.resourceType} non supporté en V1 (ressource non implémentée).`,
        };
      }
      if (skill.resourceType === 'health' && character.health <= skill.resourceCost) {
        // Ne doit jamais tuer le lanceur : il faut qu'il reste au moins 1 PV.
        return { success: false, error: 'Vie insuffisante pour lancer ce skill.' };
      }
    }

    // ── Cooldown serveur ───────────────────────────────────────────────────
    const now = Date.now();
    const cdKey = this.cooldownKey(characterId, skill.key);
    const last = this.lastCastAt.get(cdKey) ?? 0;
    if (now - last < skill.cooldownMs) {
      const remaining = skill.cooldownMs - (now - last);
      return { success: false, error: `Skill en recharge (${remaining} ms).` };
    }

    // ── Calcul serveur du montant (stats déjà calculées) ───────────────────
    const derivedDefinitions = await this.derivedStats.getDefinitions();
    const stats = CharacterStatsCalculator.compute(character, derivedDefinitions);
    const effect = calculateSkillEffect(skill, {
      primary: stats.final as unknown as Record<string, number>,
      derived: stats.derived as unknown as Record<string, number>,
      masteryLevels,
    });

    // ── Application côté créature (portée/mort/loot/XP réutilisés) ──────────
    const result = await this.creatures.applySkillDamage(
      targetId,
      characterId,
      attackerPosition,
      effect.amount,
      skill.rangeWU,
    );
    if (isAttackFailure(result)) {
      return { success: false, error: result.error };
    }

    // ── Effets serveur post-succès : coût de vie + armement du cooldown ─────
    let healthCost: { amount: number; health: number } | undefined;
    if (hasCost && skill.resourceType === 'health') {
      const newHealth = Math.max(1, character.health - skill.resourceCost);
      await this.characterRepository.update(characterId, { health: newHealth });
      healthCost = { amount: character.health - newHealth, health: newHealth };
    }

    this.lastCastAt.set(cdKey, now);

    return {
      success: true,
      skillKey: skill.key,
      dto: result.dto,
      damage: result.damage,
      attackerId: result.attackerId,
      cooldownMs: skill.cooldownMs,
      loot: result.loot,
      characterXpUpdate: result.characterXpUpdate,
      healthCost,
    };
  }

  /**
   * Cast d'un skill de SOIN sur soi-même (V1-G). Aucune cible, aucune portée.
   * Mêmes garanties de sécurité que le chemin créature : tout est validé et
   * calculé serveur, le client n'envoie qu'une intention.
   */
  async castSelfSkill(
    characterId: string,
    skillKey: string,
  ): Promise<SelfSkillCastResult> {
    // ── Contrôles skill (config) ───────────────────────────────────────────
    const skill = await this.findSkill(skillKey);
    if (!skill) return { success: false, error: 'Skill introuvable.' };
    if (!skill.enabled) return { success: false, error: 'Skill désactivé.' };
    const gate = await this.checkKindAndUnlock(characterId, skill);
    if (gate) return { success: false, error: gate };
    if (skill.targetMode !== 'self') {
      return { success: false, error: 'Ce skill ne se lance pas sur soi.' };
    }
    if (skill.effectType !== 'heal') {
      return { success: false, error: 'Effet non supporté (self V1-G : heal uniquement).' };
    }

    // ── Contrôles personnage ───────────────────────────────────────────────
    const character = await this.characterRepository.findOne({ where: { id: characterId } });
    if (!character) return { success: false, error: 'Personnage introuvable.' };
    if (character.health <= 0) return { success: false, error: 'Personnage mort.' };

    if ((character.level ?? 1) < skill.requiredLevel) {
      return { success: false, error: `Niveau ${skill.requiredLevel} requis.` };
    }

    const masteryRows = await this.masteries.getCharacterMasteries(characterId);
    const masteryLevels: Record<string, number> = {};
    for (const m of masteryRows) masteryLevels[m.key] = m.level;

    for (const [key, minLevel] of Object.entries(skill.requiredMasteries ?? {})) {
      if ((masteryLevels[key] ?? 0) < minLevel) {
        return { success: false, error: `Mastery "${key}" niveau ${minLevel} requise.` };
      }
    }

    // ── Coût ───────────────────────────────────────────────────────────────
    const hasCost = skill.resourceType != null && skill.resourceCost > 0;
    if (hasCost) {
      if (skill.resourceType === 'mana' || skill.resourceType === 'energy') {
        return {
          success: false,
          error: `Coût ${skill.resourceType} non supporté en V1 (ressource non implémentée).`,
        };
      }
      if (skill.resourceType === 'health' && character.health <= skill.resourceCost) {
        return { success: false, error: 'Vie insuffisante pour lancer ce skill.' };
      }
    }

    // ── Cooldown serveur ───────────────────────────────────────────────────
    const now = Date.now();
    const cdKey = this.cooldownKey(characterId, skill.key);
    const last = this.lastCastAt.get(cdKey) ?? 0;
    if (now - last < skill.cooldownMs) {
      const remaining = skill.cooldownMs - (now - last);
      return { success: false, error: `Skill en recharge (${remaining} ms).` };
    }

    // ── Calcul serveur du soin + clamp maxHealth dérivé ────────────────────
    const derivedDefinitions = await this.derivedStats.getDefinitions();
    const stats = CharacterStatsCalculator.compute(character, derivedDefinitions);
    const effect = calculateSkillEffect(skill, {
      primary: stats.final as unknown as Record<string, number>,
      derived: stats.derived as unknown as Record<string, number>,
      masteryLevels,
    });
    const healAmount = effect.amount;

    const maxHealth = Math.max(1, Math.round(stats.derived.maxHealth));
    // Coût de vie appliqué avant le soin (rare : heal + coût health). Non létal.
    const healthAfterCost =
      hasCost && skill.resourceType === 'health'
        ? character.health - skill.resourceCost
        : character.health;
    const newHealth = Math.min(maxHealth, healthAfterCost + healAmount);

    await this.characterRepository.update(characterId, { health: newHealth });
    this.lastCastAt.set(cdKey, now);

    return {
      success: true,
      skillKey: skill.key,
      heal: newHealth - healthAfterCost,
      health: newHealth,
      cooldownMs: skill.cooldownMs,
    };
  }
}
