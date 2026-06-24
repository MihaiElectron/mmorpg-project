import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SkillDefinition } from './entities/skill-definition.entity';
import { PlayerSkill } from './entities/player-skill.entity';

const DEFAULT_SKILLS: Pick<
  SkillDefinition,
  'key' | 'name' | 'category' | 'maxLevel' | 'baseXpPerLevel' | 'xpCurveExponent' | 'enabled'
>[] = [
  // ── Crafting ────────────────────────────────────────────────────────────────
  { key: 'smithing',     name: 'Smithing',     category: 'crafting',    maxLevel: 100, baseXpPerLevel: 100, xpCurveExponent: 1.5, enabled: true },
  { key: 'woodworking',  name: 'Woodworking',  category: 'crafting',    maxLevel: 100, baseXpPerLevel: 100, xpCurveExponent: 1.5, enabled: true },
  // ── Gathering ───────────────────────────────────────────────────────────────
  { key: 'mining',       name: 'Mining',       category: 'gathering',   maxLevel: 100, baseXpPerLevel: 100, xpCurveExponent: 1.5, enabled: true },
  { key: 'woodcutting',  name: 'Woodcutting',  category: 'gathering',   maxLevel: 100, baseXpPerLevel: 100, xpCurveExponent: 1.5, enabled: true },
  // ── Combat ──────────────────────────────────────────────────────────────────
  { key: 'two_handed',   name: 'Two-Handed',   category: 'combat',      maxLevel: 100, baseXpPerLevel: 100, xpCurveExponent: 1.5, enabled: true },
  { key: 'bow',          name: 'Bow',          category: 'combat',      maxLevel: 100, baseXpPerLevel: 100, xpCurveExponent: 1.5, enabled: true },
  { key: 'crossbow',     name: 'Crossbow',     category: 'combat',      maxLevel: 100, baseXpPerLevel: 100, xpCurveExponent: 1.5, enabled: true },
  // ── Social ──────────────────────────────────────────────────────────────────
  { key: 'diplomacy',    name: 'Diplomacy',    category: 'social',      maxLevel: 100, baseXpPerLevel: 100, xpCurveExponent: 1.5, enabled: true },
  // ── Leadership ──────────────────────────────────────────────────────────────
  { key: 'leadership',   name: 'Leadership',   category: 'leadership',  maxLevel: 100, baseXpPerLevel: 100, xpCurveExponent: 1.5, enabled: true },
];

@Injectable()
export class SkillsService implements OnModuleInit {
  private readonly logger = new Logger(SkillsService.name);

  constructor(
    @InjectRepository(SkillDefinition)
    private readonly skillDefinitionRepo: Repository<SkillDefinition>,
    @InjectRepository(PlayerSkill)
    private readonly playerSkillRepo: Repository<PlayerSkill>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultSkills();
  }

