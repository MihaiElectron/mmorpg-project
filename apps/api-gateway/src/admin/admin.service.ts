import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as nodePath from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Not, MoreThan, In } from 'typeorm';
import { CraftingRecipe } from '../crafting/entities/crafting-recipe.entity';
import { MIN_CRAFT_TIME_MS, MIN_CRAFT_TIME_MESSAGE } from '../crafting/crafting.constants';
import { CraftingIngredient } from '../crafting/entities/crafting-ingredient.entity';
import { CraftingResult } from '../crafting/entities/crafting-result.entity';
import { CraftingStationTemplate } from '../crafting/entities/crafting-station-template.entity';
import { CraftingStation } from '../crafting/entities/crafting-station.entity';
import { Item } from '../items/entities/item.entity';
import { toCraftingRecipeWorldObject, CraftingRecipeWorldObject } from '../crafting/adapters/crafting-recipe-world-object.adapter';
import {
  toCraftingStationTemplateWorldObject,
  toCraftingStationWorldObject,
  CraftingStationTemplateWorldObject,
  CraftingStationWorldObject,
} from '../crafting/adapters/crafting-station-world-object.adapter';
import { CreatureTemplate } from '../creatures/entities/creature-template.entity';
import { CreatureSpawn } from '../creatures/entities/creature-spawn.entity';
import { Creature } from '../creatures/entities/creature.entity';
import { Character } from '../characters/entities/character.entity';
import { CharacterStatsCalculator, CharacterStats } from '../characters/character-stats-calculator';
import { resolveEffectiveAttackRangeWU } from '../characters/attack-range.helper';
import { DerivedStatsService } from '../derived-stats/derived-stats.service';
import { DerivedStatDefinition } from '../derived-stats/entities/derived-stat-definition.entity';
import { InventoryProjectionService } from '../inventory/projection/inventory-projection.service';
import { InventoryEntryDto } from '../inventory/projection/inventory-entry.dto';
import { MasteriesService } from '../masteries/masteries.service';
import { EconomyService } from '../economy/economy.service';
import { Resource } from '../resources/entities/resource.entity';
import { ResourceTemplate } from '../resources/entities/resource-template.entity';
import { MasteryDefinition } from '../masteries/entities/mastery-definition.entity';
import { PlayerMastery } from '../masteries/entities/player-mastery.entity';
import { toMasteryDefinitionWorldObject, MasteryDefinitionWorldObject } from '../masteries/adapters/mastery-definition-world-object.adapter';
import { type MovementMetrics, WorldService } from '../world/world.service';
import { GameConfigService } from '../game-config/game-config.service';
import { GameConfig } from '../game-config/game-config.entity';
import { UpdateGameConfigDto } from '../game-config/dto/update-game-config.dto';
import { RecalculateCharacterProgressionDto } from '../game-config/dto/recalculate-character-progression.dto';
import {
  xpToReachLevel,
  cumulativeXpToLevel,
  totalStatPointsForLevel,
  levelFromCumulativeXp,
  experienceIntoCurrentLevel,
  resolveCumulativeExperience,
} from '../progression/progression.formula';
import { DEFAULT_MAP_ID } from '../common/world-coordinates';
import { toResourceWorldObject, ResourceWorldObject } from '../resources/adapters/resource-world-object.adapter';
import { toCreatureWorldObject, CreatureWorldObject } from '../creatures/adapters/creature-world-object.adapter';
import { toCreatureSpawnWorldObject, CreatureSpawnWorldObject } from '../creatures/adapters/creature-spawn-world-object.adapter';

export interface AssetNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  mime?: string;
  children?: AssetNode[];
}

export interface AdminEquipmentEntry {
  slot: string;
  itemInstanceId: string | null;
  itemId: string | null;
  name: string | null;
  image: string | null;
  type: string | null;
  /** Slot d'équipement natif de l'item (compatibilité), null si absent. */
  equipSlot: string | null;
  objectMode: string | null;
}

/** Un échantillon de progression calculé serveur pour l'aperçu Studio (niveaux fixes). */
export interface GameConfigSample {
  level: number;
  totalStatPoints: number;
  /** XP requise pour la marche (level - 1) → level. 0 pour le niveau 1. */
  xpToReachLevel: number;
  /** XP cumulée depuis le niveau 1 jusqu'à ce niveau inclus. */
  cumulativeXp: number;
}

/**
 * Simulation XP pour un niveau cible demandé explicitement par le Studio
 * (zone "Simulation XP" du panneau Character Progression).
 */
export interface GameConfigSimulation {
  previousLevel: number;
  targetLevel: number;
  xpForTransition: number;
  cumulativeXpToTarget: number;
}

/** Résultat d'aperçu des règles globales (aucune écriture, aucun recalcul). */
export interface GameConfigPreview {
  current: GameConfig;
  draft: GameConfig;
  affectedCharacterCount: number;
  samples: GameConfigSample[];
  simulation: GameConfigSimulation;
  resetExecuted: false;
  note: string;
}

/**
 * Colonnes Character portant les 10 stats primaires distribuées par le joueur
 * (Progression V1). Seule liste utilisée pour le reset destructif — ne pas
 * dupliquer ailleurs ; réutiliser cette constante pour toute évolution future.
 *
 * `baseCritical` N'EN FAIT PLUS PARTIE (Critique est devenue une dérivée) —
 * elle est traitée séparément dans `recalculateCharacterProgression` comme
 * un remboursement legacy vers `unspentStatPoints`.
 */
const ADMIN_STAT_POINT_FIELDS = [
  'baseStrength',
  'baseVitality',
  'baseEndurance',
  'baseAgility',
  'baseDexterity',
  'baseIntelligence',
  'baseWisdom',
  'baseSpirit',
  'baseWillpower',
  'baseCharisma',
] as const satisfies readonly (keyof Character)[];

/** Une erreur ligne par ligne rencontrée pendant le recalcul (best-effort). */
export interface CharacterProgressionRecalculationError {
  characterId: string;
  message: string;
}

/**
 * Rapport du recalcul global de progression des personnages (ADR-0018 §1).
 * Action destructive : pour chaque personnage, `level`/`experience` sont
 * recalculés depuis `cumulativeExperience` + la courbe XP actuelle, les
 * stats primaires distribuées sont remises à 0 et `unspentStatPoints` est
 * recalculé depuis le nouveau niveau.
 */
export interface CharacterProgressionRecalculationReport {
  processedCharacterCount: number;
  totalCharacterCount: number;
  /** Nombre de personnages dont le niveau a réellement changé. */
  levelsChangedCount: number;
  /** Somme de l'XP cumulée (existante ou backfillée) utilisée pour le recalcul. */
  totalCumulativeExperienceUsed: number;
  /** Somme, avant recalcul, des points dépensés + non dépensés de tous les personnages. */
  oldDistributedTotal: number;
  /** Somme, après recalcul, des points disponibles (unspentStatPoints) de tous les personnages. */
  newAvailableTotal: number;
  /** Nombre de personnages connectés notifiés en temps réel (`character:reload`). */
  notifiedConnectedCharacterCount: number;
  errors: CharacterProgressionRecalculationError[];
  executedAt: string;
}

export interface AdminCharacterDetails {
  character: {
    id: string;
    name: string;
    sex: string;
    level: number;
    experience: number;
    health: number;
    maxHealth: number;
    unspentStatPoints: number;
    connected: boolean;
    worldX: number | null;
    worldY: number | null;
    mapId: number | null;
    // stats.derived (physicalAttack/defense) = valeurs finales serveur (parité
    // avec le panneau joueur, aligné lui aussi sur stats.derived).
    stats: CharacterStats;
    combat: { attackRangeWU: number };
    // Solde lecture seule (aucune création de wallet). Mêmes unités que le joueur.
    wallet: { gold: number; silver: number; bronze: number };
  };
  inventory: InventoryEntryDto[];
  equipment: AdminEquipmentEntry[];
  masteries: Awaited<ReturnType<MasteriesService['getCharacterMasteries']>>;
}

interface LootPoolEntryPatch {
  itemId: string;
  minQty: number;
  maxQty: number;
  probability: number;
}

interface RecipeIngredientPatch {
  itemId: string;
  requiredQuantity: number;
}

interface RecipeResultPatch {
  itemId: string;
  producedQuantity: number;
  chance: number;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(CreatureTemplate)
    private readonly templateRepo: Repository<CreatureTemplate>,
    @InjectRepository(CreatureSpawn)
    private readonly spawnRepo: Repository<CreatureSpawn>,
    @InjectRepository(Creature)
    private readonly creatureRepo: Repository<Creature>,
    @InjectRepository(Character)
    private readonly characterRepo: Repository<Character>,
    @InjectRepository(Resource)
    private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(ResourceTemplate)
    private readonly resourceTemplateRepo: Repository<ResourceTemplate>,
    @InjectRepository(MasteryDefinition)
    private readonly masteryDefinitionRepo: Repository<MasteryDefinition>,
    @InjectRepository(PlayerMastery)
    private readonly playerMasteryRepo: Repository<PlayerMastery>,
    @InjectRepository(CraftingRecipe)
    private readonly recipeRepo: Repository<CraftingRecipe>,
    @InjectRepository(CraftingIngredient)
    private readonly ingredientRepo: Repository<CraftingIngredient>,
    @InjectRepository(CraftingResult)
    private readonly craftingResultRepo: Repository<CraftingResult>,
    @InjectRepository(CraftingStationTemplate)
    private readonly stationTemplateRepo: Repository<CraftingStationTemplate>,
    @InjectRepository(CraftingStation)
    private readonly stationRepo: Repository<CraftingStation>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    private readonly worldService: WorldService,
    private readonly inventoryProjection: InventoryProjectionService,
    private readonly masteriesService: MasteriesService,
    private readonly economyService: EconomyService,
    private readonly gameConfigService: GameConfigService,
    private readonly derivedStatsService: DerivedStatsService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Règles globales de progression (GameConfig — ADR-0018, Étape 1A) ────────

  /** Lecture des règles globales courantes. */
  async getGameConfig(): Promise<GameConfig> {
    return this.gameConfigService.getConfig();
  }

