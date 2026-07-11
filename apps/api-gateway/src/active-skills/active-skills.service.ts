import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SkillDefinition } from './entities/skill-definition.entity';
import { PlayerSkillUnlock } from './entities/player-skill-unlock.entity';
import { CreateSkillDefinitionDto } from './dto/create-skill-definition.dto';
import { UpdateSkillDefinitionDto } from './dto/update-skill-definition.dto';
import {
  ActionBarUnavailableReason,
  isSupportedResourceType,
  SKILL_UNLOCK_SOURCES,
  SkillEffectType,
  SkillKind,
  SkillResourceType,
  SkillTargetMode,
  SkillUnlockSource,
} from './active-skills.constants';
import { MasteriesService } from '../masteries/masteries.service';

/** Vue ADMIN de l'état de déverrouillage d'un skill pour un personnage (V1-H-B). */
export interface AdminSkillUnlockView {
  key: string;
  name: string;
  skillKind: SkillKind;
  enabled: boolean;
  autoUnlock: boolean;
  /** Une ligne player_skill_unlock existe pour ce personnage. */
  explicitlyUnlocked: boolean;
  /** État final : autoUnlock OU explicitlyUnlocked. */
  unlocked: boolean;
  source: SkillUnlockSource | null;
  unlockedAt: Date | null;
}

/** Vue joueur d'un skill actif (route lecture seule `/characters/me/active-skills`). */
export interface PlayerActiveSkill {
  key: string;
  name: string;
  description: string;
  iconAssetPath: string | null;
  cooldownMs: number;
  rangeWU: number;
  targetMode: SkillTargetMode;
  effectType: SkillEffectType;
  resourceType: SkillResourceType | null;
  resourceCost: number;
  executable: boolean;
  disabledReason?: string;
}

/**
 * ActiveSkillsService — source de vérité serveur du catalogue de skills actifs
 * (ADR-0019, V1-A). Seul point d'écriture sur `skill_definition` : aucune
 * mutation directe autorisée ailleurs.
 *
 * Cache en mémoire, même pattern que `DerivedStatsService` : liste complète mise
 * en cache, invalidée à chaque écriture. Aucun seed de gameplay imposé — le
 * catalogue démarre vide (V1-A ne fournit pas de skill jouable par défaut).
 *
 * V1-A = catalogue uniquement. Aucun `skill:cast`, aucun scaling appliqué,
 * aucun combat touché. La validation fine (nombres, structure jsonb) vit ici ;
 * les DTO garantissent seulement les types de surface.
 */
@Injectable()
export class ActiveSkillsService {
  private cache: SkillDefinition[] | null = null;

  constructor(
    @InjectRepository(SkillDefinition)
    private readonly repo: Repository<SkillDefinition>,
    @InjectRepository(PlayerSkillUnlock)
    private readonly unlockRepo: Repository<PlayerSkillUnlock>,
  ) {}

  invalidateCache(): void {
    this.cache = null;
  }

  // ── Déverrouillage par personnage (V1-H) ────────────────────────────────────

  /** Ids des SkillDefinition explicitement déverrouillées pour un personnage. */
  async getUnlockedSkillDefinitionIds(characterId: string): Promise<Set<string>> {
    const rows = await this.unlockRepo.find({
      where: { characterId },
      select: { skillDefinitionId: true },
    });
    return new Set(rows.map((r) => r.skillDefinitionId));
  }

  /** Vrai si une ligne d'unlock existe pour ce personnage + cette définition. */
  async isSkillUnlocked(characterId: string, skillDefinitionId: string): Promise<boolean> {
    const count = await this.unlockRepo.count({ where: { characterId, skillDefinitionId } });
    return count > 0;
  }