  // ---------------------------------------------------------------------------
  // Seed non destructif — n'écrase jamais une définition existante
  // ---------------------------------------------------------------------------
  async seedDefaultSkills(): Promise<void> {
    for (const def of DEFAULT_SKILLS) {
      const existing = await this.skillDefinitionRepo.findOne({
        where: { key: def.key },
      });
      if (existing) continue;
      await this.skillDefinitionRepo.save(
        this.skillDefinitionRepo.create(def),
      );
      this.logger.log(`Skill seeded: ${def.key}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Formules pures (aucune I/O) — accessibles pour les tests et le CraftingService
  // ---------------------------------------------------------------------------

  /**
   * XP nécessaire pour passer du level courant au level suivant.
   * Formule : baseXpPerLevel × level ^ xpCurveExponent
   * Retourne Infinity si level >= maxLevel (aucun level suivant).
   */
  getNextLevelXp(skillDefinition: SkillDefinition, level: number): number {
    if (level >= skillDefinition.maxLevel) return Infinity;
    return Math.round(
      skillDefinition.baseXpPerLevel *
        Math.pow(Math.max(1, level), skillDefinition.xpCurveExponent),
    );
  }

  /**
   * Recalcule le level depuis un state (level, xp) après ajout d'XP.
   * Avance de level en level jusqu'à épuisement de l'XP ou atteinte du maxLevel.
   * Le carry-over est conservé dans xp retourné.
   */
  recomputeLevel(
    skillDefinition: SkillDefinition,
    currentLevel: number,
    xp: number,
  ): { level: number; xp: number } {
    let level = currentLevel;
    let remainingXp = xp;

    while (level < skillDefinition.maxLevel) {
      const needed = this.getNextLevelXp(skillDefinition, level);
      if (remainingXp < needed) break;
      remainingXp -= needed;
      level++;
    }

    return { level, xp: remainingXp };
  }

  // ---------------------------------------------------------------------------
  // PlayerSkill
  // ---------------------------------------------------------------------------

  /**
   * Retourne le PlayerSkill existant ou le crée avec level=1, xp=0.
   * Lance NotFoundException si la SkillDefinition est introuvable.
   */
  async getOrCreatePlayerSkill(
    characterId: string,
    skillKey: string,
  ): Promise<PlayerSkill> {
    const skillDef = await this.skillDefinitionRepo.findOne({
      where: { key: skillKey },
    });
    if (!skillDef) throw new NotFoundException(`Skill "${skillKey}" introuvable`);
    return this.getOrCreatePlayerSkillWithDef(characterId, skillDef);
  }

  /**
   * Ajoute xpAmount au PlayerSkill (créé si absent), recalcule le level.
   * - xpAmount < 0 → BadRequestException
   * - skill disabled → BadRequestException
   * - level plafonné à skillDefinition.maxLevel
   */
  async addXp(
    characterId: string,
    skillKey: string,
    xpAmount: number,
  ): Promise<PlayerSkill> {
    if (xpAmount < 0) {
      throw new BadRequestException('xpAmount must be >= 0');
    }

    const skillDef = await this.skillDefinitionRepo.findOne({
      where: { key: skillKey },
    });
    if (!skillDef) throw new NotFoundException(`Skill "${skillKey}" introuvable`);
    if (!skillDef.enabled) {
      throw new BadRequestException(`Skill "${skillKey}" is disabled`);
    }

    const playerSkill = await this.getOrCreatePlayerSkillWithDef(
      characterId,
      skillDef,
    );

    if (xpAmount === 0) return playerSkill;

    const { level, xp } = this.recomputeLevel(
      skillDef,
      playerSkill.level,
      playerSkill.xp + xpAmount,
    );

    playerSkill.level = level;
    playerSkill.xp = xp;

    return this.playerSkillRepo.save(playerSkill);
  }

  // ---------------------------------------------------------------------------
  // Helpers transactionnels — à utiliser dans un dataSource.transaction()
  // ---------------------------------------------------------------------------

  /**
   * Get ou crée un PlayerSkill dans une transaction TypeORM existante.
   * Utilise l'EntityManager fourni pour rester dans la même transaction.
   */
  async getOrCreatePlayerSkillInTx(
    characterId: string,
    skillDef: SkillDefinition,
    manager: EntityManager,
  ): Promise<PlayerSkill> {
    const existing = await manager.findOne(PlayerSkill, {
      where: { characterId, skillDefinitionId: skillDef.id },
      relations: ['skillDefinition'],
    });
    if (existing) return existing;

    try {
      const created = manager.create(PlayerSkill, {
        characterId,
        skillDefinitionId: skillDef.id,
        level: 1,
        xp: 0,
      });
      const saved = await manager.save(PlayerSkill, created);
      saved.skillDefinition = skillDef;
      return saved;
    } catch (error: unknown) {
      // Conflit UNIQUE(characterId, skillDefinitionId) — création concurrente
      // PostgreSQL unique violation code 23505
      const pgError = error as { code?: string };
      if (pgError.code === '23505') {
        const reload = await manager.findOne(PlayerSkill, {
          where: { characterId, skillDefinitionId: skillDef.id },
          relations: ['skillDefinition'],
        });
        if (reload) return reload;
      }
      throw error;
    }
  }

  /**
   * Ajoute de l'XP et recalcule le level dans une transaction TypeORM.
   * Retourne le PlayerSkill inchangé si xpAmount === 0 (sans écriture).
   */
  async applyXpInTx(
    playerSkill: PlayerSkill,
    xpAmount: number,
    skillDef: SkillDefinition,
    manager: EntityManager,
  ): Promise<PlayerSkill> {
    if (xpAmount === 0) return playerSkill;
    const { level, xp } = this.recomputeLevel(
      skillDef,
      playerSkill.level,
      playerSkill.xp + xpAmount,
    );
    playerSkill.level = level;
    playerSkill.xp = xp;
    return manager.save(PlayerSkill, playerSkill);
  }

  // ---------------------------------------------------------------------------
  // Interne
  // ---------------------------------------------------------------------------

  private async getOrCreatePlayerSkillWithDef(
    characterId: string,
    skillDef: SkillDefinition,
  ): Promise<PlayerSkill> {
    const existing = await this.playerSkillRepo.findOne({
      where: { characterId, skillDefinitionId: skillDef.id },
      relations: ['skillDefinition'],
    });
    if (existing) return existing;

    const created = this.playerSkillRepo.create({
      characterId,
      skillDefinitionId: skillDef.id,
      level: 1,
      xp: 0,
    });
    const saved = await this.playerSkillRepo.save(created);
    saved.skillDefinition = skillDef;
    return saved;
  }
}