  /**
   * Applique un brouillon de règles globales. Le serveur reste seul décideur ;
   * aucun recalcul destructif des personnages n'est exécuté en Étape 1A.
   */
  async updateGameConfig(dto: UpdateGameConfigDto): Promise<GameConfig> {
    return this.gameConfigService.updateConfig(dto);
  }

  /**
   * Aperçu serveur d'un brouillon de règles globales, SANS écriture ni
   * recalcul. Toutes les valeurs d'exemple et la simulation sont calculées
   * côté serveur à partir des formules pures de progression — le Studio ne
   * recalcule rien.
   *
   * `targetLevel` pilote la zone "Simulation XP" du panneau Studio (transition
   * previousLevel → targetLevel). Par défaut, simule le passage vers le cap de
   * niveau courant du brouillon.
   */
  async previewGameConfig(
    dto: UpdateGameConfigDto,
    targetLevel?: number,
  ): Promise<GameConfigPreview> {
    const current = await this.gameConfigService.getConfig();
    const draft = { ...current, ...dto } as GameConfig;

    const affectedCharacterCount = await this.characterRepo.count();

    // Échantillons fixes demandés par le design Studio (lisibilité par palier).
    const sampleLevels = [1, 10, 30, 60, 120].filter(
      (level) => level <= draft.characterMaxLevel,
    );
    if (!sampleLevels.includes(draft.characterMaxLevel)) {
      sampleLevels.push(draft.characterMaxLevel);
    }

    const samples: GameConfigSample[] = sampleLevels.map((level) => ({
      level,
      totalStatPoints: totalStatPointsForLevel(level, draft),
      xpToReachLevel: xpToReachLevel(level, draft),
      cumulativeXp: cumulativeXpToLevel(level, draft),
    }));

    const resolvedTargetLevel = Math.min(
      Math.max(2, targetLevel ?? draft.characterCurrentLevelCap),
      draft.characterMaxLevel,
    );
    const simulation: GameConfigSimulation = {
      previousLevel: resolvedTargetLevel - 1,
      targetLevel: resolvedTargetLevel,
      xpForTransition: xpToReachLevel(resolvedTargetLevel, draft),
      cumulativeXpToTarget: cumulativeXpToLevel(resolvedTargetLevel, draft),
    };

    return {
      current,
      draft,
      affectedCharacterCount,
      samples,
      simulation,
      resetExecuted: false,
      note:
        'Aperçu uniquement. Aucune écriture effectuée par cette requête. ' +
        'Le reset global / réaffectation des points des personnages existants ' +
        "n'est PAS exécuté en Étape 1A (ADR-0018 §1).",
    };
  }

  /**
   * Recalcul global DESTRUCTIF de la progression de tous les personnages
   * (ADR-0018 §1).
   *
   * Pour chaque personnage :
   *   - `cumulativeExperience` est lue (ou backfillée si encore à 0 — voir
   *     `resolveCumulativeExperience`, backfill ESTIMÉ depuis la courbe
   *     actuellement en vigueur, jamais écrasé si déjà > 0) ;
   *   - `level` est recalculé via `levelFromCumulativeXp` depuis cette XP
   *     cumulée et la courbe XP actuelle (respecte `characterCurrentLevelCap`
   *     et `characterMaxLevel`) ;
   *   - `experience` (XP partielle dans le niveau courant) est recalculée via
   *     `experienceIntoCurrentLevel` ;
   *   - les 8 stats primaires distribuées (base{Strength,Vitality,Endurance,
   *     Agility,Dexterity,Intelligence,Wisdom,Critical}) sont remises à 0 ;
   *   - `unspentStatPoints` est recalculé depuis le NOUVEAU niveau via
   *     `totalStatPointsForLevel` — la MÊME formule pure que l'aperçu Studio
   *     (pas de système parallèle) ;
   *   - `health` est clampé à `maxHealth` (colonne brute) si nécessaire : après
   *     reset, la Vitalité contribuant 0 aux dérivées, `maxHealth` dérivée
   *     redevient exactement `character.maxHealth` — pas de recalcul complet
   *     via `CharacterStatsCalculator` nécessaire pour ce clamp ciblé.
   *
   * Les autres stats dérivées (physicalAttack, defense…) ne sont pas stockées :
   * elles sont recalculées à la volée par `CharacterStatsCalculator` à la
   * prochaine lecture, donc automatiquement à jour après ce reset.
   *
   * Exige `confirm: true` explicite. Exécuté en une seule transaction DataSource
   * (tout ou rien) — `errors` reste réservé aux anomalies ligne par ligne qui
   * n'empêchent pas la transaction de committer.
   *
   * Après commit, notifie chaque personnage traité via `character:reload`
   * (`WorldService.emitCharacterReload`, réutilisé tel quel — no-op silencieux
   * si hors ligne). Le client se contente de refetch `GET /characters/me` :
   * level, experience, unspentStatPoints, stats de base remises à 0 et
   * `stats.derived` recalculées y sont déjà tous exposés par le serveur, donc
   * aucun payload dédié n'est nécessaire et le client ne recalcule rien.
   */
  async recalculateCharacterProgression(
    dto: RecalculateCharacterProgressionDto,
  ): Promise<CharacterProgressionRecalculationReport> {
    if (dto?.confirm !== true) {
      throw new BadRequestException(
        'confirm=true requis explicitement pour cette action destructive.',
      );
    }

    const cfg = await this.gameConfigService.getConfig();
    const errors: CharacterProgressionRecalculationError[] = [];
    const processedCharacterIds: string[] = [];
    let processedCharacterCount = 0;
    let levelsChangedCount = 0;
    let totalCumulativeExperienceUsed = 0;
    let oldDistributedTotal = 0;
    let newAvailableTotal = 0;

    const characters = await this.characterRepo.find();

    await this.dataSource.transaction(async (manager) => {
      for (const character of characters) {
        try {
          // baseCritical (legacy) inclus dans le total distribué pour un
          // rapport exact, bien qu'il ne fasse plus partie de
          // ADMIN_STAT_POINT_FIELDS depuis que Critique est devenue dérivée.
          const legacyCriticalPoints = character.baseCritical ?? 0;
          const oldDistributed =
            ADMIN_STAT_POINT_FIELDS.reduce(
              (sum, field) => sum + (character[field] ?? 0),
              0,
            ) +
            legacyCriticalPoints +
            (character.unspentStatPoints ?? 0);

          const cumulativeExperience = resolveCumulativeExperience(character, cfg);
          const newLevel = levelFromCumulativeXp(cumulativeExperience, cfg);
          const newExperience = experienceIntoCurrentLevel(cumulativeExperience, newLevel, cfg);
          // Remboursement legacy : les points encore investis dans
          // baseCritical (stat primaire supprimée) sont reversés en points
          // disponibles au lieu d'être perdus, puis la colonne est remise à 0.
          const newUnspent = totalStatPointsForLevel(newLevel, cfg) + legacyCriticalPoints;

          const resetFields = Object.fromEntries(
            ADMIN_STAT_POINT_FIELDS.map((field) => [field, 0]),
          );

          // Clamp santé ciblé : Vitalité=0 après reset -> maxHealth dérivée =
          // character.maxHealth (colonne brute, sans bonus). Ne recalcule pas
          // le pipeline complet CharacterStatsCalculator pour ce seul clamp.
          const healthPatch =
            character.health > character.maxHealth
              ? { health: character.maxHealth }
              : {};

          await manager.update(Character, character.id, {
            ...resetFields,
            baseCritical: 0,
            level: newLevel,
            experience: newExperience,
            cumulativeExperience,
            unspentStatPoints: newUnspent,
            ...healthPatch,
          });

          if (newLevel !== character.level) levelsChangedCount++;
          totalCumulativeExperienceUsed += cumulativeExperience;
          oldDistributedTotal += oldDistributed;
          newAvailableTotal += newUnspent;
          processedCharacterCount++;
          processedCharacterIds.push(character.id);
        } catch (err) {
          errors.push({
            characterId: character.id,
            message: err instanceof Error ? err.message : 'Erreur inconnue.',
          });
        }
      }
    });

    // Émission après commit uniquement (jamais pendant la transaction).
    // `emitCharacterReload` ne fait rien si le personnage n'est pas connecté
    // (rafraîchit le panneau joueur). `emitAdminCharacterDirty` est diffusé à
    // la room admin pour TOUS les personnages traités, connectés ou non —
    // le DevTools (liste Joueurs, miroir Perso) doit refléter le recalcul
    // même pour un personnage hors ligne.
    let notifiedConnectedCharacterCount = 0;
    for (const characterId of processedCharacterIds) {
      if (this.worldService.getConnectedPlayerByCharacterId(characterId)) {
        notifiedConnectedCharacterCount++;
      }
      this.worldService.emitCharacterReload(characterId);
      this.worldService.emitAdminCharacterDirty(characterId, 'stats');
    }

    return {
      processedCharacterCount,
      totalCharacterCount: characters.length,
      levelsChangedCount,
      totalCumulativeExperienceUsed,
      oldDistributedTotal,
      newAvailableTotal,
      notifiedConnectedCharacterCount,
      errors,
      executedAt: new Date().toISOString(),
    };
  }

  // ── Assets — sandbox filesystem ──────────────────────────────────────────

