import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { MasteryDefinition } from './entities/mastery-definition.entity';
import { PlayerMastery } from './entities/player-mastery.entity';
import { CreateMasteryDefinitionDto } from './dto/create-mastery-definition.dto';
import { UpdateMasteryDefinitionDto } from './dto/update-mastery-definition.dto';
import {
  MasteryEffects,
  MasteryEffectsValidationError,
  sanitizeMasteryEffects,
} from './mastery-effects.calculator';

export interface MasteryUpdatePayload {
  masteryDefinitionKey: string;
  key: string;
  name: string;
  category: string;
  enabled: boolean;
  level: number;
  xp: number;
  nextLevelXp: number;
  leveledUp: boolean;
}

/** Détail d'une maîtrise requise non satisfaite. */
export interface MissingMasteryRequirement {
  key: string;
  required: number;
  current: number;
}

/** Résultat de la vérification des maîtrises requises (Masteries V1-A). */
export interface MasteryRequirementCheck {
  ok: boolean;
  missing: MissingMasteryRequirement[];
}

const DEFAULT_MASTERIES: Pick<
  MasteryDefinition,
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
export class MasteriesService implements OnModuleInit {
  private readonly logger = new Logger(MasteriesService.name);

  constructor(
    @InjectRepository(MasteryDefinition)
    private readonly masteryDefinitionRepo: Repository<MasteryDefinition>,
    @InjectRepository(PlayerMastery)
    private readonly playerMasteryRepo: Repository<PlayerMastery>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultMasteries();
  }