  /**
   * Déverrouille un skill (par `key`) pour un personnage. Idempotent : si déjà
   * déverrouillé, ne crée pas de doublon (contrainte unique + code 23505 géré).
   * `autoUnlock` NE crée jamais de ligne (un skill autoUnlock est débloqué sans
   * persistance). `skillKey` n'est jamais stocké — seul `skillDefinitionId`.
   */
  async unlockSkillForCharacter(
    characterId: string,
    skillKey: string,
    source?: SkillUnlockSource | null,
  ): Promise<PlayerSkillUnlock> {
    const skill = await this.getDefinition(skillKey); // NotFound si clé inconnue
    if (source != null && !SKILL_UNLOCK_SOURCES.includes(source)) {
      throw new BadRequestException(`Source de déverrouillage inconnue : "${source}".`);
    }

    const existing = await this.unlockRepo.findOne({
      where: { characterId, skillDefinitionId: skill.id },
    });
    if (existing) return existing;

    try {
      const created = this.unlockRepo.create({
        characterId,
        skillDefinitionId: skill.id,
        source: source ?? null,
      });
      return await this.unlockRepo.save(created);
    } catch (error: unknown) {
      // Création concurrente : conflit UNIQUE(characterId, skillDefinitionId).
      if ((error as { code?: string }).code === '23505') {
        const reload = await this.unlockRepo.findOne({
          where: { characterId, skillDefinitionId: skill.id },
        });
        if (reload) return reload;
      }
      throw error;
    }
  }

  /**
   * Vue ADMIN du déverrouillage des skills pour un personnage (V1-H-B).
   * Renvoie TOUT le catalogue (y compris passive/aura, pour visibilité admin)
   * avec l'état de déverrouillage résolu par personnage.
   */
  async getCharacterSkillUnlocks(characterId: string): Promise<AdminSkillUnlockView[]> {
    const all = await this.listDefinitions();
    const unlocks = await this.unlockRepo.find({ where: { characterId } });
    const byDefId = new Map(unlocks.map((u) => [u.skillDefinitionId, u]));

    return all.map((s) => {
      const row = byDefId.get(s.id);
      const explicitlyUnlocked = row != null;
      return {
        key: s.key,
        name: s.name,
        skillKind: s.skillKind,
        enabled: s.enabled,
        autoUnlock: s.autoUnlock,
        explicitlyUnlocked,
        unlocked: s.autoUnlock || explicitlyUnlocked,
        source: row?.source ?? null,
        unlockedAt: row?.unlockedAt ?? null,
      };
    });
  }

  /** Verrouille (supprime l'unlock) un skill pour un personnage. Idempotent. */
  async lockSkillForCharacter(
    characterId: string,
    skillKey: string,
  ): Promise<{ skillKey: string; locked: boolean }> {
    const skill = await this.getDefinition(skillKey); // NotFound si clé inconnue
    const result = await this.unlockRepo.delete({
      characterId,
      skillDefinitionId: skill.id,
    });
    return { skillKey, locked: (result.affected ?? 0) > 0 };
  }

  /**
   * Skills actifs UTILISABLES par un personnage (route joueur lecture seule,
   * V1-E). Filtrage serveur — le client ne décide rien :
   *   - uniquement les skills `enabled` ;
   *   - `requiredLevel` et `requiredMasteries` non satisfaits → EXCLUS (skill
   *     verrouillé, non renvoyé) ;
   *   - skill renvoyé mais `executable=false` + `disabledReason` si l'exécution
   *     V1 ne le supporte pas (effet non damage, cible non créature, ou coût
   *     mana/energy > 0 car ces ressources courantes ne sont pas implémentées).
   *
   * Ne renvoie aucune donnée sensible (pas de `scaling`, pas d'id interne,
   * pas de `requiredMasteries` détaillées) — seulement ce dont l'UI a besoin.
   *
   * V1-H : uniquement les skills `skillKind === 'active'` ET débloqués
   * (`autoUnlock === true` OU ligne `player_skill_unlock`). Les passifs/auras et
   * les skills verrouillés sont EXCLUS.
   */
  async getUsableSkillsForCharacter(
    characterId: string,
    characterLevel: number,
    masteryLevels: Record<string, number>,
  ): Promise<PlayerActiveSkill[]> {
    const all = await this.listDefinitions();
    const unlockedIds = await this.getUnlockedSkillDefinitionIds(characterId);
    const result: PlayerActiveSkill[] = [];

    for (const s of all) {
      if (!s.enabled) continue;
      // Seuls les skills actifs sont lançables — passive/aura exclus.
      if (s.skillKind !== 'active') continue;
      // Débloqué : autoUnlock global OU unlock explicite du personnage.
      if (!s.autoUnlock && !unlockedIds.has(s.id)) continue;
      if ((characterLevel ?? 1) < s.requiredLevel) continue;

      const masteriesMet = MasteriesService.evaluateRequiredMasteries(
        masteryLevels,
        s.requiredMasteries,
      ).ok;
      if (!masteriesMet) continue;

      // Combinaisons effet/cible exécutables en V1 :
      //  - dégâts sur créature (V1-D)
      //  - soin sur soi (V1-G)
      const isDamageCreature = s.effectType === 'damage' && s.targetMode === 'creature';
      const isHealSelf = s.effectType === 'heal' && s.targetMode === 'self';
      // health/mana/energy sont consommés au cast (V1-J-B) : tous exécutables.
      // Seul un type inconnu bloque. La quantité courante n'est PAS vérifiée ici
      // (le manque est refusé au cast par SkillCastService).
      const resourceUnsupported = !isSupportedResourceType(s.resourceType);

      let executable = true;
      let disabledReason: string | undefined;
      if (!isDamageCreature && !isHealSelf) {
        executable = false;
        disabledReason = 'Combinaison effet/cible non supportée (V1).';
      } else if (resourceUnsupported) {
        executable = false;
        disabledReason = `Type de ressource inconnu (${s.resourceType}).`;
      }

      result.push({
        key: s.key,
        name: s.name,
        description: s.description,
        iconAssetPath: s.iconAssetPath,
        cooldownMs: s.cooldownMs,
        rangeWU: s.rangeWU,
        targetMode: s.targetMode,
        effectType: s.effectType,
        resourceType: s.resourceType,
        resourceCost: s.resourceCost,
        executable,
        ...(disabledReason ? { disabledReason } : {}),
      });
    }

    return result;
  }