  // Remontée depuis __dirname jusqu'à trouver apps/client/public/assets.
  // Robuste quelle que soit la profondeur réelle de __dirname au runtime (ts-node vs dist).
  private static readonly ASSET_ROOT = (() => {
    let dir = __dirname;
    for (let i = 0; i < 12; i++) {
      const candidate = nodePath.join(dir, 'apps', 'client', 'public', 'assets');
      if (fs.existsSync(candidate)) return candidate;
      const parent = nodePath.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return nodePath.resolve(__dirname, '../../../../apps/client/public/assets');
  })();

  private static readonly ALLOWED_EXTENSIONS = new Set([
    '.png', '.webp', '.jpg', '.jpeg', '.gif', '.json', '.tsx', '.tmj',
  ]);

  private static readonly MIME_MAP: Record<string, string> = {
    '.png': 'image/png', '.webp': 'image/webp',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.json': 'application/json', '.tsx': 'text/xml', '.tmj': 'application/json',
  };

  getAssetTree(): AssetNode[] {
    if (!fs.existsSync(AdminService.ASSET_ROOT)) {
      throw new Error(
        `ASSET_ROOT introuvable : ${AdminService.ASSET_ROOT} — vérifier __dirname au démarrage.`,
      );
    }
    return this.buildAssetTree(AdminService.ASSET_ROOT, '/assets');
  }

  private buildAssetTree(absDir: string, publicPrefix: string): AssetNode[] {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }); }
    catch { return []; }

    const nodes: AssetNode[] = [];
    for (const entry of entries) {
      const absPath = nodePath.join(absDir, entry.name);
      const resolved = nodePath.resolve(absPath);
      if (!resolved.startsWith(AdminService.ASSET_ROOT + nodePath.sep) &&
          resolved !== AdminService.ASSET_ROOT) {
        throw new ForbiddenException('Accès hors sandbox interdit.');
      }

      const publicPath = `${publicPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        nodes.push({ name: entry.name, type: 'directory', path: publicPath,
          children: this.buildAssetTree(absPath, publicPath) });
      } else if (entry.isFile()) {
        const ext = nodePath.extname(entry.name).toLowerCase();
        if (!AdminService.ALLOWED_EXTENSIONS.has(ext)) continue;
        const size = fs.statSync(absPath).size;
        nodes.push({ name: entry.name, type: 'file', path: publicPath,
          size, mime: AdminService.MIME_MAP[ext] ?? 'application/octet-stream' });
      }
    }
    return nodes.sort((a, b) =>
      a.type !== b.type ? (a.type === 'directory' ? -1 : 1) : a.name.localeCompare(b.name),
    );
  }

  // ── Debug movement authority ────────────────────────────────────────────────

  getMovementMetrics(): MovementMetrics {
    return this.worldService.getMovementMetrics();
  }

  resetMovementMetrics(): MovementMetrics {
    return this.worldService.resetMovementMetrics();
  }

  // ── Créatures ─────────────────────────────────────────────────────────────

  async getTemplates(): Promise<CreatureTemplate[]> {
    return this.templateRepo.find({ order: { name: 'ASC' } });
  }

  async createCreatureTemplate(
    fields: Pick<CreatureTemplate, 'key' | 'name'> &
      Partial<Pick<CreatureTemplate, 'textureKey' | 'baseHealth' | 'baseAttack' | 'baseArmor' | 'aggroRadius' | 'fleeThresholdPct' | 'patrolRadius' | 'speedMin' | 'speedMax' | 'respawnDelayMs'>>,
  ): Promise<CreatureTemplate> {
    if (!fields.key || typeof fields.key !== 'string') throw new BadRequestException('key est requis.');
    AdminService.validateSnakeCase(fields.key, 'key');
    const existing = await this.templateRepo.findOne({ where: { key: fields.key } });
    if (existing) throw new BadRequestException(`Créature "${fields.key}" existe déjà.`);
    if (!fields.name || typeof fields.name !== 'string' || fields.name.trim() === '') {
      throw new BadRequestException('name est requis et non vide.');
    }
    if (fields.textureKey !== undefined) {
      if (typeof fields.textureKey !== 'string' || fields.textureKey.trim() === '') {
        throw new BadRequestException('textureKey doit être une chaîne non vide.');
      }
    }
    return this.templateRepo.save(this.templateRepo.create({
      key: fields.key,
      name: fields.name.trim(),
      textureKey: fields.textureKey?.trim() ?? 'turkey',
      baseHealth: fields.baseHealth ?? 30,
      baseAttack: fields.baseAttack ?? 3,
      baseArmor: fields.baseArmor ?? 0,
      aggroRadius: fields.aggroRadius ?? 0,
      fleeThresholdPct: fields.fleeThresholdPct ?? 0,
      patrolRadius: fields.patrolRadius ?? 100,
      speedMin: fields.speedMin ?? 60,
      speedMax: fields.speedMax ?? 100,
      respawnDelayMs: fields.respawnDelayMs ?? 20_000,
    }));
  }

  async updateTemplate(
    key: string,
    fields: Partial<Pick<CreatureTemplate, 'baseHealth' | 'aggroRadius' | 'baseAttack' | 'baseArmor' | 'fleeThresholdPct' | 'patrolRadius' | 'respawnDelayMs' | 'killCharacterXpReward' | 'name' | 'textureKey'>> & { lootPool?: unknown },
  ): Promise<CreatureTemplate | null> {
    const template = await this.templateRepo.findOne({ where: { key } });
    if (!template) return null;
    const { lootPool, ...scalarFields } = fields;
    Object.assign(template, scalarFields);
    if (lootPool !== undefined) {
      template.lootPool = await this.validateLootPool(lootPool);
    }
    return this.templateRepo.save(template);
  }

  getSpawns(): Promise<CreatureSpawn[]> {
    return this.spawnRepo.find({ relations: ['template'], order: { key: 'ASC' } });
  }

  // ── Joueurs ───────────────────────────────────────────────────────────────

  /**
   * Enrichit une ligne Character : position live (ConnectedPlayer si connecté,
   * sinon DB) + stats dérivées calculées serveur. Utilisé par `getCharacters`
   * (liste complète) et `getCharacterRow` (une seule ligne, refresh ciblé
   * DevTools) — logique unique, jamais dupliquée.
   */
  private enrichCharacterRow(
    char: Character,
    derivedStatDefinitions: DerivedStatDefinition[],
  ): Character & { stats: CharacterStats } {
    const live = this.worldService.getConnectedPlayerByCharacterId(char.id);
    if (live) {
      char.worldX = live.worldX;
      char.worldY = live.worldY;
      char.mapId = live.mapId;
    }
    return Object.assign(char, { stats: CharacterStatsCalculator.compute(char, derivedStatDefinitions) });
  }

  async getCharacters(): Promise<(Character & { stats: CharacterStats })[]> {
    const characters = await this.characterRepo.find({ order: { name: 'ASC' } });
    const derivedStatDefinitions = await this.derivedStatsService.getDefinitions();
    return characters.map((char) => this.enrichCharacterRow(char, derivedStatDefinitions));
  }

  /**
   * Une seule ligne Character enrichie (même forme qu'un élément de
   * `getCharacters()`). Permet au DevTools de rafraîchir un joueur précis
   * (sélection/ouverture, ou événement `admin:character_details_dirty`)
   * sans recharger la liste complète — évite la surcharge à grande échelle
   * (ex. 500 joueurs).
   */
  async getCharacterRow(id: string): Promise<(Character & { stats: CharacterStats }) | null> {
    const character = await this.characterRepo.findOne({ where: { id } });
    if (!character) return null;
    const derivedStatDefinitions = await this.derivedStatsService.getDefinitions();
    return this.enrichCharacterRow(character, derivedStatDefinitions);
  }

  findCharacterById(id: string): Promise<Character | null> {
    return this.characterRepo.findOne({ where: { id } });
  }

  // Champs éditables via DevTools : progression, valeurs brutes combat/debug,
  // stats principales et points non dépensés. Les stats dérivées ne sont JAMAIS
  // écrites (calculées serveur).
  //
  // `level`/`experience` : si l'un des deux est édité, on ne les écrit jamais
  // tels quels. On les recompose en `cumulativeExperience` (avec la valeur de
  // l'autre champ inchangée si non édité), puis on re-dérive `level` et
  // `experience` depuis cette XP cumulée et la courbe XP ACTUELLE
  // (`levelFromCumulativeXp` / `experienceIntoCurrentLevel` — mêmes fonctions
  // pures que le gain d'XP normal et le recalcul global admin, ADR-0018 §1).
  // Garantit que `cumulativeExperience` reste la source de vérité unique :
  // un gain d'XP normal ultérieur repart d'un état cohérent, jamais divergent.
  // `unspentStatPoints` n'est JAMAIS recalculé automatiquement ici — il reste
  // un levier admin explicite et distinct (édité séparément si besoin).
  async updateCharacter(
    id: string,
    fields: Partial<
      Pick<
        Character,
        | 'level'
        | 'experience'
        | 'health'
        | 'maxHealth'
        | 'attack'
        | 'defense'
        | 'baseStrength'
        | 'baseVitality'
        | 'baseEndurance'
        | 'baseAgility'
        | 'baseDexterity'
        | 'baseIntelligence'
        | 'baseWisdom'
        | 'baseSpirit'
        | 'baseWillpower'
        | 'baseCharisma'
        | 'baseCritical'
        | 'unspentStatPoints'
      >
    >,
  ): Promise<(Character & { stats: CharacterStats }) | null> {
    const character = await this.characterRepo.findOne({ where: { id } });
    if (!character) return null;

    let patch: Partial<Character> = fields;
    if ('level' in fields || 'experience' in fields) {
      const cfg = await this.gameConfigService.getConfig();
      const draftLevel = fields.level ?? character.level;
      const draftExperience = fields.experience ?? character.experience;
      const cumulativeExperience = cumulativeXpToLevel(draftLevel, cfg) + draftExperience;
      const newLevel = levelFromCumulativeXp(cumulativeExperience, cfg);
      const newExperience = experienceIntoCurrentLevel(cumulativeExperience, newLevel, cfg);
      patch = { ...fields, level: newLevel, experience: newExperience, cumulativeExperience };
    }

    Object.assign(character, patch);
    const saved = await this.characterRepo.save(character);
    const derivedStatDefinitions = await this.derivedStatsService.getDefinitions();
    return Object.assign(saved, { stats: CharacterStatsCalculator.compute(saved, derivedStatDefinitions) });
  }

  /**
   * Inspection admin READ-ONLY d'un personnage ciblé (Player Inspector Phase 1).
   * Snapshot compact délégué aux services existants — aucune mutation, aucun
   * recalcul côté client. Position live superposée depuis le runtime.
   */
  async getCharacterDetails(id: string): Promise<AdminCharacterDetails | null> {
    const character = await this.characterRepo.findOne({
      where: { id },
      relations: ['equipment', 'equipment.item'],
    });
    if (!character) return null;

    // Position live (runtime) si connecté, sinon DB (dernière persistée).
    const live = this.worldService.getConnectedPlayerByCharacterId(character.id);
    if (live) {
      character.worldX = live.worldX;
      character.worldY = live.worldY;
      character.mapId = live.mapId;
    }

    const [inventory, masteries, balanceBronze, derivedStatDefinitions] = await Promise.all([
      this.inventoryProjection.project(character.id),
      this.masteriesService.getCharacterMasteries(character.id),
      // Lecture PURE : ne crée jamais de wallet par simple consultation.
      this.economyService.readBalanceBronze('character', character.id),
      this.derivedStatsService.getDefinitions(),
    ]);
    const wallet = {
      gold: Number(balanceBronze / 10_000n),
      silver: Number((balanceBronze % 10_000n) / 100n),
      bronze: Number(balanceBronze % 100n),
    };

    const equipment = (character.equipment ?? []).map((eq) => ({
      slot: eq.slot,
      itemInstanceId: eq.itemInstanceId ?? null,
      itemId: eq.item?.id ?? null,
      name: eq.item?.name ?? null,
      image: eq.item?.image ?? null,
      type: eq.item?.type ?? null,
      equipSlot: eq.item?.slot ?? null,
      objectMode: eq.item?.objectMode ?? null,
    }));

    return {
      character: {
        id: character.id,
        name: character.name,
        sex: character.sex,
        level: character.level,
        experience: character.experience,
        health: character.health,
        maxHealth: character.maxHealth,
        unspentStatPoints: character.unspentStatPoints,
        connected: !!live,
        worldX: character.worldX,
        worldY: character.worldY,
        mapId: character.mapId,
        // stats.base = stats de base ; stats.derived = calculées serveur (lecture seule).
        stats: CharacterStatsCalculator.compute(character, derivedStatDefinitions),
        combat: { attackRangeWU: resolveEffectiveAttackRangeWU(character.equipment) },
        wallet,
      },
      inventory,
      equipment,
      masteries,
    };
  }

  // ── Templates de ressources ───────────────────────────────────────────────

  getResourceTemplates(): Promise<ResourceTemplate[]> {
    return this.resourceTemplateRepo.find({ order: { type: 'ASC' } });
  }

  async createResourceTemplate(
    fields: Pick<ResourceTemplate, 'type'> &
      Partial<Pick<ResourceTemplate, 'textureKey' | 'defaultRemainingLoots' | 'respawnDelayMs' | 'gatheringXpReward' | 'gatherCharacterXpReward' | 'gatheringDifficulty'>> & { masteryKey?: string | null; lootPool?: unknown },
  ): Promise<ResourceTemplate> {
    if (!fields.type || typeof fields.type !== 'string') throw new BadRequestException('type est requis.');
    AdminService.validateSnakeCase(fields.type, 'type');
    const existing = await this.resourceTemplateRepo.findOne({ where: { type: fields.type } });
    if (existing) throw new BadRequestException(`Template ressource "${fields.type}" existe déjà.`);
    if (fields.textureKey !== undefined) {
      if (typeof fields.textureKey !== 'string' || fields.textureKey.trim() === '') {
        throw new BadRequestException('textureKey doit être une chaîne non vide.');
      }
    }
    if (fields.gatherCharacterXpReward !== undefined) {
      const v = fields.gatherCharacterXpReward;
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > 999_999) {
        throw new BadRequestException('gatherCharacterXpReward doit être un entier >= 0 et <= 999 999.');
      }
    }
    if (fields.gatheringDifficulty !== undefined) {
      const v = fields.gatheringDifficulty;
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > 100) {
        throw new BadRequestException('gatheringDifficulty doit être un entier entre 0 et 100.');
      }
    }
    if ('masteryKey' in fields && fields.masteryKey != null) {
      const sd = await this.masteryDefinitionRepo.findOne({ where: { key: fields.masteryKey } });
      if (!sd) throw new BadRequestException(`Mastery "${fields.masteryKey}" inexistant dans MasteryDefinition.`);
    }
    const lootPool = fields.lootPool !== undefined ? await this.validateLootPool(fields.lootPool) : null;
    return this.resourceTemplateRepo.save(this.resourceTemplateRepo.create({
      type: fields.type,
      textureKey: fields.textureKey?.trim() ?? 'dead_tree',
      defaultRemainingLoots: fields.defaultRemainingLoots ?? 4,
      respawnDelayMs: fields.respawnDelayMs ?? 30_000,
      gatheringXpReward: fields.gatheringXpReward ?? 0,
      gatherCharacterXpReward: fields.gatherCharacterXpReward ?? 0,
      gatheringDifficulty: fields.gatheringDifficulty ?? 0,
      masteryKey: fields.masteryKey === '' ? null : fields.masteryKey ?? null,
      lootPool,
    }));
  }

  async updateResourceTemplate(
    type: string,
    fields: Partial<Pick<ResourceTemplate, 'defaultRemainingLoots' | 'respawnDelayMs' | 'gatheringXpReward' | 'gatherCharacterXpReward' | 'gatheringDifficulty' | 'textureKey'>> & { masteryKey?: string | null; lootPool?: unknown },
  ): Promise<ResourceTemplate | null> {
    if (fields.respawnDelayMs !== undefined) {
      const v = fields.respawnDelayMs;
      if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0 || v > 86_400_000) {
        throw new BadRequestException(
          'respawnDelayMs doit être un entier > 0 et <= 86 400 000 ms (24h).',
        );
      }
    }
    if (fields.defaultRemainingLoots !== undefined) {
      const v = fields.defaultRemainingLoots;
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 1 || v > 999_999) {
        throw new BadRequestException(
          'defaultRemainingLoots doit être un entier >= 1 et <= 999 999.',
        );
      }
    }
    if (fields.gatheringXpReward !== undefined) {
      const v = fields.gatheringXpReward;
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > 999_999) {
        throw new BadRequestException(
          'gatheringXpReward doit être un entier >= 0 et <= 999 999.',
        );
      }
    }
    if (fields.gatherCharacterXpReward !== undefined) {
      const v = fields.gatherCharacterXpReward;
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > 999_999) {
        throw new BadRequestException(
          'gatherCharacterXpReward doit être un entier >= 0 et <= 999 999.',
        );
      }
    }
    if (fields.gatheringDifficulty !== undefined) {
      const v = fields.gatheringDifficulty;
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > 100) {
        throw new BadRequestException(
          'gatheringDifficulty doit être un entier entre 0 et 100.',
        );
      }
    }
    if ('masteryKey' in fields) {
      const v = fields.masteryKey;
      if (v !== null) {
        if (typeof v !== 'string' || v.trim() === '') {
          throw new BadRequestException('masteryKey doit être une chaîne non vide ou null.');
        }
        const exists = await this.masteryDefinitionRepo.findOne({ where: { key: v } });
        if (!exists) {
          throw new BadRequestException(`Mastery "${v}" inexistant dans MasteryDefinition.`);
        }
      }
    }
    if (fields.textureKey !== undefined) {
      if (typeof fields.textureKey !== 'string' || fields.textureKey.trim() === '') {
        throw new BadRequestException('textureKey doit être une chaîne non vide.');
      }
    }
    const tpl = await this.resourceTemplateRepo.findOne({ where: { type } });
    if (!tpl) return null;
    const { lootPool, ...scalarFields } = fields;
    Object.assign(tpl, scalarFields);
    if (lootPool !== undefined) {
      tpl.lootPool = await this.validateLootPool(lootPool);
    }
    return this.resourceTemplateRepo.save(tpl);
  }

  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  private async validateLootPool(value: unknown): Promise<LootPoolEntryPatch[] | null> {
    if (value === null) return null;
    if (!Array.isArray(value)) {
      throw new BadRequestException('lootPool doit être un tableau ou null.');
    }

    const entries = value.map((entry, index) => this.normalizeLootPoolEntry(entry, index));
    const refs = [...new Set(entries.map((entry) => entry.itemId))];
    if (refs.length === 0) return entries;

    const uuidRefs = refs.filter((r) => AdminService.UUID_RE.test(r));
    const categoryRefs = refs.filter((r) => !AdminService.UUID_RE.test(r));

    const whereClause: object[] = [];
    if (uuidRefs.length > 0) whereClause.push({ id: In(uuidRefs) });
    if (categoryRefs.length > 0) whereClause.push({ category: In(categoryRefs) });

    const items = whereClause.length > 0
      ? await this.itemRepo.find({ where: whereClause })
      : [];

    const knownRefs = new Set(items.flatMap((item) => [item.id, item.category]));
    const unknownRef = refs.find((ref) => !knownRefs.has(ref));
    if (unknownRef) {
      throw new BadRequestException(`Item "${unknownRef}" introuvable pour lootPool.`);
    }

    return entries;
  }

  private normalizeLootPoolEntry(entry: unknown, index: number): LootPoolEntryPatch {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new BadRequestException(`lootPool[${index}] doit être un objet.`);
    }
    const raw = entry as Record<string, unknown>;
    const itemId = typeof raw.itemId === 'string' ? raw.itemId.trim() : '';
    if (!itemId) {
      throw new BadRequestException(`lootPool[${index}].itemId est requis.`);
    }

    const minQty = AdminService.readInteger(raw.minQty, `lootPool[${index}].minQty`);
    const maxQty = AdminService.readInteger(raw.maxQty, `lootPool[${index}].maxQty`);
    const probability = AdminService.readNumber(raw.probability, `lootPool[${index}].probability`);

    if (minQty < 1) {
      throw new BadRequestException(`lootPool[${index}].minQty doit être >= 1.`);
    }
    if (maxQty < minQty) {
      throw new BadRequestException(`lootPool[${index}].maxQty doit être >= minQty.`);
    }
    if (probability <= 0 || probability > 1) {
      throw new BadRequestException(`lootPool[${index}].probability doit être > 0 et <= 1.`);
    }

    return { itemId, minQty, maxQty, probability };
  }

  private static readInteger(value: unknown, label: string): number {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new BadRequestException(`${label} doit être un entier.`);
    }
    return value as number;
  }

  private static readNumber(value: unknown, label: string): number {
    if (!Number.isFinite(value)) {
      throw new BadRequestException(`${label} doit être un nombre fini.`);
    }
    return value as number;
  }

  // ── Ressources ────────────────────────────────────────────────────────────

  getResources(): Promise<Resource[]> {
    return this.resourceRepo.find({ order: { type: 'ASC' } });
  }

  /** Passerelle temporaire vers le futur Studio SDK — lecture seule. */
  async getResourceWorldObjects(): Promise<ResourceWorldObject[]> {
    const [resources, templates] = await Promise.all([
      this.resourceRepo.find({ order: { type: 'ASC' } }),
      this.resourceTemplateRepo.find(),
    ]);
    const templateByType = new Map(templates.map((t) => [t.type, t]));
    return resources.map((r) => toResourceWorldObject(r, templateByType.get(r.type) ?? null));
  }

  /** Passerelle temporaire vers le futur Studio SDK — lecture seule. */
  async getCreatureSpawnWorldObjects(): Promise<CreatureSpawnWorldObject[]> {
    const spawns = await this.spawnRepo.find({
      relations: ['template'],
      order: { key: 'ASC' },
    });
    return spawns.map(toCreatureSpawnWorldObject);
  }

  /** Passerelle temporaire vers le futur Studio SDK — lecture seule. */
  async getCreatureWorldObjects(): Promise<CreatureWorldObject[]> {
    const creatures = await this.creatureRepo.find({
      relations: ['spawn', 'spawn.template'],
      order: { state: 'ASC' },
    });
    return creatures.map(toCreatureWorldObject);
  }

  async updateResource(
    id: string,
    fields: Partial<Pick<Resource, 'worldX' | 'worldY' | 'remainingLoots' | 'state' | 'respawnDelayMs'>>,
  ): Promise<Resource | null> {
    const resource = await this.resourceRepo.findOne({ where: { id } });
    if (!resource) return null;
    // Un déplacement sans changement d'état explicite remet la ressource en jeu
    if (('worldX' in fields || 'worldY' in fields) && !('state' in fields)) {
      resource.state = 'alive';
      if (resource.remainingLoots === 0) resource.remainingLoots = 5;
    }
    if ('worldX' in fields || 'worldY' in fields) {
      const targetWorldX = Math.round(fields.worldX ?? resource.worldX ?? 0);
      const targetWorldY = Math.round(fields.worldY ?? resource.worldY ?? 0);
      if (!Number.isFinite(targetWorldX) || !Number.isFinite(targetWorldY)) {
        throw new BadRequestException('Coordonnées ressource invalides : worldX et worldY doivent être finis.');
      }
      resource.worldX = targetWorldX;
      resource.worldY = targetWorldY;
      resource.mapId = DEFAULT_MAP_ID;
    }
    if ('remainingLoots' in fields) resource.remainingLoots = fields.remainingLoots!;
    if ('state' in fields) resource.state = fields.state!;
    if ('respawnDelayMs' in fields) resource.respawnDelayMs = fields.respawnDelayMs!;
    return this.resourceRepo.save(resource);
  }

  async createResource(type: string, worldX: number, worldY: number): Promise<Resource> {
    const targetWorldX = Math.round(worldX);
    const targetWorldY = Math.round(worldY);
    if (!Number.isFinite(targetWorldX) || !Number.isFinite(targetWorldY)) {
      throw new BadRequestException('Coordonnées ressource invalides : worldX et worldY doivent être finis.');
    }
    const tpl = await this.resourceTemplateRepo.findOne({ where: { type } });
    const remainingLoots = tpl?.defaultRemainingLoots ?? 9999;
    return this.resourceRepo.save(
      this.resourceRepo.create({ type, worldX: targetWorldX, worldY: targetWorldY, mapId: DEFAULT_MAP_ID, remainingLoots }),
    );
  }

  async deleteResource(id: string): Promise<Resource | null> {
    const resource = await this.resourceRepo.findOne({ where: { id } });
    if (!resource) return null;
    await this.resourceRepo.delete(id);
    return resource;
  }

  // ── MasteryDefinitions ─────────────────────────────────────────────────────

  private static readonly SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]{1,63}$/;

  private static validateSnakeCase(value: string, label: string): void {
    if (!AdminService.SNAKE_CASE_REGEX.test(value)) {
      throw new BadRequestException(
        `${label} doit être en snake_case (a-z, 0-9, _), 2-64 caractères, commencer par une lettre.`,
      );
    }
  }

  private static validateMaxLevel(v: number): void {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 2 || v > 999) {
      throw new BadRequestException('maxLevel doit être un entier entre 2 et 999.');
    }
  }

  private static validateBaseXpPerLevel(v: number): void {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 1 || v > 100_000) {
      throw new BadRequestException('baseXpPerLevel doit être un entier entre 1 et 100 000.');
    }
  }

  private static validateXpCurveExponent(v: number): void {
    if (!Number.isFinite(v) || v < 1.0 || v > 3.0) {
      throw new BadRequestException('xpCurveExponent doit être un nombre entre 1.0 et 3.0.');
    }
  }

  getMasteryDefinitions(): Promise<MasteryDefinition[]> {
    return this.masteryDefinitionRepo.find({ order: { key: 'ASC' } });
  }

  async getMasteryDefinitionWorldObjects(): Promise<MasteryDefinitionWorldObject[]> {
    const sds = await this.getMasteryDefinitions();
    return sds.map(toMasteryDefinitionWorldObject);
  }

  async createMasteryDefinition(
    fields: Pick<MasteryDefinition, 'key' | 'name'> &
      Partial<Pick<MasteryDefinition, 'category' | 'maxLevel' | 'baseXpPerLevel' | 'xpCurveExponent' | 'enabled'>>,
  ): Promise<MasteryDefinition> {
    if (!fields.key || typeof fields.key !== 'string') {
      throw new BadRequestException('key est requis.');
    }
    AdminService.validateSnakeCase(fields.key, 'key');

    const existing = await this.masteryDefinitionRepo.findOne({ where: { key: fields.key } });
    if (existing) {
      throw new BadRequestException(`Mastery "${fields.key}" existe déjà.`);
    }

    if (!fields.name || typeof fields.name !== 'string' || fields.name.trim() === '') {
      throw new BadRequestException('name est requis et non vide.');
    }
    if (fields.name.length > 256) {
      throw new BadRequestException('name doit être <= 256 caractères.');
    }

    const toCreate: Partial<MasteryDefinition> = {
      key: fields.key,
      name: fields.name.trim(),
      category: 'general',
      maxLevel: 100,
      baseXpPerLevel: 100,
      xpCurveExponent: 1.5,
      enabled: true,
    };

    if (fields.category !== undefined) {
      AdminService.validateSnakeCase(fields.category, 'category');
      toCreate.category = fields.category;
    }
    if (fields.maxLevel !== undefined) {
      AdminService.validateMaxLevel(fields.maxLevel);
      toCreate.maxLevel = fields.maxLevel;
    }
    if (fields.baseXpPerLevel !== undefined) {
      AdminService.validateBaseXpPerLevel(fields.baseXpPerLevel);
      toCreate.baseXpPerLevel = fields.baseXpPerLevel;
    }
    if (fields.xpCurveExponent !== undefined) {
      AdminService.validateXpCurveExponent(fields.xpCurveExponent);
      toCreate.xpCurveExponent = fields.xpCurveExponent;
    }
    if (fields.enabled !== undefined) {
      toCreate.enabled = Boolean(fields.enabled);
    }

    const saved = await this.masteryDefinitionRepo.save(
      this.masteryDefinitionRepo.create(toCreate),
    );
    // Chemin socket (repo direct) : invalider le cache des définitions enabled
    // lu par MasteryEffectsService à chaque auto-attaque (V1-D-B).
    this.masteriesService.invalidateDefinitionsCache();
    return saved;
  }

  async updateMasteryDefinition(
    id: string,
    fields: Partial<Pick<MasteryDefinition, 'name' | 'category' | 'maxLevel' | 'baseXpPerLevel' | 'xpCurveExponent' | 'enabled'>>,
  ): Promise<MasteryDefinition | null> {
    const sd = await this.masteryDefinitionRepo.findOne({ where: { id } });
    if (!sd) return null;

    if (fields.name !== undefined) {
      if (typeof fields.name !== 'string' || fields.name.trim() === '') {
        throw new BadRequestException('name ne peut pas être vide.');
      }
      if (fields.name.length > 256) {
        throw new BadRequestException('name doit être <= 256 caractères.');
      }
      sd.name = fields.name.trim();
    }
    if (fields.category !== undefined) {
      AdminService.validateSnakeCase(fields.category, 'category');
      sd.category = fields.category;
    }
    if (fields.maxLevel !== undefined) {
      AdminService.validateMaxLevel(fields.maxLevel);
      const blocked = await this.playerMasteryRepo.count({
        where: { masteryDefinitionId: id, level: MoreThan(fields.maxLevel) },
      });
      if (blocked > 0) {
        throw new BadRequestException(
          `Impossible de réduire maxLevel à ${fields.maxLevel} : ${blocked} joueur(s) au-dessus de ce niveau.`,
        );
      }
      sd.maxLevel = fields.maxLevel;
    }
    if (fields.baseXpPerLevel !== undefined) {
      AdminService.validateBaseXpPerLevel(fields.baseXpPerLevel);
      sd.baseXpPerLevel = fields.baseXpPerLevel;
    }
    if (fields.xpCurveExponent !== undefined) {
      AdminService.validateXpCurveExponent(fields.xpCurveExponent);
      sd.xpCurveExponent = fields.xpCurveExponent;
    }
    if (fields.enabled !== undefined) {
      sd.enabled = Boolean(fields.enabled);
    }

    const saved = await this.masteryDefinitionRepo.save(sd);
    // Chemin socket (repo direct, hors MasteriesService.updateMasteryDefinition) :
    // sans cette invalidation, un toggle enabled/maxLevel via le Studio servirait
    // des effets de maîtrise périmés à l'auto-attaque jusqu'au redémarrage.
    this.masteriesService.invalidateDefinitionsCache();
    return saved;
  }

  // ── Items ────────────────────────────────────────────────────────────────

  getItems(): Promise<Item[]> {
    return this.itemRepo.find({ order: { category: 'ASC', name: 'ASC' } });
  }

  // ── CraftingRecipes ───────────────────────────────────────────────────────

  private static validateSuccessRate(v: number, label: string): void {
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      throw new BadRequestException(`${label} doit être un nombre entre 0 et 1.`);
    }
  }

  private static validateRequiredMasteryLevel(v: number): void {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 1 || v > 999) {
      throw new BadRequestException('requiredMasteryLevel doit être un entier entre 1 et 999.');
    }
  }

  private static validateCraftCharacterXpReward(v: number): void {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
      throw new BadRequestException('craftCharacterXpReward doit être un entier >= 0.');
    }
  }

  private static validateCraftingDifficulty(v: number): void {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > 100) {
      throw new BadRequestException('craftingDifficulty doit être un entier entre 0 et 100.');
    }
  }

  // ADR-0009 : aucune recette joueur instantanée — durée minimale MIN_CRAFT_TIME_MS.
  private static validateCraftTimeMs(v: number): void {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < MIN_CRAFT_TIME_MS) {
      throw new BadRequestException(MIN_CRAFT_TIME_MESSAGE);
    }
  }

  private static validateInteractionRadiusWU(v: number): void {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0 || v > 1_048_576) {
      throw new BadRequestException('interactionRadiusWU doit être un entier > 0 et <= 1 048 576 WU.');
    }
  }

  private static validateStationType(value: string, allowNone = false): void {
    if (value === 'none') {
      if (allowNone) return;
      throw new BadRequestException('stationType "none" est réservé aux recettes, interdit pour une station.');
    }
    AdminService.validateSnakeCase(value, 'stationType');
  }

  listCraftingRecipes(): Promise<CraftingRecipe[]> {
    return this.recipeRepo.find({
      relations: ['ingredients', 'results'],
      order: { key: 'ASC' },
    });
  }

  getCraftingRecipe(id: string): Promise<CraftingRecipe | null> {
    return this.recipeRepo.findOne({
      where: { id },
      relations: ['ingredients', 'results'],
    });
  }

  async getCraftingRecipeWorldObjects(): Promise<CraftingRecipeWorldObject[]> {
    const recipes = await this.listCraftingRecipes();
    return recipes.map(toCraftingRecipeWorldObject);
  }

  async createCraftingRecipe(
    fields: Pick<CraftingRecipe, 'key' | 'name'> &
      Partial<Pick<CraftingRecipe,
        'description' | 'category' | 'requiredMasteryKey' | 'requiredMasteryLevel' |
        'baseSuccessRate' | 'successBonusPerLevel' | 'minSuccessRate' | 'maxSuccessRate' |
        'xpReward' | 'consumeIngredientsOnFailure' | 'craftTimeMs' | 'stationType' | 'enabled' |
        'craftCharacterXpReward' | 'craftingDifficulty'
      >>,
  ): Promise<CraftingRecipe> {
    if (!fields.key || typeof fields.key !== 'string') {
      throw new BadRequestException('key est requis.');
    }
    AdminService.validateSnakeCase(fields.key, 'key');

    const existing = await this.recipeRepo.findOne({ where: { key: fields.key } });
    if (existing) throw new BadRequestException(`Recette "${fields.key}" existe déjà.`);

    if (!fields.name || typeof fields.name !== 'string' || fields.name.trim() === '') {
      throw new BadRequestException('name est requis et non vide.');
    }
    if (fields.name.length > 256) throw new BadRequestException('name doit être <= 256 caractères.');

    if (fields.requiredMasteryKey !== undefined) {
      const sd = await this.masteryDefinitionRepo.findOne({ where: { key: fields.requiredMasteryKey } });
      if (!sd) throw new BadRequestException(`Mastery "${fields.requiredMasteryKey}" inexistant dans MasteryDefinition.`);
    }
    if (fields.requiredMasteryLevel !== undefined) {
      AdminService.validateRequiredMasteryLevel(fields.requiredMasteryLevel);
    }
    if (fields.baseSuccessRate !== undefined) AdminService.validateSuccessRate(fields.baseSuccessRate, 'baseSuccessRate');
    if (fields.successBonusPerLevel !== undefined) AdminService.validateSuccessRate(fields.successBonusPerLevel, 'successBonusPerLevel');
    if (fields.minSuccessRate !== undefined) AdminService.validateSuccessRate(fields.minSuccessRate, 'minSuccessRate');
    if (fields.maxSuccessRate !== undefined) AdminService.validateSuccessRate(fields.maxSuccessRate, 'maxSuccessRate');

    if (fields.stationType !== undefined) {
      AdminService.validateStationType(fields.stationType, true);
      if (fields.stationType !== 'none') {
        const tpl = await this.stationTemplateRepo.findOne({ where: { stationType: fields.stationType } });
        if (!tpl) throw new BadRequestException(`StationType "${fields.stationType}" sans CraftingStationTemplate.`);
      }
    }

    const min = fields.minSuccessRate ?? 0.05;
    const max = fields.maxSuccessRate ?? 1.0;
    if (min > max) throw new BadRequestException('minSuccessRate ne peut pas être > maxSuccessRate.');

    if (fields.xpReward !== undefined) {
      if (!Number.isFinite(fields.xpReward) || !Number.isInteger(fields.xpReward) || fields.xpReward < 0) {
        throw new BadRequestException('xpReward doit être un entier >= 0.');
      }
    }
    // Durée : minimum 3 s à la création (défaut appliqué plus bas si absent).
    if (fields.craftTimeMs !== undefined) {
      AdminService.validateCraftTimeMs(fields.craftTimeMs);
    }
    if (fields.craftCharacterXpReward !== undefined) {
      AdminService.validateCraftCharacterXpReward(fields.craftCharacterXpReward);
    }
    if (fields.craftingDifficulty !== undefined) {
      AdminService.validateCraftingDifficulty(fields.craftingDifficulty);
    }

    const toCreate: Partial<CraftingRecipe> = {
      key: fields.key,
      name: fields.name.trim(),
      description: fields.description ?? null,
      category: fields.category ?? 'smithing',
      requiredMasteryKey: fields.requiredMasteryKey ?? 'smithing',
      requiredMasteryLevel: fields.requiredMasteryLevel ?? 1,
      baseSuccessRate: fields.baseSuccessRate ?? 1.0,
      successBonusPerLevel: fields.successBonusPerLevel ?? 0.02,
      minSuccessRate: fields.minSuccessRate ?? 0.05,
      maxSuccessRate: fields.maxSuccessRate ?? 1.0,
      xpReward: fields.xpReward ?? 10,
      consumeIngredientsOnFailure: fields.consumeIngredientsOnFailure ?? true,
      craftTimeMs: fields.craftTimeMs ?? MIN_CRAFT_TIME_MS,
      stationType: fields.stationType ?? 'none',
      enabled: fields.enabled ?? true,
      craftCharacterXpReward: fields.craftCharacterXpReward ?? 0,
      craftingDifficulty: fields.craftingDifficulty ?? 0,
      isDefault: false,
    };

    return this.recipeRepo.save(this.recipeRepo.create(toCreate));
  }

  async updateCraftingRecipe(
    id: string,
    fields: Partial<Pick<CraftingRecipe,
      'name' | 'description' | 'category' | 'requiredMasteryKey' | 'requiredMasteryLevel' |
      'baseSuccessRate' | 'successBonusPerLevel' | 'minSuccessRate' | 'maxSuccessRate' |
      'xpReward' | 'consumeIngredientsOnFailure' | 'craftTimeMs' | 'stationType' | 'enabled' |
      'craftCharacterXpReward' | 'craftingDifficulty'
    >>,
  ): Promise<CraftingRecipe | null> {
    const recipe = await this.recipeRepo.findOne({ where: { id }, relations: ['ingredients', 'results'] });
    if (!recipe) return null;

    if (fields.name !== undefined) {
      if (typeof fields.name !== 'string' || fields.name.trim() === '') throw new BadRequestException('name ne peut pas être vide.');
      if (fields.name.length > 256) throw new BadRequestException('name doit être <= 256 caractères.');
      recipe.name = fields.name.trim();
    }
    if ('description' in fields) recipe.description = fields.description ?? null;
    if (fields.category !== undefined) {
      AdminService.validateSnakeCase(fields.category, 'category');
      recipe.category = fields.category;
    }
    if (fields.requiredMasteryKey !== undefined) {
      const sd = await this.masteryDefinitionRepo.findOne({ where: { key: fields.requiredMasteryKey } });
      if (!sd) throw new BadRequestException(`Mastery "${fields.requiredMasteryKey}" inexistant dans MasteryDefinition.`);
      recipe.requiredMasteryKey = fields.requiredMasteryKey;
    }
    if (fields.requiredMasteryLevel !== undefined) {
      AdminService.validateRequiredMasteryLevel(fields.requiredMasteryLevel);
      recipe.requiredMasteryLevel = fields.requiredMasteryLevel;
    }
    if (fields.baseSuccessRate !== undefined)    { AdminService.validateSuccessRate(fields.baseSuccessRate, 'baseSuccessRate'); recipe.baseSuccessRate = fields.baseSuccessRate; }
    if (fields.successBonusPerLevel !== undefined) { AdminService.validateSuccessRate(fields.successBonusPerLevel, 'successBonusPerLevel'); recipe.successBonusPerLevel = fields.successBonusPerLevel; }
    if (fields.minSuccessRate !== undefined)     { AdminService.validateSuccessRate(fields.minSuccessRate, 'minSuccessRate'); recipe.minSuccessRate = fields.minSuccessRate; }
    if (fields.maxSuccessRate !== undefined)     { AdminService.validateSuccessRate(fields.maxSuccessRate, 'maxSuccessRate'); recipe.maxSuccessRate = fields.maxSuccessRate; }

    const effMin = fields.minSuccessRate ?? recipe.minSuccessRate;
    const effMax = fields.maxSuccessRate ?? recipe.maxSuccessRate;
    if (effMin > effMax) throw new BadRequestException('minSuccessRate ne peut pas être > maxSuccessRate.');

    if (fields.xpReward !== undefined) {
      if (!Number.isFinite(fields.xpReward) || !Number.isInteger(fields.xpReward) || fields.xpReward < 0) throw new BadRequestException('xpReward doit être un entier >= 0.');
      recipe.xpReward = fields.xpReward;
    }
    if (fields.consumeIngredientsOnFailure !== undefined) recipe.consumeIngredientsOnFailure = Boolean(fields.consumeIngredientsOnFailure);
    if (fields.craftTimeMs !== undefined) {
      AdminService.validateCraftTimeMs(fields.craftTimeMs);
      recipe.craftTimeMs = fields.craftTimeMs;
    }
    // Aucune recette invalide ne peut être sauvegardée : la durée effective doit
    // toujours respecter le minimum (corrige aussi les recettes legacy < 3 s dès
    // qu'on les édite).
    AdminService.validateCraftTimeMs(recipe.craftTimeMs);
    if (fields.craftCharacterXpReward !== undefined) {
      AdminService.validateCraftCharacterXpReward(fields.craftCharacterXpReward);
      recipe.craftCharacterXpReward = fields.craftCharacterXpReward;
    }
    if (fields.craftingDifficulty !== undefined) {
      AdminService.validateCraftingDifficulty(fields.craftingDifficulty);
      recipe.craftingDifficulty = fields.craftingDifficulty;
    }
    if (fields.stationType !== undefined) {
      AdminService.validateStationType(fields.stationType, true);
      if (fields.stationType !== 'none') {
        const tpl = await this.stationTemplateRepo.findOne({ where: { stationType: fields.stationType } });
        if (!tpl) throw new BadRequestException(`StationType "${fields.stationType}" sans CraftingStationTemplate.`);
      }
      recipe.stationType = fields.stationType;
    }
    if (fields.enabled !== undefined) recipe.enabled = Boolean(fields.enabled);

    // Toute édition de recette incrémente sa version (ADR-0009 : recipeVersion
    // snapshotée par CraftJob).
    recipe.version = (recipe.version ?? 1) + 1;

    return this.recipeRepo.save(recipe);
  }

  async addIngredient(recipeId: string, itemId: string, requiredQuantity: number): Promise<CraftingIngredient> {
    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe) throw new BadRequestException(`Recette "${recipeId}" introuvable.`);

    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item) throw new BadRequestException(`Item "${itemId}" introuvable.`);

    const existing = await this.ingredientRepo.findOne({ where: { recipeId, itemId } });
    if (existing) throw new BadRequestException(`Ingrédient "${itemId}" déjà présent dans cette recette.`);

    if (!Number.isFinite(requiredQuantity) || !Number.isInteger(requiredQuantity) || requiredQuantity < 1) {
      throw new BadRequestException('requiredQuantity doit être un entier >= 1.');
    }

    return this.ingredientRepo.save(this.ingredientRepo.create({ recipeId, itemId, requiredQuantity }));
  }

  async removeIngredient(ingredientId: string): Promise<CraftingIngredient | null> {
    const ing = await this.ingredientRepo.findOne({ where: { id: ingredientId } });
    if (!ing) return null;
    await this.ingredientRepo.delete(ingredientId);
    return ing;
  }

  async addResult(recipeId: string, itemId: string, producedQuantity: number, chance: number): Promise<CraftingResult> {
    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe) throw new BadRequestException(`Recette "${recipeId}" introuvable.`);

    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item) throw new BadRequestException(`Item "${itemId}" introuvable.`);

    const existing = await this.craftingResultRepo.findOne({ where: { recipeId, itemId } });
    if (existing) throw new BadRequestException(`Résultat "${itemId}" déjà présent dans cette recette.`);

    if (!Number.isFinite(producedQuantity) || !Number.isInteger(producedQuantity) || producedQuantity < 1) {
      throw new BadRequestException('producedQuantity doit être un entier >= 1.');
    }
    AdminService.validateSuccessRate(chance, 'chance');

    return this.craftingResultRepo.save(this.craftingResultRepo.create({ recipeId, itemId, producedQuantity, chance }));
  }

  async removeResult(resultId: string): Promise<CraftingResult | null> {
    const res = await this.craftingResultRepo.findOne({ where: { id: resultId } });
    if (!res) return null;
    await this.craftingResultRepo.delete(resultId);
    return res;
  }

  async replaceCraftingIngredients(recipeId: string, entries: unknown): Promise<CraftingRecipe | null> {
    const recipe = await this.getCraftingRecipe(recipeId);
    if (!recipe) return null;

    const normalized = await this.validateRecipeIngredients(entries);
    await this.ingredientRepo.delete({ recipeId } as any);
    if (normalized.length > 0) {
      const toSave = normalized.map((entry) => this.ingredientRepo.create({ recipeId, ...entry }));
      await this.ingredientRepo.save(toSave as any);
    }

    // Modification du contenu de la recette → bump recipeVersion (ADR-0009).
    recipe.version = (recipe.version ?? 1) + 1;
    await this.recipeRepo.save(recipe);

    return this.getCraftingRecipe(recipeId);
  }

  async replaceCraftingResults(recipeId: string, entries: unknown): Promise<CraftingRecipe | null> {
    const recipe = await this.getCraftingRecipe(recipeId);
    if (!recipe) return null;

    const normalized = await this.validateRecipeResults(entries);
    await this.craftingResultRepo.delete({ recipeId } as any);
    const toSave = normalized.map((entry) => this.craftingResultRepo.create({ recipeId, ...entry }));
    await this.craftingResultRepo.save(toSave as any);

    // Modification du contenu de la recette → bump recipeVersion (ADR-0009).
    recipe.version = (recipe.version ?? 1) + 1;
    await this.recipeRepo.save(recipe);

    return this.getCraftingRecipe(recipeId);
  }

  private async validateRecipeIngredients(value: unknown): Promise<RecipeIngredientPatch[]> {
    if (!Array.isArray(value)) {
      throw new BadRequestException('ingredients doit être un tableau.');
    }
    if (value.length === 0) {
      throw new BadRequestException('Une recette doit avoir au moins un ingrédient.');
    }

    const entries = value.map((entry, index) => this.normalizeRecipeIngredient(entry, index));
    await this.ensureUniqueRecipeItems(entries, 'ingredients');
    await this.ensureItemsExist(entries.map((entry) => entry.itemId), 'ingredients');
    return entries;
  }

  private async validateRecipeResults(value: unknown): Promise<RecipeResultPatch[]> {
    if (!Array.isArray(value)) {
      throw new BadRequestException('results doit être un tableau.');
    }
    if (value.length === 0) {
      throw new BadRequestException('Une recette doit avoir au moins un résultat.');
    }

    const entries = value.map((entry, index) => this.normalizeRecipeResult(entry, index));
    await this.ensureUniqueRecipeItems(entries, 'results');
    await this.ensureItemsExist(entries.map((entry) => entry.itemId), 'results');
    return entries;
  }

  private normalizeRecipeIngredient(entry: unknown, index: number): RecipeIngredientPatch {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new BadRequestException(`ingredients[${index}] doit être un objet.`);
    }
    const raw = entry as Record<string, unknown>;
    const itemId = typeof raw.itemId === 'string' ? raw.itemId.trim() : '';
    if (!itemId) throw new BadRequestException(`ingredients[${index}].itemId est requis.`);
    const requiredQuantity = AdminService.readInteger(raw.requiredQuantity, `ingredients[${index}].requiredQuantity`);
    if (requiredQuantity < 1) {
      throw new BadRequestException(`ingredients[${index}].requiredQuantity doit être >= 1.`);
    }
    return { itemId, requiredQuantity };
  }

  private normalizeRecipeResult(entry: unknown, index: number): RecipeResultPatch {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new BadRequestException(`results[${index}] doit être un objet.`);
    }
    const raw = entry as Record<string, unknown>;
    const itemId = typeof raw.itemId === 'string' ? raw.itemId.trim() : '';
    if (!itemId) throw new BadRequestException(`results[${index}].itemId est requis.`);
    const producedQuantity = AdminService.readInteger(raw.producedQuantity, `results[${index}].producedQuantity`);
    if (producedQuantity < 1) {
      throw new BadRequestException(`results[${index}].producedQuantity doit être >= 1.`);
    }
    const chance = AdminService.readNumber(raw.chance, `results[${index}].chance`);
    AdminService.validateSuccessRate(chance, `results[${index}].chance`);
    return { itemId, producedQuantity, chance };
  }

  private async ensureUniqueRecipeItems(entries: Array<{ itemId: string }>, label: string): Promise<void> {
    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.itemId)) {
        throw new BadRequestException(`${label} contient un doublon pour item "${entry.itemId}".`);
      }
      seen.add(entry.itemId);
    }
  }

  private async ensureItemsExist(itemIds: string[], label: string): Promise<void> {
    const uniqueIds = [...new Set(itemIds)];
    if (uniqueIds.length === 0) return;
    const items = await this.itemRepo.find({ where: { id: In(uniqueIds) } });
    const known = new Set(items.map((item) => item.id));
    const missing = uniqueIds.find((id) => !known.has(id));
    if (missing) {
      throw new BadRequestException(`${label} référence l'item "${missing}" introuvable.`);
    }
  }

  async validateCraftingRecipe(recipeId: string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId }, relations: ['ingredients', 'results'] });
    if (!recipe) {
      return { valid: false, errors: [`Recette "${recipeId}" introuvable.`], warnings: [] };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if ((recipe.ingredients ?? []).length === 0) errors.push('La recette n\'a aucun ingrédient.');
    if ((recipe.results ?? []).length === 0) errors.push('La recette n\'a aucun résultat.');

    const sd = await this.masteryDefinitionRepo.findOne({ where: { key: recipe.requiredMasteryKey } });
    if (!sd) errors.push(`Mastery requis "${recipe.requiredMasteryKey}" inexistant dans MasteryDefinition.`);

    for (const ing of recipe.ingredients ?? []) {
      const item = await this.itemRepo.findOne({ where: { id: ing.itemId } });
      if (!item) errors.push(`Ingrédient item "${ing.itemId}" introuvable.`);
    }
    for (const res of recipe.results ?? []) {
      const item = await this.itemRepo.findOne({ where: { id: res.itemId } });
      if (!item) errors.push(`Résultat item "${res.itemId}" introuvable.`);
    }

    if (recipe.minSuccessRate > recipe.maxSuccessRate) {
      errors.push(`minSuccessRate (${recipe.minSuccessRate}) > maxSuccessRate (${recipe.maxSuccessRate}).`);
    }

    if (!recipe.enabled) warnings.push('La recette est désactivée.');
    const recipeStationType = recipe.stationType ?? 'none';
    if (recipeStationType !== 'none') {
      const stationTemplate = await this.stationTemplateRepo.findOne({ where: { stationType: recipeStationType } });
      if (!stationTemplate) {
        errors.push(`stationType "${recipeStationType}" sans CraftingStationTemplate.`);
      } else if (!stationTemplate.enabled) {
        warnings.push(`Le template de station "${stationTemplate.key}" est désactivé.`);
      }
    }
    if (recipe.baseSuccessRate < 0.1) warnings.push(`Taux de succès de base faible (${recipe.baseSuccessRate}).`);
    if (recipe.xpReward === 0) warnings.push('xpReward est 0 — aucune XP accordée pour cette recette.');
    if ((recipe.craftTimeMs ?? 0) < MIN_CRAFT_TIME_MS) errors.push(MIN_CRAFT_TIME_MESSAGE);

    return { valid: errors.length === 0, errors, warnings };
  }

  // ── CraftingStations ─────────────────────────────────────────────────────

  listCraftingStationTemplates(): Promise<CraftingStationTemplate[]> {
    return this.stationTemplateRepo.find({ order: { key: 'ASC' } });
  }

  listCraftingStations(): Promise<CraftingStation[]> {
    return this.stationRepo.find({ relations: ['template'], order: { mapId: 'ASC', worldX: 'ASC', worldY: 'ASC' } });
  }

  async getCraftingStationTemplateWorldObjects(): Promise<CraftingStationTemplateWorldObject[]> {
    const templates = await this.listCraftingStationTemplates();
    return templates.map(toCraftingStationTemplateWorldObject);
  }

  async getCraftingStationWorldObjects(): Promise<CraftingStationWorldObject[]> {
    const stations = await this.listCraftingStations();
    return stations.map(toCraftingStationWorldObject);
  }

  async createCraftingStationTemplate(
    fields: Pick<CraftingStationTemplate, 'key' | 'name' | 'stationType'> &
      Partial<Pick<CraftingStationTemplate, 'category' | 'requiredMasteryKey' | 'interactionRadiusWU' | 'textureKey' | 'enabled'>>,
  ): Promise<CraftingStationTemplate> {
    if (!fields.key || typeof fields.key !== 'string') throw new BadRequestException('key est requis.');
    AdminService.validateSnakeCase(fields.key, 'key');
    if (!fields.name || typeof fields.name !== 'string' || fields.name.trim() === '') {
      throw new BadRequestException('name est requis et non vide.');
    }
    if (!fields.stationType || typeof fields.stationType !== 'string') {
      throw new BadRequestException('stationType est requis.');
    }
    AdminService.validateStationType(fields.stationType);

    const existingKey = await this.stationTemplateRepo.findOne({ where: { key: fields.key } });
    if (existingKey) throw new BadRequestException(`Station template "${fields.key}" existe déjà.`);
    const existingType = await this.stationTemplateRepo.findOne({ where: { stationType: fields.stationType } });
    if (existingType) throw new BadRequestException(`stationType "${fields.stationType}" existe déjà.`);

    if (fields.category !== undefined) AdminService.validateSnakeCase(fields.category, 'category');
    if (fields.requiredMasteryKey !== undefined && fields.requiredMasteryKey !== null && fields.requiredMasteryKey !== '') {
      const sd = await this.masteryDefinitionRepo.findOne({ where: { key: fields.requiredMasteryKey } });
      if (!sd) throw new BadRequestException(`Mastery "${fields.requiredMasteryKey}" inexistant dans MasteryDefinition.`);
    }
    if (fields.interactionRadiusWU !== undefined) {
      AdminService.validateInteractionRadiusWU(fields.interactionRadiusWU);
    }

    return this.stationTemplateRepo.save(this.stationTemplateRepo.create({
      key: fields.key,
      name: fields.name.trim(),
      stationType: fields.stationType,
      category: fields.category ?? 'crafting',
      requiredMasteryKey: fields.requiredMasteryKey === '' ? null : fields.requiredMasteryKey ?? null,
      interactionRadiusWU: fields.interactionRadiusWU ?? 1536,
      textureKey: fields.textureKey === '' ? null : fields.textureKey ?? null,
      enabled: fields.enabled ?? true,
    }));
  }

  async updateCraftingStationTemplate(
    id: string,
    fields: Partial<Pick<CraftingStationTemplate, 'name' | 'stationType' | 'category' | 'requiredMasteryKey' | 'interactionRadiusWU' | 'textureKey' | 'enabled'>>,
  ): Promise<CraftingStationTemplate | null> {
    const template = await this.stationTemplateRepo.findOne({ where: { id } });
    if (!template) return null;

    if (fields.name !== undefined) {
      if (typeof fields.name !== 'string' || fields.name.trim() === '') throw new BadRequestException('name ne peut pas être vide.');
      template.name = fields.name.trim();
    }
    if (fields.stationType !== undefined) {
      AdminService.validateStationType(fields.stationType);
      const existing = await this.stationTemplateRepo.findOne({ where: { stationType: fields.stationType } });
      if (existing && existing.id !== id) throw new BadRequestException(`stationType "${fields.stationType}" existe déjà.`);
      template.stationType = fields.stationType;
    }
    if (fields.category !== undefined) {
      AdminService.validateSnakeCase(fields.category, 'category');
      template.category = fields.category;
    }
    if ('requiredMasteryKey' in fields) {
      const masteryKey = fields.requiredMasteryKey;
      if (masteryKey === null || masteryKey === '') {
        template.requiredMasteryKey = null;
      } else {
        const sd = await this.masteryDefinitionRepo.findOne({ where: { key: masteryKey } });
        if (!sd) throw new BadRequestException(`Mastery "${masteryKey}" inexistant dans MasteryDefinition.`);
        template.requiredMasteryKey = masteryKey!;
      }
    }
    if (fields.interactionRadiusWU !== undefined) {
      AdminService.validateInteractionRadiusWU(fields.interactionRadiusWU);
      template.interactionRadiusWU = fields.interactionRadiusWU;
    }
    if ('textureKey' in fields) {
      template.textureKey = fields.textureKey === '' ? null : fields.textureKey ?? null;
    }
    if (fields.enabled !== undefined) template.enabled = Boolean(fields.enabled);

    return this.stationTemplateRepo.save(template);
  }

  async createCraftingStation(templateId: string, worldX: number, worldY: number, mapId = DEFAULT_MAP_ID): Promise<CraftingStation> {
    const template = await this.stationTemplateRepo.findOne({ where: { id: templateId } });
    if (!template) throw new BadRequestException(`Station template "${templateId}" introuvable.`);

    const targetWorldX = Math.round(worldX);
    const targetWorldY = Math.round(worldY);
    const targetMapId = Math.round(mapId);
    if (!Number.isFinite(targetWorldX) || !Number.isFinite(targetWorldY) || !Number.isFinite(targetMapId)) {
      throw new BadRequestException('Coordonnées station invalides : mapId, worldX et worldY doivent être finis.');
    }

    const station = this.stationRepo.create({
      templateId: template.id,
      template,
      mapId: targetMapId,
      worldX: targetWorldX,
      worldY: targetWorldY,
      enabled: true,
    });
    return this.stationRepo.save(station);
  }

  async updateCraftingStation(
    id: string,
    fields: Partial<Pick<CraftingStation, 'worldX' | 'worldY' | 'mapId' | 'enabled'>>,
  ): Promise<CraftingStation | null> {
    const station = await this.stationRepo.findOne({ where: { id }, relations: ['template'] });
    if (!station) return null;

    if (fields.worldX !== undefined) {
      const n = Math.round(fields.worldX);
      if (!Number.isFinite(n)) throw new BadRequestException('worldX doit être fini.');
      station.worldX = n;
    }
    if (fields.worldY !== undefined) {
      const n = Math.round(fields.worldY);
      if (!Number.isFinite(n)) throw new BadRequestException('worldY doit être fini.');
      station.worldY = n;
    }
    if (fields.mapId !== undefined) {
      const n = Math.round(fields.mapId);
      if (!Number.isFinite(n)) throw new BadRequestException('mapId doit être fini.');
      station.mapId = n;
    }
    if (fields.enabled !== undefined) station.enabled = Boolean(fields.enabled);

    return this.stationRepo.save(station);
  }

  async deleteCraftingStation(id: string): Promise<CraftingStation | null> {
    const station = await this.stationRepo.findOne({ where: { id }, relations: ['template'] });
    if (!station) return null;
    await this.stationRepo.delete(id);
    return station;
  }

  // ── Vue d'ensemble ────────────────────────────────────────────────────────

  async getOverview(): Promise<{
    templates: number;
    spawns: number;
    activeCreatures: number;
    connectedPlayers: number;
    registeredCharacters: number;
  }> {
    const [templates, spawns, activeCreatures, registeredCharacters] = await Promise.all([
      this.templateRepo.count(),
      this.spawnRepo.count(),
      this.creatureRepo.count({ where: { state: Not('dead') } }),
      this.characterRepo.count(),
    ]);
    const connectedPlayers = this.worldService.getConnectedCount();
    return { templates, spawns, activeCreatures, connectedPlayers, registeredCharacters };
  }
}