  // ---------------------------------------------------------------------------
  // Seed non destructif — n'écrase jamais une définition existante
  // ---------------------------------------------------------------------------
  async seedDefaultMasteries(): Promise<void> {
    for (const def of DEFAULT_MASTERIES) {
      const existing = await this.masteryDefinitionRepo.findOne({
        where: { key: def.key },
      });
      if (existing) continue;
      await this.masteryDefinitionRepo.save(
        this.masteryDefinitionRepo.create(def),
      );
      this.logger.log(`Mastery seeded: ${def.key}`);
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD admin des définitions (Masteries V1-C-A — Studio SDK)
  //
  // La `key` est IMMUABLE après création (référencée en copie string par
  // skills/items/recettes + FK player_mastery). Pas de delete physique :
  // retrait = PATCH { enabled: false } (réversible, progression conservée).
  // Aucune logique XP/level ici — le CRUD ne touche que le catalogue.
  // ---------------------------------------------------------------------------

  /** Une définition par sa key. NotFoundException si absente. */
  async getMasteryDefinitionByKey(key: string): Promise<MasteryDefinition> {
    const found = await this.masteryDefinitionRepo.findOne({ where: { key } });
    if (!found) throw new NotFoundException(`Mastery "${key}" introuvable.`);
    return found;
  }

  /** Crée une définition. ConflictException si la key existe déjà. */
  async createMasteryDefinition(
    dto: CreateMasteryDefinitionDto,
  ): Promise<MasteryDefinition> {
    const existing = await this.masteryDefinitionRepo.findOne({
      where: { key: dto.key },
    });
    if (existing) {
      throw new ConflictException(`Mastery "${dto.key}" existe déjà.`);
    }
    const entity = this.masteryDefinitionRepo.create({
      ...dto,
      ...this.sanitizedEffectsPatch(dto.effects),
    });
    return this.masteryDefinitionRepo.save(entity);
  }

  /**
   * Patch partiel (name/category/maxLevel/baseXpPerLevel/xpCurveExponent/enabled).
   * La key n'est jamais modifiable (absente du DTO — forbidNonWhitelisted la
   * rejette en 400). `enabled: false` = désactivation soft : player_mastery est
   * conservé, la réactivation retrouve la progression.
   */
  async updateMasteryDefinition(
    key: string,
    dto: UpdateMasteryDefinitionDto,
  ): Promise<MasteryDefinition> {
    const existing = await this.masteryDefinitionRepo.findOne({ where: { key } });
    if (!existing) throw new NotFoundException(`Mastery "${key}" introuvable.`);
    const merged = this.masteryDefinitionRepo.merge(existing, {
      ...dto,
      ...this.sanitizedEffectsPatch(dto.effects),
    });
    return this.masteryDefinitionRepo.save(merged);
  }

  /**
   * Sanitize `effects` avant persistance (V1-D-A). `undefined` → patch vide
   * (le champ n'est pas touché : défaut entity `{}` en création, valeur
   * existante conservée en update). Structure non supportée → 400.
   */
  private sanitizedEffectsPatch(
    rawEffects: Record<string, unknown> | undefined,
  ): { effects?: MasteryEffects } {
    if (rawEffects === undefined) return {};
    try {
      return { effects: sanitizeMasteryEffects(rawEffects) };
    } catch (error) {
      if (error instanceof MasteryEffectsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
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
  getNextLevelXp(masteryDefinition: MasteryDefinition, level: number): number {
    if (level >= masteryDefinition.maxLevel) return Infinity;
    return Math.round(
      masteryDefinition.baseXpPerLevel *
        Math.pow(Math.max(1, level), masteryDefinition.xpCurveExponent),
    );
  }

  /**
   * Recalcule le level depuis un state (level, xp) après ajout d'XP.
   * Avance de level en level jusqu'à épuisement de l'XP ou atteinte du maxLevel.
   * Le carry-over est conservé dans xp retourné.
   */
  recomputeLevel(
    masteryDefinition: MasteryDefinition,
    currentLevel: number,
    xp: number,
  ): { level: number; xp: number } {
    let level = currentLevel;
    let remainingXp = xp;

    while (level < masteryDefinition.maxLevel) {
      const needed = this.getNextLevelXp(masteryDefinition, level);
      if (remainingXp < needed) break;
      remainingXp -= needed;
      level++;
    }

    return { level, xp: remainingXp };
  }

  // ---------------------------------------------------------------------------
  // PlayerMastery
  // ---------------------------------------------------------------------------

  /**
   * Retourne le PlayerMastery existant ou le crée avec level=1, xp=0.
   * Lance NotFoundException si la MasteryDefinition est introuvable.
   */
  async getOrCreatePlayerMastery(
    characterId: string,
    masteryKey: string,
  ): Promise<PlayerMastery> {
    const masteryDef = await this.masteryDefinitionRepo.findOne({
      where: { key: masteryKey },
    });
    if (!masteryDef) throw new NotFoundException(`Mastery "${masteryKey}" introuvable`);
    return this.getOrCreatePlayerMasteryWithDef(characterId, masteryDef);
  }

  /**
   * Ajoute xpAmount au PlayerMastery (créé si absent), recalcule le level.
   * - xpAmount < 0 → BadRequestException
   * - mastery disabled → BadRequestException
   * - level plafonné à masteryDefinition.maxLevel
   */
  async addXp(
    characterId: string,
    masteryKey: string,
    xpAmount: number,
  ): Promise<PlayerMastery> {
    if (xpAmount < 0) {
      throw new BadRequestException('xpAmount must be >= 0');
    }

    const masteryDef = await this.masteryDefinitionRepo.findOne({
      where: { key: masteryKey },
    });
    if (!masteryDef) throw new NotFoundException(`Mastery "${masteryKey}" introuvable`);
    if (!masteryDef.enabled) {
      throw new BadRequestException(`Mastery "${masteryKey}" is disabled`);
    }

    const playerMastery = await this.getOrCreatePlayerMasteryWithDef(
      characterId,
      masteryDef,
    );

    if (xpAmount === 0) return playerMastery;

    const { level, xp } = this.recomputeLevel(
      masteryDef,
      playerMastery.level,
      playerMastery.xp + xpAmount,
    );

    playerMastery.level = level;
    playerMastery.xp = xp;

    return this.playerMasteryRepo.save(playerMastery);
  }

  // ---------------------------------------------------------------------------
  // Helpers transactionnels — à utiliser dans un dataSource.transaction()
  // ---------------------------------------------------------------------------

  /**
   * Get ou crée un PlayerMastery dans une transaction TypeORM existante.
   * Utilise l'EntityManager fourni pour rester dans la même transaction.
   */
  async getOrCreatePlayerMasteryInTx(
    characterId: string,
    masteryDef: MasteryDefinition,
    manager: EntityManager,
  ): Promise<PlayerMastery> {
    const existing = await manager.findOne(PlayerMastery, {
      where: { characterId, masteryDefinitionId: masteryDef.id },
      relations: ['masteryDefinition'],
    });
    if (existing) return existing;

    try {
      const created = manager.create(PlayerMastery, {
        characterId,
        masteryDefinitionId: masteryDef.id,
        level: 1,
        xp: 0,
      });
      const saved = await manager.save(PlayerMastery, created);
      saved.masteryDefinition = masteryDef;
      return saved;
    } catch (error: unknown) {
      // Conflit UNIQUE(characterId, masteryDefinitionId) — création concurrente
      // PostgreSQL unique violation code 23505
      const pgError = error as { code?: string };
      if (pgError.code === '23505') {
        const reload = await manager.findOne(PlayerMastery, {
          where: { characterId, masteryDefinitionId: masteryDef.id },
          relations: ['masteryDefinition'],
        });
        if (reload) return reload;
      }
      throw error;
    }
  }

  /**
   * Point d'entrée unifié pour tous les domaines Runtime.
   * Trouve ou crée le PlayerMastery, applique l'XP, retourne le payload socket.
   * Doit être appelé dans une transaction ouverte par l'appelant.
   */
  async applyMasteryXpInTx(
    characterId: string,
    masteryKey: string,
    xpAmount: number,
    manager: EntityManager,
  ): Promise<MasteryUpdatePayload> {
    const masteryDef = await manager.findOne(MasteryDefinition, { where: { key: masteryKey } });
    if (!masteryDef) throw new NotFoundException(`Mastery "${masteryKey}" introuvable`);
    if (!masteryDef.enabled) throw new BadRequestException(`Mastery "${masteryKey}" désactivé`);

    const playerMastery = await this.getOrCreatePlayerMasteryInTx(characterId, masteryDef, manager);
    const levelBefore = playerMastery.level;
    const updated = await this.applyXpInTx(playerMastery, xpAmount, masteryDef, manager);

    return {
      masteryDefinitionKey: masteryKey,
      key: masteryKey,
      name: masteryDef.name,
      category: masteryDef.category,
      enabled: masteryDef.enabled,
      level: updated.level,
      xp: updated.xp,
      nextLevelXp: this.getNextLevelXp(masteryDef, updated.level),
      leveledUp: updated.level > levelBefore,
    };
  }

  /**
   * Ajoute de l'XP et recalcule le level dans une transaction TypeORM.
   * Retourne le PlayerMastery inchangé si xpAmount === 0 (sans écriture).
   */
  async applyXpInTx(
    playerMastery: PlayerMastery,
    xpAmount: number,
    masteryDef: MasteryDefinition,
    manager: EntityManager,
  ): Promise<PlayerMastery> {
    if (xpAmount === 0) return playerMastery;
    const { level, xp } = this.recomputeLevel(
      masteryDef,
      playerMastery.level,
      playerMastery.xp + xpAmount,
    );
    playerMastery.level = level;
    playerMastery.xp = xp;
    return manager.save(PlayerMastery, playerMastery);
  }

  // ---------------------------------------------------------------------------
  // Lecture — progression joueur
  // ---------------------------------------------------------------------------

  async getCharacterMasteries(characterId: string): Promise<{
    masteryDefinitionId: string;
    key: string;
    name: string;
    category: string;
    level: number;
    xp: number;
    nextLevelXp: number;
    enabled: boolean;
  }[]> {
    // Progression V1 : on part de TOUTES les définitions activées, puis on mappe
    // la progression du personnage si elle existe. Un mastery enabled sans
    // PlayerMastery est renvoyé avec level=1 / xp=0 — SANS créer de ligne DB.
    const [definitions, playerMasteries] = await Promise.all([
      this.masteryDefinitionRepo.find({ where: { enabled: true } }),
      this.playerMasteryRepo.find({ where: { characterId } }),
    ]);

    const progressById = new Map(
      playerMasteries.map((ps) => [ps.masteryDefinitionId, ps]),
    );

    return definitions.map((sd) => {
      const ps = progressById.get(sd.id);
      const level = ps?.level ?? 1;
      const xp = ps?.xp ?? 0;
      return {
        masteryDefinitionId: sd.id,
        key: sd.key,
        name: sd.name,
        category: sd.category,
        level,
        xp,
        nextLevelXp: this.getNextLevelXp(sd, level),
        enabled: sd.enabled,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Vérification des prérequis de maîtrise (Masteries V1-A)
  // ---------------------------------------------------------------------------

  /**
   * Vérification PURE (aucune I/O) des maîtrises requises contre des niveaux
   * déjà chargés. Source unique de la règle de comparaison — réutilisée par les
   * chemins qui possèdent déjà `masteryLevels` (skill cast, disponibilité skill,
   * action bar) via cette méthode statique, et par `hasRequiredMasteries` pour
   * les appelants sans niveaux pré-chargés (équipement).
   *
   * Règles :
   * - `requirements` vide/null/undefined → `{ ok: true, missing: [] }` ;
   * - niveau requis <= 0 ou non numérique → ignoré (considéré satisfait) ;
   * - maîtrise absente de `masteryLevels` → `current = 0` ;
   * - `current < required` → ajouté à `missing`.
   */
  static evaluateRequiredMasteries(
    masteryLevels: Record<string, number> | null | undefined,
    requirements: Record<string, number> | null | undefined,
  ): MasteryRequirementCheck {
    const levels = masteryLevels ?? {};
    const missing: MissingMasteryRequirement[] = [];
    for (const [key, rawMin] of Object.entries(requirements ?? {})) {
      const required = typeof rawMin === 'number' ? rawMin : 0;
      if (!(required > 0)) continue;
      const current = levels[key] ?? 0;
      if (current < required) missing.push({ key, required, current });
    }
    return { ok: missing.length === 0, missing };
  }

  /**
   * Vérifie que le personnage satisfait `requirements`. Charge les niveaux de
   * maîtrise du personnage (lecture seule, sans créer de `PlayerMastery`) puis
   * délègue à `evaluateRequiredMasteries`. Court-circuit sans lecture DB quand
   * aucune exigence positive n'est présente. Serveur autoritaire.
   */
  async hasRequiredMasteries(
    characterId: string,
    requirements: Record<string, number> | null | undefined,
  ): Promise<MasteryRequirementCheck> {
    const hasPositiveRequirement = Object.values(requirements ?? {}).some(
      (min) => typeof min === 'number' && min > 0,
    );
    if (!hasPositiveRequirement) return { ok: true, missing: [] };

    const rows = await this.getCharacterMasteries(characterId);
    const levels: Record<string, number> = {};
    for (const row of rows) levels[row.key] = row.level;
    return MasteriesService.evaluateRequiredMasteries(levels, requirements);
  }

  // ---------------------------------------------------------------------------
  // Interne
  // ---------------------------------------------------------------------------

  private async getOrCreatePlayerMasteryWithDef(
    characterId: string,
    masteryDef: MasteryDefinition,
  ): Promise<PlayerMastery> {
    const existing = await this.playerMasteryRepo.findOne({
      where: { characterId, masteryDefinitionId: masteryDef.id },
      relations: ['masteryDefinition'],
    });
    if (existing) return existing;

    const created = this.playerMasteryRepo.create({
      characterId,
      masteryDefinitionId: masteryDef.id,
      level: 1,
      xp: 0,
    });
    const saved = await this.playerMasteryRepo.save(created);
    saved.masteryDefinition = masteryDef;
    return saved;
  }
}