  /**
   * Évalue la DISPONIBILITÉ d'un skill pour un personnage (Skills V1-I), avec
   * une raison structurée. Encode exactement les mêmes règles V1 que
   * `getUsableSkillsForCharacter` (source unique réutilisée par ActionBarService).
   * Pur : ne fait aucune I/O (unlock/level/masteries fournis par l'appelant).
   *
   * Retourne `null` si disponible, sinon la raison (`disabled`, `non_active`,
   * `locked`, `level_required`, `mastery_required`, `unsupported_target`,
   * `unsupported_resource`).
   */
  evaluateSkillAvailability(
    skill: SkillDefinition,
    characterLevel: number,
    masteryLevels: Record<string, number>,
    isUnlocked: boolean,
  ): ActionBarUnavailableReason | null {
    if (!skill.enabled) return 'disabled';
    if (skill.skillKind !== 'active') return 'non_active';
    if (!skill.autoUnlock && !isUnlocked) return 'locked';
    if ((characterLevel ?? 1) < skill.requiredLevel) return 'level_required';

    const masteriesMet = MasteriesService.evaluateRequiredMasteries(
      masteryLevels,
      skill.requiredMasteries,
    ).ok;
    if (!masteriesMet) return 'mastery_required';

    const isDamageCreature = skill.effectType === 'damage' && skill.targetMode === 'creature';
    const isHealSelf = skill.effectType === 'heal' && skill.targetMode === 'self';
    if (!isDamageCreature && !isHealSelf) return 'unsupported_target';

    // health/mana/energy consommés au cast (V1-J-B) → disponibles. Seul un type
    // inconnu reste `unsupported_resource`. La suffisance de ressource courante
    // n'est PAS testée ici : le cast répondra "Mana insuffisant." si besoin.
    if (!isSupportedResourceType(skill.resourceType)) return 'unsupported_resource';

    return null;
  }

  /** Toutes les définitions (cache). Copie défensive pour ne pas exposer le cache. */
  async listDefinitions(): Promise<SkillDefinition[]> {
    if (!this.cache) {
      this.cache = await this.repo.find({ order: { key: 'ASC' } });
    }
    return [...this.cache];
  }

  /** Une définition par sa clé. NotFound si absente. */
  async getDefinition(key: string): Promise<SkillDefinition> {
    const all = await this.listDefinitions();
    const found = all.find((s) => s.key === key);
    if (!found) throw new NotFoundException(`Skill "${key}" introuvable.`);
    return found;
  }

