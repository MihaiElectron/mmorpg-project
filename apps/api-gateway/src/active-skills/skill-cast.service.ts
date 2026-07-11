import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActiveSkillsService } from './active-skills.service';
import { SkillDefinition } from './entities/skill-definition.entity';
import { calculateSkillEffect } from './calculators/skill-effect.calculator';
import { Character } from '../characters/entities/character.entity';
import { CharacterStatsCalculator } from '../characters/character-stats-calculator';
import { aggregateEquipmentBonuses } from '../characters/equipment-stats.helper';
import { DerivedStatsService } from '../derived-stats/derived-stats.service';
import { MasteriesService } from '../masteries/masteries.service';
import { MasteryEffectsService } from '../masteries/mastery-effects.service';
import { resolveEquippedWeaponType } from '../characters/equipped-weapon.helper';
import { CreaturesService } from '../creatures/creatures.service';
import { isAttackFailure } from '../creatures/creatures.service';
import type { CreatureDto } from '../creatures/dto/creature.dto';
import type { CharacterXpResult } from '../progression/progression.service';
import type { LootEntry } from '../world/loot.service';

/**
 * Instantané des ressources du lanceur après un cast (Skills V1-J-B). Présent
 * uniquement si une ressource/santé a changé → base de `character_resource_update`.
 * Les `max*` sont des dérivées serveur (pas de colonne DB pour mana/energy).
 */
export interface ResourceSnapshot {
  health: number;
  mana: number;
  energy: number;
  maxHealth: number;
  maxMana: number;
  maxEnergy: number;
}

export interface SkillCastSuccess {
  success: true;
  skillKey: string;
  /** Nom lisible du skill — attribution dans le combat log (event `combat:event`). */
  skillName: string;
  dto: CreatureDto;
  damage: number;
  attackerId: string;
  cooldownMs: number;
  loot?: LootEntry[];
  characterXpUpdate?: CharacterXpResult;
  /** Coût de vie appliqué au lanceur (si resourceType=health) — event `character_damaged`. */
  healthCost?: { amount: number; health: number };
  /** Ressources finales si un coût a été consommé — event `character_resource_update`. */
  resources?: ResourceSnapshot;
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
  /** Ressources finales (santé toujours changée par le soin) — `character_resource_update`. */
  resources?: ResourceSnapshot;
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
    private readonly masteryEffects: MasteryEffectsService,
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

  /**
   * Vérifie la SUFFISANCE de la ressource (Skills V1-J-B) — vérification seule,
   * aucun décrément (la ressource n'est consommée qu'après succès réel). Santé :
   * règle non létale conservée (health > cost → reste ≥ 1). Retourne un message
   * d'erreur clair, ou `null` si le coût est payable (ou nul).
   */
  private checkResourceCost(character: Character, skill: SkillDefinition): string | null {
    if (skill.resourceType == null || skill.resourceCost <= 0) return null;
    const cost = skill.resourceCost;
    switch (skill.resourceType) {
      case 'mana':
        return character.mana >= cost ? null : 'Mana insuffisant.';
      case 'energy':
        return character.energy >= cost ? null : 'Énergie insuffisante.';
      case 'health':
        return character.health > cost ? null : 'Santé insuffisante.';
      default:
        return null;
    }
  }

