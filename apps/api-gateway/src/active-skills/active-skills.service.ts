import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SkillDefinition } from './entities/skill-definition.entity';
import { CreateSkillDefinitionDto } from './dto/create-skill-definition.dto';
import { UpdateSkillDefinitionDto } from './dto/update-skill-definition.dto';
import {
  SkillEffectType,
  SkillResourceType,
  SkillTargetMode,
} from './active-skills.constants';

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
  ) {}

  invalidateCache(): void {
    this.cache = null;
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
   */
  async getUsableSkillsForCharacter(
    characterLevel: number,
    masteryLevels: Record<string, number>,
  ): Promise<PlayerActiveSkill[]> {
    const all = await this.listDefinitions();
    const result: PlayerActiveSkill[] = [];

    for (const s of all) {
      if (!s.enabled) continue;
      if ((characterLevel ?? 1) < s.requiredLevel) continue;

      const masteriesMet = Object.entries(s.requiredMasteries ?? {}).every(
        ([key, min]) => (masteryLevels[key] ?? 0) >= min,
      );
      if (!masteriesMet) continue;

      let executable = true;
      let disabledReason: string | undefined;
      if (s.effectType !== 'damage') {
        executable = false;
        disabledReason = 'Effet non supporté (V1 : dégâts uniquement).';
      } else if (s.targetMode !== 'creature') {
        executable = false;
        disabledReason = 'Cible non supportée (V1 : créature uniquement).';
      } else if (
        (s.resourceType === 'mana' || s.resourceType === 'energy') &&
        s.resourceCost > 0
      ) {
        executable = false;
        disabledReason = `Coût ${s.resourceType} indisponible (non implémenté).`;
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

    const entity = this.repo.create(dto as Partial<SkillDefinition>);
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

    const merged = this.repo.merge(existing, dto as Partial<SkillDefinition>);
    const saved = await this.repo.save(merged);
    this.invalidateCache();
    return saved;
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