  async createDefinition(dto: CreateSkillDefinitionDto): Promise<SkillDefinition> {
    const existing = await this.repo.findOne({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException(`Skill "${dto.key}" existe déjà.`);
    }

    if (dto.requiredMasteries !== undefined) {
      this.validateRequiredMasteries(dto.requiredMasteries);
    }
    if (dto.scaling !== undefined) {
      this.validateScaling(dto.scaling);
    }

    const entity = this.repo.create({
      ...dto,
      ...this.normalizedWeaponTypePatch(dto.weaponType),
    } as Partial<SkillDefinition>);
    const saved = await this.repo.save(entity);
    this.invalidateCache();
    return saved;
  }

  async updateDefinition(
    key: string,
    dto: UpdateSkillDefinitionDto,
  ): Promise<SkillDefinition> {
    const existing = await this.repo.findOne({ where: { key } });
    if (!existing) {
      throw new NotFoundException(`Skill "${key}" introuvable.`);
    }

    if (dto.requiredMasteries !== undefined) {
      this.validateRequiredMasteries(dto.requiredMasteries);
    }
    if (dto.scaling !== undefined) {
      this.validateScaling(dto.scaling);
    }

    const merged = this.repo.merge(existing, {
      ...dto,
      ...this.normalizedWeaponTypePatch(dto.weaponType),
    } as Partial<SkillDefinition>);
    const saved = await this.repo.save(merged);
    this.invalidateCache();
    return saved;
  }

  /**
   * Normalise `weaponType` (V1-D-Skills-A) : `undefined` → patch vide (champ
   * non touché), trim, chaîne vide / null → null (skill non lié à une arme),
   * sinon format [a-z0-9_] obligatoire (même contrat que `item.weaponType`).
   */
  private normalizedWeaponTypePatch(
    raw: string | null | undefined,
  ): { weaponType?: string | null } {
    if (raw === undefined) return {};
    const trimmed = typeof raw === 'string' ? raw.trim() : raw;
    if (trimmed === null || trimmed === '') return { weaponType: null };
    if (!/^[a-z0-9_]+$/.test(trimmed)) {
      throw new BadRequestException(
        'weaponType doit être en minuscules, chiffres ou underscore ([a-z0-9_]).',
      );
    }
    return { weaponType: trimmed };
  }

  /**
   * Désactive un skill sans le supprimer (soft-disable). Voie recommandée pour
   * retirer un skill du jeu tout en préservant la référence `key` (aucun
   * player_skill_unlock en V1-A, mais la stabilité de `key` est protégée).
   */
  async disableDefinition(key: string): Promise<SkillDefinition> {
    return this.updateDefinition(key, { enabled: false });
  }

  /**
   * Suppression physique. Sûre en V1-A (aucune entité ne référence encore
   * `skill_definition`). Préférer `disableDefinition` dès qu'un déverrouillage
   * joueur existera.
   */
  async deleteDefinition(key: string): Promise<{ key: string; deleted: true }> {
    const result = await this.repo.delete({ key });
    if (!result.affected) {
      throw new NotFoundException(`Skill "${key}" introuvable.`);
    }
    this.invalidateCache();
    return { key, deleted: true };
  }

  // ── Validation fine (jsonb) ─────────────────────────────────────────────────

  /** requiredMasteries : { masteryKey: number >= 0 }. */
  private validateRequiredMasteries(value: Record<string, unknown>): void {
    for (const [masteryKey, level] of Object.entries(value)) {
      if (typeof level !== 'number' || !Number.isFinite(level) || level < 0) {
        throw new BadRequestException(
          `requiredMasteries["${masteryKey}"] doit être un nombre >= 0.`,
        );
      }
    }
  }

  /**
   * scaling : objet dont chaque groupe connu (primaryCoefficients,
   * derivedCoefficients, masteryCoefficients) est un objet de nombres finis.
   * Les groupes inconnus sont rejetés pour garder la structure prévisible.
   */
  private validateScaling(value: Record<string, unknown>): void {
    const ALLOWED_GROUPS = new Set([
      'primaryCoefficients',
      'derivedCoefficients',
      'masteryCoefficients',
    ]);
    for (const [group, coefficients] of Object.entries(value)) {
      if (!ALLOWED_GROUPS.has(group)) {
        throw new BadRequestException(
          `scaling: groupe "${group}" inconnu (attendus : ${[...ALLOWED_GROUPS].join(', ')}).`,
        );
      }
      if (
        typeof coefficients !== 'object' ||
        coefficients === null ||
        Array.isArray(coefficients)
      ) {
        throw new BadRequestException(`scaling["${group}"] doit être un objet.`);
      }
      for (const [statKey, coef] of Object.entries(coefficients as Record<string, unknown>)) {
        if (typeof coef !== 'number' || !Number.isFinite(coef)) {
          throw new BadRequestException(
            `scaling["${group}"]["${statKey}"] doit être un nombre.`,
          );
        }
      }
    }
  }
}