  /**
   * Bonus de maîtrise d'arme sur le montant d'un skill weapon-based
   * (V1-D-Skills-B). Règle stricte, opt-in :
   * - `skill.weaponType` null → montant inchangé (sort/soin/utilitaire) ;
   * - pas d'arme équipée ou weaponType différent → montant inchangé ;
   * - sinon `round(amount × (1 + damagePercent / 100))` — le damagePercent
   *   vient du calculateur pur (formule level × perLevel — les maîtrises
   *   démarrent à 0 ; mastery disabled/level 0/effects mismatch → 0, clamp 50 %), jamais
   *   recalculé ici. Définitions servies par le cache, niveaux déjà chargés
   *   par le cast : aucune lecture DB supplémentaire.
   */
  private async applyWeaponMasteryBonus(
    skill: SkillDefinition,
    character: Character,
    masteryLevels: Record<string, number>,
    amount: number,
  ): Promise<number> {
    if (!skill.weaponType) return amount;
    const equippedWeaponType = resolveEquippedWeaponType(character.equipment);
    if (!equippedWeaponType || equippedWeaponType !== skill.weaponType) return amount;

    const definitions = await this.masteries.getEnabledMasteryDefinitions();
    const { damagePercent, damageFlat } = await this.masteryEffects.computeCombatEffects(
      definitions,
      masteryLevels,
      { weaponType: equippedWeaponType },
    );
    if (damagePercent <= 0 && damageFlat <= 0) return amount;
    return Math.round(amount * (1 + damagePercent / 100) + damageFlat);
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
    const character = await this.characterRepository.findOne({
      where: { id: characterId },
      relations: ['equipment', 'equipment.item'],
    });
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

    const masteryCheck = MasteriesService.evaluateRequiredMasteries(
      masteryLevels,
      skill.requiredMasteries,
    );
    if (!masteryCheck.ok) {
      const first = masteryCheck.missing[0];
      return { success: false, error: `Mastery "${first.key}" niveau ${first.required} requise.` };
    }

    // ── Coût (vérification SEULE — décrément après succès réel) ────────────
    const costError = this.checkResourceCost(character, skill);
    if (costError) return { success: false, error: costError };

    // ── Cooldown serveur ───────────────────────────────────────────────────
    const now = Date.now();
    const cdKey = this.cooldownKey(characterId, skill.key);
    const last = this.lastCastAt.get(cdKey) ?? 0;
    if (now - last < skill.cooldownMs) {
      const remaining = skill.cooldownMs - (now - last);
      return { success: false, error: `Skill en recharge (${remaining} ms).` };
    }

    // ── Calcul serveur du montant (stats déjà calculées) ───────────────────
    // Mastery Effects V2 : modificateurs permanents appliqués aux dérivées
    // (définitions du cache + niveaux déjà chargés — aucune lecture en plus).
    const derivedDefinitions = await this.derivedStats.getDefinitions();
    const masteryDefinitions = await this.masteries.getEnabledMasteryDefinitions();
    const stats = CharacterStatsCalculator.compute(
      character,
      derivedDefinitions,
      aggregateEquipmentBonuses(character.equipment),
      await this.masteryEffects.aggregatePermanentModifiers(masteryDefinitions, masteryLevels),
    );
    const effect = calculateSkillEffect(skill, {
      primary: stats.final as unknown as Record<string, number>,
      derived: stats.derived as unknown as Record<string, number>,
      masteryLevels,
    });

    // ── Bonus de maîtrise d'arme (V1-D-Skills-B) ────────────────────────────
    // Appliqué au MONTANT du skill (pas aux stats d'entrée) : un skill scale
    // sur strength/physicalAttack/mastery indifféremment, le bonus d'arme doit
    // porter sur son résultat offensif. Skill sans weaponType (sort, soin) ou
    // arme non correspondante → montant inchangé.
    const boostedAmount = await this.applyWeaponMasteryBonus(
      skill,
      character,
      masteryLevels,
      effect.amount,
    );

    // ── Application côté créature (portée/mort/loot/XP réutilisés) ──────────
    const result = await this.creatures.applySkillDamage(
      targetId,
      characterId,
      attackerPosition,
      boostedAmount,
      skill.rangeWU,
      // V4-A : pénétration de défense du lanceur (dérivée serveur, inclut les
      // modificateurs de maîtrise permanents déjà agrégés ci-dessus).
      stats.derived.defensePenetration ?? 0,
    );
    if (isAttackFailure(result)) {
      return { success: false, error: result.error };
    }

    // ── Effets serveur post-succès : décrément ressource + armement cooldown ─
    const cost = skill.resourceCost;
    const hasCost = skill.resourceType != null && cost > 0;
    let healthCost: { amount: number; health: number } | undefined;
    let resources: ResourceSnapshot | undefined;
    let finalHealth = character.health;
    let finalMana = character.mana;
    let finalEnergy = character.energy;

    if (hasCost) {
      const update: Partial<Character> = {};
      if (skill.resourceType === 'health') {
        finalHealth = Math.max(1, character.health - cost);
        update.health = finalHealth;
        healthCost = { amount: character.health - finalHealth, health: finalHealth };
      } else if (skill.resourceType === 'mana') {
        finalMana = Math.max(0, character.mana - cost);
        update.mana = finalMana;
      } else if (skill.resourceType === 'energy') {
        finalEnergy = Math.max(0, character.energy - cost);
        update.energy = finalEnergy;
      }
      await this.characterRepository.update(characterId, update);
      resources = {
        health: finalHealth,
        mana: finalMana,
        energy: finalEnergy,
        maxHealth: Math.round(stats.derived.maxHealth),
        maxMana: Math.round(stats.derived.maxMana),
        maxEnergy: Math.round(stats.derived.maxEnergy),
      };
    }

    this.lastCastAt.set(cdKey, now);

    return {
      success: true,
      skillKey: skill.key,
      skillName: skill.name,
      dto: result.dto,
      damage: result.damage,
      attackerId: result.attackerId,
      cooldownMs: skill.cooldownMs,
      loot: result.loot,
      characterXpUpdate: result.characterXpUpdate,
      healthCost,
      resources,
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
    const character = await this.characterRepository.findOne({
      where: { id: characterId },
      relations: ['equipment', 'equipment.item'],
    });
    if (!character) return { success: false, error: 'Personnage introuvable.' };
    if (character.health <= 0) return { success: false, error: 'Personnage mort.' };

    if ((character.level ?? 1) < skill.requiredLevel) {
      return { success: false, error: `Niveau ${skill.requiredLevel} requis.` };
    }

    const masteryRows = await this.masteries.getCharacterMasteries(characterId);
    const masteryLevels: Record<string, number> = {};
    for (const m of masteryRows) masteryLevels[m.key] = m.level;

    const masteryCheck = MasteriesService.evaluateRequiredMasteries(
      masteryLevels,
      skill.requiredMasteries,
    );
    if (!masteryCheck.ok) {
      const first = masteryCheck.missing[0];
      return { success: false, error: `Mastery "${first.key}" niveau ${first.required} requise.` };
    }

    // ── Coût (vérification SEULE — décrément après succès réel) ────────────
    const costError = this.checkResourceCost(character, skill);
    if (costError) return { success: false, error: costError };

    // ── Cooldown serveur ───────────────────────────────────────────────────
    const now = Date.now();
    const cdKey = this.cooldownKey(characterId, skill.key);
    const last = this.lastCastAt.get(cdKey) ?? 0;
    if (now - last < skill.cooldownMs) {
      const remaining = skill.cooldownMs - (now - last);
      return { success: false, error: `Skill en recharge (${remaining} ms).` };
    }

    // ── Calcul serveur du soin + clamp maxHealth dérivé ────────────────────
    // Mastery Effects V2 : healingPower/maxHealth incluent les modificateurs
    // permanents de maîtrise (jamais les bonus contextuels d'arme).
    const derivedDefinitions = await this.derivedStats.getDefinitions();
    const masteryDefinitions = await this.masteries.getEnabledMasteryDefinitions();
    const stats = CharacterStatsCalculator.compute(
      character,
      derivedDefinitions,
      aggregateEquipmentBonuses(character.equipment),
      await this.masteryEffects.aggregatePermanentModifiers(masteryDefinitions, masteryLevels),
    );
    const effect = calculateSkillEffect(skill, {
      primary: stats.final as unknown as Record<string, number>,
      derived: stats.derived as unknown as Record<string, number>,
      masteryLevels,
    });
    const healAmount = effect.amount;

    const cost = skill.resourceCost;
    const hasCost = skill.resourceType != null && cost > 0;
    const maxHealth = Math.max(1, Math.round(stats.derived.maxHealth));
    // Coût de vie appliqué avant le soin (rare : heal + coût health). Non létal.
    const healthAfterCost =
      hasCost && skill.resourceType === 'health' ? character.health - cost : character.health;
    const newHealth = Math.min(maxHealth, healthAfterCost + healAmount);

    // Décrément mana/energy éventuel (le coût health est déjà dans healthAfterCost).
    let finalMana = character.mana;
    let finalEnergy = character.energy;
    const update: Partial<Character> = { health: newHealth };
    if (hasCost && skill.resourceType === 'mana') {
      finalMana = Math.max(0, character.mana - cost);
      update.mana = finalMana;
    } else if (hasCost && skill.resourceType === 'energy') {
      finalEnergy = Math.max(0, character.energy - cost);
      update.energy = finalEnergy;
    }

    await this.characterRepository.update(characterId, update);
    this.lastCastAt.set(cdKey, now);

    // Le soin change toujours la santé → snapshot ressources toujours émis.
    const resources: ResourceSnapshot = {
      health: newHealth,
      mana: finalMana,
      energy: finalEnergy,
      maxHealth,
      maxMana: Math.round(stats.derived.maxMana),
      maxEnergy: Math.round(stats.derived.maxEnergy),
    };

    return {
      success: true,
      skillKey: skill.key,
      heal: newHealth - healthAfterCost,
      health: newHealth,
      cooldownMs: skill.cooldownMs,
      resources,
    };
  }
}
