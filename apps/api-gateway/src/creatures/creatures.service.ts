import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Server } from 'socket.io';
import { Creature } from './entities/creature.entity';
import { CreatureTemplate } from './entities/creature-template.entity';
import { CreatureSpawn } from './entities/creature-spawn.entity';
import { Character } from '../characters/entities/character.entity';
import { CharacterStatsCalculator, DerivedStats } from '../characters/character-stats-calculator';
import {
  MAGIC_RESISTANCE_GLOBAL_STAT,
  magicResistanceReaderFromStats,
  magicResistanceStatForSchool,
  resolveEffectiveMagicResistance,
} from '../derived-stats/magic-resistance';
import { MagicSchool } from '../active-skills/active-skills.constants';
import { aggregateEquipmentBonuses, aggregateEquipmentDerivedModifiers, mergeDerivedStatModifiers } from '../characters/equipment-stats.helper';
import {
  resolveEffectiveAttackRangeWU,
  resolveMeleeWeaponReachWU,
  MELEE_RANGE_WU,
} from '../characters/attack-range.helper';
import { resolveEquippedWeaponType } from '../characters/equipped-weapon.helper';
import { DamageType } from './combat-damage.calculator';
import { resolveCombatHit, CombatHitAttacker } from './combat-hit.resolver';
import { isAttackParryable } from './combat-parryability.helper';
import { CreatureTemplateSkill } from './entities/creature-template-skill.entity';
import { SkillDefinition } from '../active-skills/entities/skill-definition.entity';
import { calculateSkillEffect } from '../active-skills/calculators/skill-effect.calculator';
import { resolveEffectiveCanBeDodged, resolveEffectiveCanCrit, SkillAttackDefenseKind, SkillEffectType } from '../active-skills/active-skills.constants';
import { makeCombatEvent, COMBAT_EVENT } from './combat-event';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { EquipmentSlot } from '../characters/dto/equip-item.dto';
import { CreatureDto, CreatureRuntimeStats, CreatureRuntimeCombatDto, CreatureMaxHealthTraceDto } from './dto/creature.dto';
import { WorldService, ConnectedPlayer } from '../world/world.service';
import { ProgressionService, ProgressionSource, CharacterXpResult } from '../progression/progression.service';
import { MasteriesService, MasteryUpdatePayload } from '../masteries/masteries.service';
import { MasteryEffectsService } from '../masteries/mastery-effects.service';
import { calculateMasteryXp } from '../mastery-xp-calculator/mastery-xp-calculator';
import { MasteryDomain, MasteryXpContext } from '../mastery-xp-calculator/mastery-xp-context';
import { isoScreenToWorldWU, chebyshevDistanceWU, DEFAULT_MAP_ID } from '../common/world-coordinates';
import { getMapRoomId } from '../common/socket-rooms';
import { legacyRadiusToWU } from '../common/legacy-pixel-position.adapter';
import { LootService, LootEntry } from '../world/loot.service';
import { CreatureRuntimeCalculator, CREATURE_DERIVED_BASE, CREATURE_STAT_KEYS, CreatureStatKey } from '../creature-runtime/creature-runtime.calculator';
import { CreatureSecondaryCoefficientsService } from '../creature-config/creature-secondary-coefficients.service';
import { CreatureTemplateOverridesService } from '../creature-config/creature-template-overrides.service';
import {
  buildGlobalCombatCoefficientMaps,
  CREATURE_COMBAT_DERIVED_KEYS,
  CREATURE_SCALAR_PARAM_KEYS,
  CoefficientMap,
  CoefficientSource,
  effectiveCoefficientMap,
  effectiveScalar,
  globalScalarValue,
  sumPrimaryContributions,
} from '../creature-config/creature-template-overrides.constants';
import { TemplateConfigurationInput } from '../creature-config/creature-template-overrides.service';
import { MAGIC_RESISTANCE_STAT_KEYS } from '../derived-stats/magic-resistance';
import { PRIMARY_STAT_KEYS } from '../derived-stats/derived-stats.constants';
import {
  CoefficientEntryDto,
  CreatureDerivedConfigurationDto,
  CreatureRuntimeSnapshotDto,
  DerivedStatConfigEntryDto,
  DerivedStatTraceDto,
  ScalarParamConfigEntryDto,
} from './dto/creature-derived-configuration.dto';
import { RuntimeComputeEngine } from '../player-runtime/runtime-compute';
import { StatResolutionResult } from '../player-runtime/player-runtime.types';
import { RuntimeDebugRegistry } from '../player-runtime/debug-modifier.registry';
import { CreatureCombatStats, CreatureDerivedStats } from '../creature-runtime/creature-runtime.types';
import { DerivedStatsService } from '../derived-stats/derived-stats.service';

// Portée mêlée par défaut en WU (distance Chebyshev) — source unique dans le
// helper partagé avec la projection /characters/me. Encore utilisée ici pour
// les décisions IA (poursuite, riposte).
const ATTACK_COOLDOWN_MS = 700;
const AUTO_ATTACK_COOLDOWN_MS = 1500;
const PATROL_TICK_MS = 200;
const PATROL_MOVE_MIN_MS = 1000;
const PATROL_MOVE_MAX_MS = 4000;
const LEASH_MULTIPLIER = 2;
const ESCAPE_RADIUS_MULTIPLIER = 2;

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function findNearestPlayer(
  players: ConnectedPlayer[],
  creature: Creature,
): { player: ConnectedPlayer; dist: number } | null {
  if (creature.worldX == null || creature.worldY == null) return null;
  const creaturePos = { worldX: creature.worldX, worldY: creature.worldY };
  let nearest: ConnectedPlayer | null = null;
  let minDist = Infinity;
  for (const p of players) {
    if (creature.mapId != null && p.mapId !== creature.mapId) continue;
    const d = chebyshevDistanceWU({ worldX: p.worldX, worldY: p.worldY }, creaturePos);
    if (d < minDist) { minDist = d; nearest = p; }
  }
  return nearest ? { player: nearest, dist: minDist } : null;
}


/**
 * Capacité combat d'une créature résolue (V5-B / V5-D1-A) : association + skill
 * enabled, tout `effectType` (damage OU heal). Sert l'affichage runtime ; le cast
 * combat filtre lui-même `effectType === 'damage'` (le heal n'est pas encore casté).
 */
type ResolvedCreatureAbility = {
  skillKey: string;
  skillName: string;
  effectType: SkillEffectType;
  displayOrder: number;
  rangeWU: number;
  cooldownMs: number;
  damageType: DamageType;
  /** École magique (ADR-0022) — non nulle seulement pour un skill `magic`. */
  magicSchool: MagicSchool | null;
  /** Critiquable (règle canonique) — pertinent seulement pour dégâts physiques. */
  canCrit: boolean;
  /** Flags défensifs SERVEUR du skill — décident si le joueur défenseur peut
   * esquiver/bloquer/parer ce skill créature. Défauts : dodge/block true, parade false. */
  canBeDodged: boolean;
  canBeBlocked: boolean;
  canBeParried: boolean;
  scaling: Record<string, unknown>;
};

type PatrolState = {
  dirX: number;
  dirY: number;
  speed: number;
  moveUntil: number;
  pauseUntil: number;
  targetCharacterId?: string;
};

/**
 * V6-B7 : contre-attaque CRÉATURE → joueur, déclenchée quand la créature PARE une
 * attaque joueur (auto-attaque : V6-B7 Lot 1 ; skill : Lot 3). Le joueur ne peut
 * PAS parer cette contre-attaque (`canParry: false`) → aucune chaîne récursive.
 * `isCounterAttack` toujours true. Calculée/appliquée serveur ; émission gateway.
 */
export type CreatureCounterAttack = {
  amount: number;
  currentHealth: number;
  maxHealth: number;
  killed: boolean;
  isCritical: boolean;
  isDodged: boolean;
  isBlocked: boolean;
  isParried: boolean;
  blockedDamage: number;
  isCounterAttack: true;
};

export type AttackSuccess = {
  success: true;
  dto: CreatureDto;
  damage: number;
  attackerId: string;
  /** V4-E : true si ce hit est un coup critique (info serveur fiable). */
  isCritical: boolean;
  /** V4-E : true si ce hit a tué la créature (PV tombés à 0). */
  killed: boolean;
  /**
   * V4-F : true si la créature a esquivé le hit joueur. Toujours false
   * aujourd'hui (les créatures n'ont pas de `dodgeChance`) — plomberie prête.
   */
  isDodged: boolean;
  /**
   * V4-H : true si le défenseur a bloqué le hit. Toujours false pour un hit
   * joueur → créature (les créatures n'ont pas de `blockChance`) — plomberie prête.
   */
  isBlocked: boolean;
  /** V4-H : dégâts absorbés par le blocage (0 si non bloqué). */
  blockedDamage: number;
  /**
   * V6-B6 : true si la créature a PARÉ le hit joueur (parade résolue en premier,
   * dégâts 0, ni esquive ni blocage). false tant que la créature ne pare pas.
   */
  isParried: boolean;
  riposte?: {
    damage: number;
    characterHealth: number;
    isDodged: boolean;
    isBlocked: boolean;
    blockedDamage: number;
    /** V4-I : true si le joueur a PARÉ la riposte (0 dégât entrant + contre-attaque). */
    isParried: boolean;
  };
  /**
   * V4-I : contre-attaque déclenchée par une parade réussie de la riposte
   * (joueur → créature). Absente si aucune parade. `damage` déjà mitigé par
   * l'armure de la créature ; `killed` = la contre-attaque a tué la créature.
   */
  counterAttack?: {
    damage: number;
    creatureHealth: number;
    killed: boolean;
    isCritical: boolean;
  };
  /**
   * V6-B7 : contre-attaque CRÉATURE → joueur déclenchée quand la créature PARE le
   * hit principal joueur (auto-attaque). Remplace la riposte de ce tour. Absente si
   * pas de parade ou `counterAttackPower <= 0`.
   */
  creatureCounterAttack?: CreatureCounterAttack;
  loot?: LootEntry[];
  characterXpUpdate?: CharacterXpResult;
  masteryUpdate?: MasteryUpdatePayload;
};
export type AttackFailure = { success: false; error: string };
export type AttackResult = AttackSuccess | AttackFailure;

export function isAttackFailure(result: AttackResult): result is AttackFailure {
  return result.success === false;
}

/**
 * Résolution weaponType → masteryDefinitionKey (Phase 2b : two_handed, bow, crossbow).
 * Seules les armes avec un weaponType référencé ici génèrent de l'XP mastery.
 *
 * Temporaire : cette table est destinée à migrer vers une config Studio
 * (champ weaponType sur ItemTemplate + table de correspondance MasteryDefinition).
 * Ne pas ajouter de nouveaux types ici sans ADR ou note de dette.
 */
const COMBAT_WEAPON_MASTERY_MAP: Record<string, string> = {
  two_handed_sword: 'two_handed',
  two_handed_axe: 'two_handed',
  bow: 'bow',
  crossbow: 'crossbow',
};

@Injectable()
export class CreaturesService implements OnModuleInit {
  private readonly logger = new Logger(CreaturesService.name);
  private readonly lastAttackAt = new Map<string, number>();
  private readonly lastCreatureAutoAttackAt = new Map<string, number>();
  private readonly liveCreatures = new Map<string, Creature>();
  private readonly patrolStates = new Map<string, PatrolState>();
  private server: Server | null = null;

  // V5-B : cooldown de capacité par créature puis par skillKey (epoch ms du dernier cast).
  private readonly creatureSkillCooldowns = new Map<string, Map<string, number>>();
  // V5-B/V5-D1-A : cache des capacités combat résolues (damage + heal) par
  // templateKey (config, pas d'état live), invalidé après édition Studio
  // (admin PUT → invalidateAbilitiesCache). NE contient JAMAIS les cooldowns live.
  private readonly combatAbilityCache = new Map<string, ResolvedCreatureAbility[]>();
  // Lot 2 fix : snapshot des PV max EFFECTIFS par templateKey (ADR-0021). Les
  // sources du PV max (`baseHealth`, `vitality`, coefficient `maxHealthPerVitality`)
  // sont STRICTEMENT communes à toutes les instances d'un template (les debug
  // modifiers ne sont PAS branchés sur le PV max — voir `resolveMaxHealth`).
  // La granularité par template étend le mécanisme existant `combatAbilityCache`.
  // Évite de reconstruire le pipeline `resolveStat` à chaque tick IA / DTO / hit.
  // Invalidé sur édition de template (`refreshTemplateInMemory` / `invalidateAbilitiesCache`)
  // et sur changement du coefficient (`recalculateAllMaxHealthAfterCoefficientChange`).
  //
  // Lot 3 : le snapshot conserve le RÉSULTAT COMPLET (`StatResolutionResult`) et non
  // la seule valeur finale — valeur autoritaire ET trace explicative (Studio) restent
  // ainsi COHÉRENTES et sont invalidées ENSEMBLE. Les consommateurs runtime lisent
  // uniquement `.finalValue` ; seul le Studio lit la trace.
  private readonly maxHealthByTemplateKey = new Map<string, StatResolutionResult>();

  constructor(
    @InjectRepository(Creature)
    private readonly creatureRepository: Repository<Creature>,
    @InjectRepository(CreatureTemplate)
    private readonly templateRepository: Repository<CreatureTemplate>,
    @InjectRepository(CreatureSpawn)
    private readonly spawnRepository: Repository<CreatureSpawn>,
    @InjectRepository(CreatureTemplateSkill)
    private readonly creatureTemplateSkillRepository: Repository<CreatureTemplateSkill>,
    @InjectRepository(SkillDefinition)
    private readonly skillDefinitionRepository: Repository<SkillDefinition>,
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
    private readonly worldService: WorldService,
    private readonly progression: ProgressionService,
    private readonly masteriesService: MasteriesService,
    private readonly masteryEffects: MasteryEffectsService,
    private readonly dataSource: DataSource,
    private readonly debugRegistry: RuntimeDebugRegistry,
    private readonly loot: LootService,
    private readonly derivedStats: DerivedStatsService,
    private readonly creatureSecondaryCoefficients: CreatureSecondaryCoefficientsService,
    private readonly templateOverrides: CreatureTemplateOverridesService,
  ) {}

  async onModuleInit() {
    // ADR-0021 sous-lot backend : invalider le memo PV max du SEUL template
    // concerné quand ses overrides changent (les autres templates intacts).
    this.templateOverrides.onChange((templateId) => {
      void this.invalidateMaxHealthForTemplateId(templateId);
    });
    await this.seedTemplates();
    await this.seedSpawns();
    await this.seedInstances();
    await this.creatureRepository
      .createQueryBuilder()
      .delete()
      .where('spawn_id IS NULL')
      .execute();

    // Réinitialiser les états comportementaux non-persistants au redémarrage
    await this.creatureRepository
      .createQueryBuilder()
      .update()
      .set({ state: 'alive' })
      .where("state IN ('fighting', 'escaping')")
      .execute();

    const now = Date.now();
    const creatures = await this.creatureRepository.find();
    for (const a of creatures) {
      if (!a.spawn) continue;
      if (a.state === 'dead') {
        if (a.respawnAt && a.respawnAt.getTime() > now) {
          // Timer encore en cours — replanifier pour le temps restant
          this.liveCreatures.set(a.id, a);
          const remaining = a.respawnAt.getTime() - now;
          setTimeout(() => this.respawnCreature(a.id), remaining);
        } else {
          // Timer expiré ou absent — respawn immédiat
          a.state = 'alive';
          a.health = this.resolveCreatureMaxHealth(a.spawn.template);
          a.respawnAt = null;
          if (a.spawn.worldX == null || a.spawn.worldY == null || a.spawn.mapId == null) continue;
          a.worldX = a.spawn.worldX;
          a.worldY = a.spawn.worldY;
          a.mapId = a.spawn.mapId;
          await this.creatureRepository.save(a);
          this.liveCreatures.set(a.id, a);
        }
      } else {
        // Lot 2 : au redémarrage, clamp des PV persistés si le PV max effectif a
        // DIMINUÉ hors ligne (baseHealth/Vitalité/coefficient modifiés). Hausse →
        // PV inchangés (pas de soin). Persisté uniquement si corrigé.
        const maxHealth = this.resolveCreatureMaxHealth(a.spawn.template);
        if (a.health > maxHealth) {
          a.health = maxHealth;
          await this.creatureRepository.save(a);
        }
        this.liveCreatures.set(a.id, a);
      }
    }
  }

  private resolveEffectiveSpeed(creature: Creature, template: CreatureTemplate): number {
    const base = CreatureRuntimeCalculator.calculateBaseStats(creature, template);
    const debugMods = this.debugRegistry.getModifiers(creature.id);
    const derived = RuntimeComputeEngine.compute<CreatureDerivedStats>(
      CREATURE_STAT_KEYS,
      (stat) => CREATURE_DERIVED_BASE[stat as CreatureStatKey](base),
      debugMods,
    );
    return Math.max(derived.speed, 0);
  }

  private toDto(creature: Creature): CreatureDto {
    const t = creature.spawn.template;
    // Lot 2 : PV max EFFECTIF autoritaire (base + Vitalité, cap 1, floor). Une
    // seule valeur exposée : `maxHealth` DTO ET `runtimeStats.maxHp` la portent.
    const maxHealthValue = this.resolveCreatureMaxHealth(t);
    let runtimeStats: CreatureRuntimeStats | undefined;
    if (t) {
      const base = CreatureRuntimeCalculator.calculateBaseStats(creature, t);
      const debugMods = this.debugRegistry.getModifiers(creature.id);
      runtimeStats = RuntimeComputeEngine.compute<CreatureDerivedStats>(
        CREATURE_STAT_KEYS,
        (stat) => CREATURE_DERIVED_BASE[stat as CreatureStatKey](base),
        debugMods,
      );
      // `maxHp` runtime aligné sur le PV max effectif serveur (jamais recalculé
      // par le client). attackPower/defenseTotal/etc. restent inchangés.
      runtimeStats.maxHp = maxHealthValue;
    }
    return {
      id: creature.id,
      templateKey: t.key,
      type: t.textureKey,
      textureKey: t.textureKey,
      name: t.name,
      worldX: creature.worldX ?? null,
      worldY: creature.worldY ?? null,
      mapId: creature.mapId ?? null,
      health: creature.health,
      maxHealth: maxHealthValue,
      armor: t.baseArmor,
      attack: t.baseAttack,
      state: creature.state,
      respawnAt: creature.respawnAt ?? null,
      runtimeStats,
    };
  }

  findAll(): CreatureDto[] {
    return Array.from(this.liveCreatures.values()).map((c) => this.toDto(c));
  }

  /**
   * Inspection combat runtime d'une créature vivante (Studio DevTools, lecture
   * seule). Lit l'état live en mémoire (`liveCreatures`, `patrolStates`,
   * `lastCreatureAutoAttackAt`) + le template. Retourne null si l'id n'est pas
   * une créature vivante connue. Aucune mutation, aucun recalcul délégué au client.
   */
  async getRuntimeCombatInfo(id: string): Promise<CreatureRuntimeCombatDto | null> {
    const creature = this.liveCreatures.get(id);
    if (!creature) return null;
    const t = creature.spawn?.template;
    if (!t) return null;

    // Stats effectives — point unique (V6-A Lot 2). Mêmes valeurs qu'avant.
    const stats = this.creatureCombatStats(creature, t);
    // Lot 3 : trace du calcul du PV max (MÊME snapshot que la valeur autoritaire).
    const maxHealthTrace = this.buildMaxHealthTrace(t);

    const lastAtk = this.lastCreatureAutoAttackAt.get(id) ?? null;

    // V5-C1 : capacités damage configurées + cooldown LIVE (lecture seule).
    // Croise la config (getCombatAbilities, caché) et le runtime
    // (creatureSkillCooldowns). Aucune mutation, ne déclenche aucun cast.
    const now = Date.now();
    const cooldowns = this.creatureSkillCooldowns.get(id);
    // V5-D1-A : damage + heal (le cast heal viendra en V5-D1-B ; ici affichage seul).
    const combatAbilities = await this.getCombatAbilities(t.id, t.key);
    const abilities = combatAbilities.map((a) => {
      const lastCastAt = cooldowns?.get(a.skillKey) ?? null;
      const nextCastAt = lastCastAt != null ? lastCastAt + a.cooldownMs : null;
      const cooldownRemainingMs = nextCastAt != null ? Math.max(0, nextCastAt - now) : 0;
      return {
        skillKey: a.skillKey,
        skillName: a.skillName,
        effectType: a.effectType,
        rangeWU: a.rangeWU,
        cooldownMs: a.cooldownMs,
        lastCastAt,
        nextCastAt,
        cooldownRemainingMs,
        onCooldown: cooldownRemainingMs > 0,
      };
    });

    const lootPool = t.lootPool as unknown;
    const lootPoolSize = Array.isArray(lootPool)
      ? lootPool.length
      : lootPool && typeof lootPool === 'object'
        ? Object.keys(lootPool as Record<string, unknown>).length
        : 0;

    return {
      id: creature.id,
      templateKey: t.key,
      name: t.name,
      state: creature.state,
      currentTargetId: this.patrolStates.get(id)?.targetCharacterId ?? null,
      worldX: creature.worldX ?? null,
      worldY: creature.worldY ?? null,
      mapId: creature.mapId ?? null,
      currentHealth: creature.health,
      // Lot 2 : PV max effectif (résolu), jamais `baseHealth` brut.
      maxHealth: stats.maxHealth,
      defenseTotal: stats.defenseTotal,
      baseArmor: t.baseArmor,
      alive: creature.state !== 'dead',
      respawnAt: creature.respawnAt ?? null,
      baseAttack: t.baseAttack,
      attackPower: stats.attackPower,
      // Portée réellement utilisée par la créature en combat (auto-attaque/riposte).
      attackRangeWU: MELEE_RANGE_WU,
      autoAttackCooldownMs: AUTO_ATTACK_COOLDOWN_MS,
      lastAutoAttackAt: lastAtk,
      nextAutoAttackAt: lastAtk != null ? lastAtk + AUTO_ATTACK_COOLDOWN_MS : null,
      // Les créatures n'ont pas encore de stats défensives dédiées (runtime).
      canDodge: stats.canDodge,
      canBlock: stats.canBlock,
      canParry: stats.canParry,
      // V5-D2-A : stats de combat avancées (lecture seule). healingPower expose
      // la valeur effective (fallback attackPower si non configurée, cohérent avec
      // le cast heal). Les 4 autres sont la config brute du template.
      healingPower: stats.healingPowerEffective,
      criticalChance: stats.criticalChance,
      criticalDamage: stats.criticalDamage,
      accuracy: stats.accuracy,
      armorPenetrationPercent: stats.armorPenetrationPercent,
      // V6-B1 : primaires informatives (valeurs brutes du template ; aucun effet combat).
      primaryStats: {
        strength: t.strength,
        vitality: t.vitality,
        endurance: t.endurance,
        agility: t.agility,
        dexterity: t.dexterity,
        intelligence: t.intelligence,
        wisdom: t.wisdom,
        spirit: t.spirit,
        willpower: t.willpower,
        charisma: t.charisma,
      },
      // V6-B2 : secondaires CALCULÉES depuis les primaires (informatif). Dérivées
      // serveur mais NON actives en défense (canDodge/canBlock/canParry false).
      // Lot 2 : `maxHealthDerived` est désormais un ALIAS de `maxHealth` (même
      // valeur autoritaire) — plus une seconde notion concurrente.
      derivedSecondaryStats: {
        dodgeChance: stats.dodgeChance,
        blockChance: stats.blockChance,
        blockReductionPercent: stats.blockReductionPercent,
        parryChance: stats.parryChance,
        counterAttackPower: stats.counterAttackPower,
        maxHealthDerived: stats.maxHealthDerived,
      },
      maxHealthTrace,
      killCharacterXpReward: t.killCharacterXpReward,
      hasLootPool: lootPoolSize > 0,
      lootPoolSize,
      abilities,
    };
  }

  /**
   * Stats de combat effectives d'une créature (V6-A Lot 2) — wrapper qui injecte
   * les debug modifiers courants dans le helper PUR `resolveCombatStats`. Point
   * unique réutilisable par les consommateurs (branché ici uniquement sur
   * `getRuntimeCombatInfo` ; les chemins combat suivront en Lot 2B).
   */
  /**
   * Résistance magique EFFECTIVE d'une créature pour une école (ADR-0022 —
   * mitigation magique). Résolue À LA DEMANDE via le pipeline générique
   * (`computeDerivedFromDefinitions` sur les primaires du template + définitions
   * dérivées serveur) — aucun champ runtime dupliqué, aucun cache dédié (les
   * résistances ne sont pas encore lues à chaque tick). Réutilise l'unique
   * resolver (`resolveEffectiveMagicResistance`) : `global + école`, sans clamp.
   * Les futures sources (équipement/buffs créature) s'y intégreront sans changer
   * ce chemin.
   */
  private async resolveCreatureEffectiveMagicResistance(
    template: CreatureTemplate,
    school: MagicSchool,
  ): Promise<number> {
    const definitions = await this.derivedStats.getDefinitions();
    const overrides = this.templateOverrides.getOverrides(template.id);
    const primaries: Record<string, number> = {
      strength: template.strength ?? 0,
      vitality: template.vitality ?? 0,
      endurance: template.endurance ?? 0,
      agility: template.agility ?? 0,
      dexterity: template.dexterity ?? 0,
      intelligence: template.intelligence ?? 0,
      wisdom: template.wisdom ?? 0,
      spirit: template.spirit ?? 0,
      willpower: template.willpower ?? 0,
      charisma: template.charisma ?? 0,
    };
    // Résout global + école avec la map EFFECTIVE (override template si présent,
    // sinon coefficients du catalogue). Sans override → identique à l'historique
    // (`computeDerivedFromDefinitions` : base + Σ coef×primaire, sans clamp).
    const resistanceStats: Record<string, number> = {};
    for (const key of [MAGIC_RESISTANCE_GLOBAL_STAT, magicResistanceStatForSchool(school)]) {
      const def = definitions.find((d) => d.key === key);
      const fallbackMap = (def?.primaryCoefficients ?? {}) as Record<string, number>;
      const { map } = effectiveCoefficientMap(overrides, key, fallbackMap, 'catalog');
      resistanceStats[key] = (def?.baseValue ?? 0) + sumPrimaryContributions(map, primaries);
    }
    return resolveEffectiveMagicResistance(
      school,
      magicResistanceReaderFromStats(resistanceStats),
    ).effectiveResistance;
  }

  // ── Studio : configuration des coefficients dérivés par template ────────────

  /** Clés dérivées configurables par template (combat + PV max + résistances). */
  private configurableDerivedKeys(): string[] {
    return [...CREATURE_COMBAT_DERIVED_KEYS, 'maxHealth', ...MAGIC_RESISTANCE_STAT_KEYS];
  }

  /** Valeurs des 10 primaires du template (défaut 0), indexables par clé. */
  private templatePrimaryRecord(template: CreatureTemplate): Record<string, number> {
    const t = template as unknown as Record<string, number>;
    const out: Record<string, number> = {};
    for (const k of PRIMARY_STAT_KEYS) out[k] = t[k] ?? 0;
    return out;
  }

  /** Base + fallback + métadonnées catalogue d'une dérivée (pour config/trace). */
  private derivedStatBaseInfo(
    template: CreatureTemplate,
    key: string,
    globalMaps: Record<string, CoefficientMap>,
    defByKey: Map<string, { baseValue?: number; primaryCoefficients?: Record<string, number>; label?: string; category?: string }>,
  ): {
    baseValue: number;
    baseSource: string | null;
    fallbackMap: CoefficientMap;
    fallbackSource: CoefficientSource;
    label: string | null;
    category: string | null;
  } {
    const def = defByKey.get(key);
    const label = def?.label ?? null;
    const category = def?.category ?? null;
    // Résistances (et toute clé hors combat/maxHealth) → catalogue.
    if (!(key in globalMaps)) {
      return {
        baseValue: def?.baseValue ?? 0,
        baseSource: 'catalog',
        fallbackMap: (def?.primaryCoefficients ?? {}) as CoefficientMap,
        fallbackSource: 'catalog',
        label,
        category,
      };
    }
    // Combat + maxHealth → fallback singleton global.
    let baseValue = 0;
    let baseSource: string | null = null;
    switch (key) {
      case 'physicalAttack': baseValue = template.baseAttack; baseSource = 'baseAttack'; break;
      case 'defense': baseValue = template.baseArmor; baseSource = 'baseArmor'; break;
      case 'accuracy': baseValue = template.accuracy ?? 0; baseSource = 'accuracy'; break;
      case 'maxHealth': baseValue = template.baseHealth; baseSource = 'baseHealth'; break;
      default: baseValue = 0; baseSource = null; break; // dodge/block/parry/counter
    }
    return { baseValue, baseSource, fallbackMap: globalMaps[key], fallbackSource: 'global', label, category };
  }

  private mapToEntries(map: CoefficientMap): CoefficientEntryDto[] {
    return Object.entries(map).map(([primaryStatKey, coefficient]) => ({ primaryStatKey, coefficient }));
  }

  /**
   * Lecture de la configuration dérivée d'un template (GET Studio). Renvoie pour
   * chaque dérivée : état d'override (none/coefficients/empty), coefficients
   * explicites, coefficients effectifs, provenance, base ; + scalaires + catalogue.
   * Aucun calcul client requis. `null` si le template est inconnu.
   */
  async getTemplateDerivedConfiguration(
    templateKey: string,
  ): Promise<CreatureDerivedConfigurationDto | null> {
    const template = await this.templateRepository.findOne({ where: { key: templateKey } });
    if (!template) return null;

    const overrides = this.templateOverrides.getOverrides(template.id);
    const globalCoeffs = this.creatureSecondaryCoefficients.getCoefficients();
    const globalMaps = buildGlobalCombatCoefficientMaps(globalCoeffs);
    const definitions = await this.derivedStats.getDefinitions();
    const defByKey = new Map(definitions.map((d) => [d.key, d as unknown as { baseValue?: number; primaryCoefficients?: Record<string, number>; label?: string; category?: string }]));

    const derivedStats: DerivedStatConfigEntryDto[] = this.configurableDerivedKeys().map((key) => {
      const info = this.derivedStatBaseInfo(template, key, globalMaps, defByKey);
      const hasOverride = Object.prototype.hasOwnProperty.call(overrides.derivedCoefficients, key);
      const explicitMap = hasOverride ? overrides.derivedCoefficients[key] : null;
      const overrideState = !hasOverride
        ? 'none'
        : Object.keys(explicitMap as CoefficientMap).length === 0
          ? 'empty'
          : 'coefficients';
      const { map, source } = effectiveCoefficientMap(overrides, key, info.fallbackMap, info.fallbackSource);
      return {
        derivedStatKey: key,
        overrideState,
        explicitCoefficients: explicitMap ? this.mapToEntries(explicitMap) : null,
        effectiveCoefficients: this.mapToEntries(map),
        source,
        baseSource: info.baseSource,
        label: info.label,
        category: info.category,
      };
    });

    const scalarParams: ScalarParamConfigEntryDto[] = CREATURE_SCALAR_PARAM_KEYS.map((key) => {
      const hasOverride = Object.prototype.hasOwnProperty.call(overrides.scalarParams, key);
      const explicitValue = hasOverride ? overrides.scalarParams[key] : null;
      const { value, source } = effectiveScalar(overrides, key, globalScalarValue(globalCoeffs, key));
      // effectiveScalar ne renvoie que 'template' | 'global' (jamais 'catalog').
      return { scalarParamKey: key, explicitValue, effectiveValue: value, source: source as 'template' | 'global' };
    });

    return {
      templateId: template.id,
      templateKey: template.key,
      derivedStats,
      scalarParams,
      catalog: {
        primaryStatKeys: [...PRIMARY_STAT_KEYS],
        scalarParamKeys: [...CREATURE_SCALAR_PARAM_KEYS],
        derivedStatKeys: this.configurableDerivedKeys(),
      },
    };
  }

  /**
   * Sauvegarde ATOMIQUE (PUT Studio) : remplacement complet des overrides du
   * template. Valide l'existence du template + restreint aux clés configurables
   * créature, puis délègue à `replaceTemplateConfiguration` (transaction unique,
   * cache/notification après commit). `null` si le template est inconnu.
   */
  async saveTemplateDerivedConfiguration(
    templateKey: string,
    input: TemplateConfigurationInput,
  ): Promise<CreatureDerivedConfigurationDto | null> {
    const template = await this.templateRepository.findOne({ where: { key: templateKey } });
    if (!template) return null;

    const configurable = new Set(this.configurableDerivedKeys());
    for (const d of input.derivedOverrides) {
      if (!configurable.has(d.derivedStatKey)) {
        throw new BadRequestException(
          `derivedStatKey non configurable pour une créature: ${d.derivedStatKey}`,
        );
      }
    }
    await this.templateOverrides.replaceTemplateConfiguration(template.id, input);
    return this.getTemplateDerivedConfiguration(templateKey);
  }

  /**
   * Snapshot runtime d'une instance vivante (GET Studio) : primaires + dérivées
   * finales (resolvers autoritaires, override-aware) + traces génériques
   * (base + contributions primaires + modificateurs + provenance). Aucun calcul
   * client. `null` si l'instance est inconnue.
   */
  async getInstanceRuntimeSnapshot(instanceId: string): Promise<CreatureRuntimeSnapshotDto | null> {
    const creature = this.liveCreatures.get(instanceId);
    if (!creature) return null;
    const t = creature.spawn?.template;
    if (!t) return null;

    const stats = this.creatureCombatStats(creature, t); // override-aware (combat + maxHealth)
    const overrides = this.templateOverrides.getOverrides(t.id);
    const globalCoeffs = this.creatureSecondaryCoefficients.getCoefficients();
    const globalMaps = buildGlobalCombatCoefficientMaps(globalCoeffs);
    const definitions = await this.derivedStats.getDefinitions();
    const defByKey = new Map(definitions.map((d) => [d.key, d as unknown as { baseValue?: number; primaryCoefficients?: Record<string, number>; label?: string; category?: string }]));
    const primaries = this.templatePrimaryRecord(t);

    // Valeurs finales AUTORITAIRES par dérivée.
    const finalValues: Record<string, number> = {
      physicalAttack: stats.attackPower,
      defense: stats.defenseTotal,
      accuracy: stats.accuracy,
      dodgeChance: stats.dodgeChance,
      blockChance: stats.blockChance,
      parryChance: stats.parryChance,
      counterAttackPower: stats.counterAttackPower,
      maxHealth: stats.maxHealth,
    };
    // Résistances : base catalogue + Σ coef effectif (aucun cap/plancher).
    for (const key of MAGIC_RESISTANCE_STAT_KEYS) {
      const info = this.derivedStatBaseInfo(t, key, globalMaps, defByKey);
      const { map } = effectiveCoefficientMap(overrides, key, info.fallbackMap, info.fallbackSource);
      finalValues[key] = info.baseValue + sumPrimaryContributions(map, primaries);
    }

    const traces: DerivedStatTraceDto[] = this.configurableDerivedKeys().map((key) =>
      this.buildDerivedStatTrace(t, key, overrides, globalMaps, defByKey, primaries, finalValues[key]),
    );

    const scalarValues: Record<string, number> = {
      blockReductionPercent: stats.blockReductionPercent,
      secondaryChanceCap: effectiveScalar(
        overrides,
        'secondaryChanceCap',
        globalScalarValue(globalCoeffs, 'secondaryChanceCap'),
      ).value,
    };

    return {
      instanceId: creature.id,
      templateId: t.id,
      templateKey: t.key,
      state: creature.state,
      currentHealth: creature.health,
      maxHealth: stats.maxHealth,
      primaryStats: primaries,
      derivedStats: { ...finalValues, ...scalarValues },
      traces,
    };
  }

  /** Construit la trace GÉNÉRIQUE d'une dérivée (identique pour combat/PV max/résistances). */
  private buildDerivedStatTrace(
    template: CreatureTemplate,
    key: string,
    overrides: ReturnType<CreatureTemplateOverridesService['getOverrides']>,
    globalMaps: Record<string, CoefficientMap>,
    defByKey: Map<string, { baseValue?: number; primaryCoefficients?: Record<string, number>; label?: string; category?: string }>,
    primaries: Record<string, number>,
    finalValue: number,
  ): DerivedStatTraceDto {
    const info = this.derivedStatBaseInfo(template, key, globalMaps, defByKey);
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides.derivedCoefficients, key);
    const explicitMap = hasOverride ? overrides.derivedCoefficients[key] : null;
    const overrideState = !hasOverride
      ? 'none'
      : Object.keys(explicitMap as CoefficientMap).length === 0
        ? 'empty'
        : 'coefficients';
    const { map, source } = effectiveCoefficientMap(overrides, key, info.fallbackMap, info.fallbackSource);
    const contributions = Object.entries(map).map(([primaryStatKey, coefficient]) => ({
      primaryStatKey,
      primaryValue: primaries[primaryStatKey] ?? 0,
      coefficient,
      contribution: (primaries[primaryStatKey] ?? 0) * coefficient,
    }));
    const computedFromCoefficients =
      info.baseValue + contributions.reduce((s, c) => s + c.contribution, 0);
    return {
      derivedStatKey: key,
      baseValue: info.baseValue,
      baseSource: info.baseSource,
      contributions,
      computedFromCoefficients,
      // Écart final − calcul primaire : modificateurs génériques (debug) et
      // effets de cap/plancher déjà appliqués par le resolver autoritaire.
      modifiers: finalValue - computedFromCoefficients,
      finalValue,
      source,
      overrideState,
    };
  }

  private creatureCombatStats(creature: Creature, template: CreatureTemplate): CreatureCombatStats {
    return CreatureRuntimeCalculator.resolveCombatStats(
      creature,
      template,
      this.debugRegistry.getModifiers(creature.id),
      // V6-B2.5 : coefficients GLOBAUX (singleton, fallback). Defaults →
      // comportement inchangé.
      this.creatureSecondaryCoefficients.getCoefficients(),
      // Lot 2 fix : PV max mémoïsé (par template) — inclut déjà l'override.
      this.resolveCreatureMaxHealth(template),
      // ADR-0021 sous-lot backend : overrides de dérivation PAR TEMPLATE (lecture
      // synchrone, cache). Absent → fallback global (identique historique).
      this.templateOverrides.getOverrides(template.id),
    );
  }

  /**
   * Lot 2 (ADR-0021) : PV maximum EFFECTIF d'une créature, point d'accès unique
   * du service. Délègue au point de résolution pur `resolveMaxHealth` (coefficients
   * serveur effectifs) et **mémoïse le résultat par templateKey** (snapshot). Le
   * pipeline `resolveStat` n'est reconstruit qu'au premier accès ou après
   * invalidation (`invalidateMaxHealthCache` — édition template/coefficients), pas
   * à chaque hit ni chaque tick. Pas de debug modifier sur le PV max (une seule
   * valeur autoritaire ; l'inspection debug reste servie par
   * `CreatureRuntimeService.getRuntimeSnapshot`). Tous les chemins PV créature
   * (spawn/respawn/soin/fuite/admin/DTO/combat) lisent cette valeur.
   */
  /**
   * Résultat COMPLET de résolution des PV max (valeur finale + trace) mémoïsé par
   * templateKey. Le resolver générique n'est appelé qu'au premier accès (ou après
   * invalidation) ; les lectures répétées (tick de fuite, DTO broadcast, hits
   * combat, soins, inspection Studio) lisent le snapshot — aucune reconstruction
   * du pipeline par tick. Valeur autoritaire et trace proviennent du MÊME résultat.
   */
  private resolveCreatureMaxHealthResult(template: CreatureTemplate): StatResolutionResult {
    const cached = this.maxHealthByTemplateKey.get(template.key);
    if (cached !== undefined) return cached;
    // ADR-0021 sous-lot backend : override maxHealth du template (si présent) —
    // sinon null → fallback Vitalité historique EXACT. Le memo par templateKey
    // est invalidé sur changement d'override (listener enregistré).
    const overrides = this.templateOverrides.getOverrides(template.id);
    const maxHealthOverrideMap = Object.prototype.hasOwnProperty.call(
      overrides.derivedCoefficients,
      'maxHealth',
    )
      ? overrides.derivedCoefficients['maxHealth']
      : null;
    const result = CreatureRuntimeCalculator.resolveMaxHealth(
      template,
      this.creatureSecondaryCoefficients.getCoefficients(),
      maxHealthOverrideMap,
    );
    this.maxHealthByTemplateKey.set(template.key, result);
    return result;
  }

  /** PV max EFFECTIF (valeur finale autoritaire) — lecture unique des consommateurs runtime. */
  private resolveCreatureMaxHealth(template: CreatureTemplate): number {
    return this.resolveCreatureMaxHealthResult(template).finalValue;
  }

  /**
   * Lot 3 : sérialise la trace du calcul du PV max pour le Studio (lecture seule),
   * depuis le MÊME snapshot mémoïsé que la valeur autoritaire (jamais un recalcul
   * séparé → aucune divergence possible entre valeur et trace). Ajoute le contexte
   * (Vitalité du template, coefficient global) que le resolver générique ne porte pas.
   */
  private buildMaxHealthTrace(template: CreatureTemplate): CreatureMaxHealthTraceDto {
    const result = this.resolveCreatureMaxHealthResult(template);
    return {
      stat: 'maxHealth',
      baseValue: result.baseValue,
      vitality: template.vitality ?? 0,
      maxHealthPerVitality: this.creatureSecondaryCoefficients.getCoefficients().maxHealthPerVitality,
      appliedContributions: result.applied.map((a) => ({
        sourceType: a.sourceType,
        sourceId: a.sourceId,
        operation: a.operation,
        originalValue: a.originalValue,
        effectiveValue: a.effectiveValue,
        scale: a.scale,
        contribution: a.contribution,
        tags: a.tags,
      })),
      filteredContributions: result.filtered.map((f) => ({
        sourceType: f.sourceType,
        sourceId: f.sourceId,
        operation: f.operation,
        originalValue: f.originalValue,
        scale: f.scale,
        excluded: f.excluded,
        reasons: f.reasons,
      })),
      afterFlat: result.afterFlat,
      afterPercentAdd: result.afterPercentAdd,
      afterPercentMultiply: result.afterPercentMultiply,
      afterOverride: result.afterOverride,
      beforeCaps: result.beforeCaps,
      caps: { min: result.caps.min, max: result.caps.max },
      afterCaps: result.afterCaps,
      roundingPolicy: result.roundingPolicy,
      overrideApplied: result.overrideApplied,
      finalValue: result.finalValue,
    };
  }

  /**
   * Invalide le snapshot de PV max d'un template (ou de tous). À appeler quand une
   * SOURCE du PV max change : édition de template (baseHealth/vitality) ou
   * coefficient `maxHealthPerVitality` (endpoint admin coefficients). La prochaine
   * lecture recalcule et re-mémoïse. Ne clampe pas les PV : c'est la
   * responsabilité de l'appelant (voir `refreshTemplateInMemory` /
   * `recalculateAllMaxHealthAfterCoefficientChange`).
   */
  /**
   * Invalide le memo PV max du template identifié par son `id` (int), sans
   * toucher les autres templates. Résout la `key` (clé du memo) puis délègue.
   */
  private async invalidateMaxHealthForTemplateId(templateId: number): Promise<void> {
    const template = await this.templateRepository.findOne({ where: { id: templateId } });
    if (template) this.invalidateMaxHealthCache(template.key);
  }

  invalidateMaxHealthCache(templateKey?: string): void {
    if (templateKey) this.maxHealthByTemplateKey.delete(templateKey);
    else this.maxHealthByTemplateKey.clear();
  }

  /**
   * Recalcule les PV max de TOUTES les créatures vivantes après un changement du
   * coefficient GLOBAL `maxHealthPerVitality` (une config pour tous les templates
   * → invalidation globale du snapshot). Appelé par l'admin (Studio) APRÈS
   * validation serveur du coefficient — jamais par un payload joueur.
   *
   * Par créature vivante :
   * - max INCHANGÉ (ex. Vitalité 0 → toujours `baseHealth`) → rien (aucune écriture
   *   DB, aucune émission réseau) ;
   * - BAISSE du max → PV courants clampés `min(health, newMax)` + persistance ;
   * - HAUSSE du max → PV courants inchangés (jamais de soin automatique) ;
   * - tout changement de max → diffusion `creature_update` (le DTO porte le nouveau
   *   max, la barre client se met à jour sans recalcul).
   *
   * Les créatures MORTES sont ignorées : jamais ressuscitées, `respawnAt` intact ;
   * leur prochain respawn lira le nouveau max. Les créatures hors mémoire
   * recalculeront au prochain chargement (coefficient persisté).
   */
  async recalculateAllMaxHealthAfterCoefficientChange(): Promise<void> {
    // Snapshot des anciens max par template AVANT invalidation (pour distinguer
    // un max réellement changé d'un max inchangé et éviter les émissions inutiles).
    const oldByTemplate = new Map(this.maxHealthByTemplateKey);
    this.invalidateMaxHealthCache();

    for (const creature of this.liveCreatures.values()) {
      if (creature.state === 'dead' || !creature.spawn?.template) continue;
      const template = creature.spawn.template;
      const oldMax = oldByTemplate.get(template.key)?.finalValue;
      const newMax = this.resolveCreatureMaxHealth(template); // recompute + re-mémoïse
      if (oldMax !== undefined && oldMax === newMax) continue; // max inchangé → skip

      if (creature.health > newMax) {
        // Baisse effective : clamp + persistance des PV.
        creature.health = newMax;
        await this.creatureRepository.update(creature.id, { health: creature.health });
      }
      // Diffusion du nouveau max (baisse clampée OU hausse à PV inchangés).
      if (this.server) {
        this.server
          .to(getMapRoomId(creature.mapId ?? DEFAULT_MAP_ID))
          .emit('creature_update', this.toDto(creature));
      }
    }
  }

  /**
   * V6-B7 : contre-attaque CRÉATURE → joueur (point UNIQUE, partagé auto-attaque
   * `attack()` et skill `applySkillDamage()`). Déclenchée quand la créature a PARÉ
   * une attaque joueur. Calcule le hit (attaquant = `counterAttackPower` créature +
   * crit/accuracy/pénétration ; défenseur = joueur avec esquive/blocage, `canParry:
   * false` → ANTI-RÉCURSION), applique les PV joueur, respawn UNE seule fois si tué,
   * et retourne l'objet. N'ÉMET aucun event socket (l'appelant/gateway s'en charge).
   *
   * Retourne `undefined` si aucune contre-attaque : créature morte, joueur mort, ou
   * `counterAttackPower <= 0`.
   */
  private async applyCreatureCounterAttack(
    creature: Creature,
    creatureStats: CreatureCombatStats,
    characterId: string,
    playerCurrentHealth: number,
    playerDerived: DerivedStats,
  ): Promise<CreatureCounterAttack | undefined> {
    if (
      !(creature.state === 'alive' || creature.state === 'fighting') ||
      playerCurrentHealth <= 0 ||
      creatureStats.counterAttackPower <= 0
    ) {
      return undefined;
    }

    const ccResult = resolveCombatHit({
      attacker: {
        attackPower: creatureStats.counterAttackPower,
        minimumAttack: 0,
        armorPenetrationPercent: creatureStats.armorPenetrationPercent,
        criticalChancePercent: creatureStats.criticalChance,
        criticalDamagePercent: creatureStats.criticalDamage,
        accuracyPercent: creatureStats.accuracy,
      },
      defender: {
        // Joueur défenseur : contrat V4 (esquive + blocage). ANTI-RÉCURSION :
        // le joueur ne PARE JAMAIS la contre-attaque créature (`canParry: false`)
        // → aucune parade → aucune contre-contre-attaque, aucune chaîne.
        defense: playerDerived.defense,
        dodgeChancePercent: playerDerived.dodgeChance ?? 0,
        blockChancePercent: playerDerived.blockChance ?? 0,
        blockReductionPercent: playerDerived.blockReductionPercent ?? 0,
        canParry: false,
        parryChancePercent: 0,
      },
      // Attaque physique (attackDefenseKind physical) ; damageType physical.
      damageType: 'physical',
      minimumDamage: 1,
      hpBefore: playerCurrentHealth,
    });
    const ccHealth = ccResult.hpAfter;
    await this.characterRepository.update(characterId, { health: ccHealth });
    const ccKilled = ccHealth === 0;
    if (ccKilled) {
      // Mort du joueur → si ce joueur ÉTAIT la cible de la créature, elle
      // l'abandonne explicitement AVANT le respawn (symétrie avec le chemin
      // passif applyCreatureHitToPlayer). Sans ce reset, la créature resterait
      // en poursuite jusqu'à ce que le repositionnement au respawn / la leash la
      // rompe (asymétrie de lifecycle). Le garde `=== characterId` évite de
      // casser une aggro sur un AUTRE joueur. Un seul respawn (jamais en
      // parallèle d'une riposte → pas de double mort).
      const patrolState = this.patrolStates.get(creature.id);
      if (patrolState && patrolState.targetCharacterId === characterId) {
        patrolState.targetCharacterId = undefined;
      }
      if (this.server) {
        await this.worldService.respawnCharacter(characterId, this.server);
      }
    }
    return {
      amount: ccResult.finalDamage,
      currentHealth: ccHealth,
      maxHealth: Math.round(playerDerived.maxHealth),
      killed: ccKilled,
      isCritical: ccResult.isCritical,
      isDodged: ccResult.isDodged,
      isBlocked: ccResult.isBlocked,
      isParried: ccResult.isParried,
      blockedDamage: ccResult.blockedDamage,
      isCounterAttack: true,
    };
  }

  /**
   * V5-B : invalide le cache des capacités damage d'un template (ou tout) après
   * une édition Studio. Lecture seule côté combat : force juste un reload.
   */
  invalidateAbilitiesCache(templateKey?: string): void {
    if (templateKey) this.combatAbilityCache.delete(templateKey);
    else this.combatAbilityCache.clear();
    // L'édition Studio d'un template peut changer baseHealth/vitality → invalider
    // aussi le snapshot de PV max (recalcul à la prochaine lecture).
    this.invalidateMaxHealthCache(templateKey);
  }

  /**
   * V5-D1-A : capacités combat d'un template (association enabled ET skill
   * enabled), TOUS effectType confondus (damage + heal), triées par displayOrder
   * puis skillKey. Résultat caché par templateKey (config, pas d'état live).
   * Ne caste rien ; la sélection combat filtre ensuite `effectType === 'damage'`.
   */
  private async getCombatAbilities(
    templateId: number,
    templateKey: string,
  ): Promise<ResolvedCreatureAbility[]> {
    const cached = this.combatAbilityCache.get(templateKey);
    if (cached) return cached;

    const links = await this.creatureTemplateSkillRepository.find({
      where: { creatureTemplateId: templateId, enabled: true },
      order: { displayOrder: 'ASC', skillKey: 'ASC' },
    });
    let resolved: ResolvedCreatureAbility[] = [];
    if (links.length > 0) {
      const skills = await this.skillDefinitionRepository.find({
        where: { key: In(links.map((l) => l.skillKey)) },
      });
      const byKey = new Map(skills.map((s) => [s.key, s]));
      resolved = links
        .map((link) => {
          const skill = byKey.get(link.skillKey);
          if (!skill || !skill.enabled) return null;
          // ADR-0022 / D1 : le type de dégâts est préservé tel quel (physical,
          // magic ou raw). Un skill `magic` conserve son école (validée non nulle
          // à l'écriture) pour que la mitigation magique du joueur défenseur
          // s'applique (`applyCreatureHitToPlayer`). physical/raw → école nulle.
          const damageType: DamageType =
            skill.damageType === 'raw'
              ? 'raw'
              : skill.damageType === 'magic'
                ? 'magic'
                : 'physical';
          return {
            skillKey: skill.key,
            skillName: skill.name,
            effectType: skill.effectType,
            displayOrder: link.displayOrder,
            rangeWU: skill.rangeWU > 0 ? skill.rangeWU : MELEE_RANGE_WU,
            cooldownMs: skill.cooldownMs,
            damageType,
            magicSchool:
              damageType === 'magic'
                ? ((skill.magicSchool as MagicSchool | null) ?? null)
                : null,
            canCrit: skill.canCrit === true,
            // Flags défensifs SERVEUR (défauts sûrs si colonnes absentes) — lus
            // depuis la définition à jour (cache invalidé sur sauvegarde Studio).
            canBeDodged: skill.canBeDodged ?? true,
            canBeBlocked: skill.canBeBlocked ?? true,
            canBeParried: skill.canBeParried ?? false,
            scaling: (skill.scaling ?? {}) as Record<string, unknown>,
          } as ResolvedCreatureAbility;
        })
        .filter((a): a is ResolvedCreatureAbility => a !== null);
    }
    this.combatAbilityCache.set(templateKey, resolved);
    return resolved;
  }

  /**
   * V5-B : première capacité DAMAGE utilisable (effectType damage + portée couverte
   * + cooldown skill expiré), dans l'ordre déjà trié. null si aucune. Le heal n'est
   * PAS sélectionné ici (V5-D1-A : affichage seulement, cast heal en V5-D1-B).
   */
  private pickCreatureDamageAbility(
    creatureId: string,
    abilities: ResolvedCreatureAbility[],
    distWU: number,
    now: number,
  ): ResolvedCreatureAbility | null {
    if (abilities.length === 0) return null;
    const cd = this.creatureSkillCooldowns.get(creatureId);
    for (const ability of abilities) {
      if (ability.effectType !== 'damage') continue; // heal traité séparément
      if (distWU > ability.rangeWU) continue; // hors portée
      const lastCast = cd?.get(ability.skillKey) ?? 0;
      if (now - lastCast < ability.cooldownMs) continue; // cooldown non expiré
      return ability;
    }
    return null;
  }

  /**
   * V5-D1-B : première capacité HEAL utilisable (effectType heal + cooldown skill
   * expiré), dans l'ordre déjà trié. Self-heal : PAS de check de portée (le lanceur
   * est la cible). L'appelant garantit que la créature est blessée. null si aucune.
   */
  private pickCreatureHealAbility(
    creatureId: string,
    abilities: ResolvedCreatureAbility[],
    now: number,
  ): ResolvedCreatureAbility | null {
    if (abilities.length === 0) return null;
    const cd = this.creatureSkillCooldowns.get(creatureId);
    for (const ability of abilities) {
      if (ability.effectType !== 'heal') continue;
      const lastCast = cd?.get(ability.skillKey) ?? 0;
      if (now - lastCast < ability.cooldownMs) continue; // cooldown non expiré
      return ability;
    }
    return null;
  }

  /**
   * V5-B : montant brut d'une capacité damage castée par une créature. Réutilise
   * le calculateur pur `calculateSkillEffect` avec les stats DÉRIVÉES de la
   * créature (`attackPower` exposé aussi sous `physicalAttack`). Pas de primaires
   * ni de maîtrises créature. Aucun effet de bord.
   */
  private computeCreatureSkillAmount(
    creature: Creature,
    template: CreatureTemplate,
    ability: ResolvedCreatureAbility,
  ): number {
    const stats = this.creatureCombatStats(creature, template);
    return calculateSkillEffect(
      { effectType: ability.effectType, scaling: ability.scaling },
      {
        primary: {},
        derived: {
          attackPower: stats.attackPower,
          physicalAttack: stats.attackPower,
          // healingPower effective (fallback attackPower si 0) centralisé dans le helper.
          healingPower: stats.healingPowerEffective,
          defenseTotal: stats.defenseTotal,
          maxHp: stats.maxHealth,
        },
        masteryLevels: {},
      },
      { minimum: 0 },
    ).amount;
  }

  startPatrol(server: Server) {
    this.server = server;
    setInterval(() => this.tickPatrol(server).catch(console.error), PATROL_TICK_MS);
  }

  private async tickPatrol(server: Server) {
    const now = Date.now();
    const players = this.worldService.getAllConnectedPlayers();

    // Enregistrement paresseux : pick up les animaux charges apres afterInit
    for (const [id, creature] of this.liveCreatures) {
      if (!this.patrolStates.has(id) && creature.spawn && creature.state !== 'dead') {
        const { template } = creature.spawn;
        this.patrolStates.set(id, {
          dirX: 0, dirY: 0, speed: 0, moveUntil: 0,
          pauseUntil: now + rand(template.pauseMinMs, template.pauseMaxMs),
        });
      }
    }

    for (const [id, state] of this.patrolStates) {
      const creature = this.liveCreatures.get(id);
      if (!creature || !creature.spawn || creature.state === 'dead') continue;

      const { template } = creature.spawn;
      // Lot 2 : seuil de fuite sur le PV max effectif (cap min 1 garantit > 0 ;
      // garde anti-division par zéro par sécurité).
      const maxHealth = this.resolveCreatureMaxHealth(template);
      const hpPct = maxHealth > 0 ? (creature.health / maxHealth) * 100 : 0;

      // Transition : fuite (prioritaire)
      if (template.fleeThresholdPct > 0 && hpPct < template.fleeThresholdPct && creature.state !== 'escaping') {
        await this.changeCreatureState(creature, 'escaping');
        state.targetCharacterId = undefined;
      }

      // Transition : aggro (seulement en patrouille)
      if (creature.state === 'alive' && template.aggroRadius > 0 && players.length > 0) {
        const nearest = findNearestPlayer(players, creature);
        if (nearest && nearest.dist <= legacyRadiusToWU(template.aggroRadius)) {
          await this.changeCreatureState(creature, 'fighting');
          state.targetCharacterId = nearest.player.characterId;
        }
      }

      switch (creature.state) {
        case 'alive':
          this.doPatrolMovement(creature, state, template, now);
          break;
        case 'fighting':
          await this.doFighting(creature, state, template, players, now, server);
          break;
        case 'escaping':
          await this.doEscaping(creature, state, template, players, now);
          break;
      }

      const dto = this.toDto(creature);
      server.to(getMapRoomId(creature.mapId ?? DEFAULT_MAP_ID)).emit('creature_update', dto);
    }
  }

  private doPatrolMovement(
    creature: Creature,
    state: PatrolState,
    template: CreatureTemplate,
    now: number,
  ) {
    if (now < state.pauseUntil) return;

    if (now >= state.moveUntil) {
      const angle = Math.random() * Math.PI * 2;
      state.dirX = Math.cos(angle);
      state.dirY = Math.sin(angle);
      const effectiveSpeedMax = this.resolveEffectiveSpeed(creature, template);
      state.speed = rand(Math.min(template.speedMin, effectiveSpeedMax), effectiveSpeedMax);
      state.moveUntil = now + rand(PATROL_MOVE_MIN_MS, PATROL_MOVE_MAX_MS);
    }

    if (creature.worldX == null || creature.worldY == null) return;
    if (creature.spawn.worldX == null || creature.spawn.worldY == null) return;

    const spawnWU = { worldX: creature.spawn.worldX, worldY: creature.spawn.worldY };

    const dt = PATROL_TICK_MS / 1000;
    const stepWU = legacyRadiusToWU(state.speed * dt);
    const newWX = creature.worldX + state.dirX * stepWU;
    const newWY = creature.worldY + state.dirY * stepWU;
    const dx = newWX - spawnWU.worldX;
    const dy = newWY - spawnWU.worldY;
    const dist = Math.hypot(dx, dy);
    const patrolRadiusWU = legacyRadiusToWU(template.patrolRadius);

    if (dist > patrolRadiusWU) {
      creature.worldX = Math.round(spawnWU.worldX + (dx / dist) * patrolRadiusWU);
      creature.worldY = Math.round(spawnWU.worldY + (dy / dist) * patrolRadiusWU);
      state.moveUntil = 0;
      state.pauseUntil = now + rand(template.pauseMinMs, template.pauseMaxMs);
    } else {
      creature.worldX = Math.round(newWX);
      creature.worldY = Math.round(newWY);
    }
    creature.mapId = creature.mapId ?? DEFAULT_MAP_ID;
  }

  private async doFighting(
    creature: Creature,
    state: PatrolState,
    template: CreatureTemplate,
    players: ConnectedPlayer[],
    now: number,
    server: Server,
  ) {
    const target = state.targetCharacterId
      ? players.find((p) => p.characterId === state.targetCharacterId)
      : null;

    // Cible disparue ou laisse rompue → retour en patrouille
    if (!target) {
      await this.changeCreatureState(creature, 'alive');
      state.targetCharacterId = undefined;
      return;
    }

    if (creature.worldX == null || creature.worldY == null) return;
    if (creature.spawn.worldX == null || creature.spawn.worldY == null) return;

    const spawnWU = { worldX: creature.spawn.worldX, worldY: creature.spawn.worldY };

    const dx = target.worldX - creature.worldX;
    const dy = target.worldY - creature.worldY;
    const dist = Math.hypot(dx, dy);

    const spawnDist = Math.hypot(creature.worldX - spawnWU.worldX, creature.worldY - spawnWU.worldY);
    if (spawnDist > legacyRadiusToWU(template.patrolRadius) * LEASH_MULTIPLIER) {
      await this.changeCreatureState(creature, 'alive');
      state.targetCharacterId = undefined;
      return;
    }

    // Avancer vers la cible
    if (dist > MELEE_RANGE_WU) {
      const dt = PATROL_TICK_MS / 1000;
      const stepWU = legacyRadiusToWU(this.resolveEffectiveSpeed(creature, template) * dt);
      creature.worldX = Math.round(creature.worldX + (dx / dist) * stepWU);
      creature.worldY = Math.round(creature.worldY + (dy / dist) * stepWU);
      creature.mapId = creature.mapId ?? DEFAULT_MAP_ID;
    }

    // V5-B : dans la fenêtre d'action, une capacité damage configurée (en portée
    // + hors cooldown skill) est PRIORITAIRE et castée via le resolver commun.
    // Sinon, on retombe EXACTEMENT sur l'auto-attaque existante (ci-dessous).
    const lastAtk = this.lastCreatureAutoAttackAt.get(creature.id) ?? 0;
    if (now - lastAtk >= AUTO_ATTACK_COOLDOWN_MS) {
      const abilities = await this.getCombatAbilities(template.id, template.key);
      // V5-D1-B : si blessée, une capacité HEAL (self) est prioritaire sur le damage.
      // Le heal consomme la fenêtre d'action : aucun damage dans le même tick.
      if (creature.health < this.resolveCreatureMaxHealth(template)) {
        const healChosen = this.pickCreatureHealAbility(creature.id, abilities, now);
        if (healChosen) {
          await this.castCreatureHeal(creature, template, healChosen, server, now);
          return;
        }
      }
      const chosen = this.pickCreatureDamageAbility(creature.id, abilities, dist, now);
      if (chosen) {
        await this.castCreatureDamageSkill(creature, template, chosen, target, server, state, now);
        return;
      }
    }

    // Auto-attaque (fallback) — V5-G : passe désormais par le resolver commun via
    // `applyCreatureHitToPlayer`, exactement comme les skills créature. Le joueur
    // applique son contrat défensif V4 (esquive + blocage, stats serveur incluant
    // l'équipement) ; la créature applique ses stats offensives avancées (critique,
    // accuracy, pénétration d'armure). Parade TOUJOURS désactivée (canParry false
    // côté helper). Cooldown / portée MELEE / exclusivité heal→skill→auto inchangés.
    if (dist <= MELEE_RANGE_WU && now - lastAtk >= AUTO_ATTACK_COOLDOWN_MS) {
      this.lastCreatureAutoAttackAt.set(creature.id, now);
      const stats = this.creatureCombatStats(creature, template);
      await this.applyCreatureHitToPlayer(creature, target, server, state, {
        attacker: {
          attackPower: stats.attackPower,
          minimumAttack: 0,
          armorPenetrationPercent: stats.armorPenetrationPercent,
          criticalChancePercent: stats.criticalChance,
          criticalDamagePercent: stats.criticalDamage,
          accuracyPercent: stats.accuracy,
        },
        damageType: 'physical',
        minimumDamage: 1,
      });
    }
  }

  /**
   * V5-B : cast d'une capacité damage créature → joueur, OBLIGATOIREMENT via le
   * resolver commun (`resolveCombatHit`) — aucun chemin de dégâts spécial. Le
   * joueur défenseur applique son contrat défensif V4 (esquive + blocage) ;
   * parade JAMAIS sur un hit créature (nature mêlée/distance non fiable). Pas de
   * critique/pénétration créature (aucune stat dédiée). Mort/respawn identiques
   * à l'auto-attaque.
   */
  private async castCreatureDamageSkill(
    creature: Creature,
    template: CreatureTemplate,
    ability: ResolvedCreatureAbility,
    target: ConnectedPlayer,
    server: Server,
    state: PatrolState,
    now: number,
  ): Promise<void> {
    // Consomme la fenêtre d'action + enregistre le cooldown du skill.
    this.lastCreatureAutoAttackAt.set(creature.id, now);
    let cd = this.creatureSkillCooldowns.get(creature.id);
    if (!cd) {
      cd = new Map();
      this.creatureSkillCooldowns.set(creature.id, cd);
    }
    cd.set(ability.skillKey, now);

    // V5-D2-A : stats offensives avancées de la créature (point unique V6-A Lot 2).
    // Défauts 0 → comportement V5-B inchangé. `raw` ignore armure + pénétration
    // côté calculateur (inchangé).
    const rawAmount = this.computeCreatureSkillAmount(creature, template, ability);
    const stats = this.creatureCombatStats(creature, template);
    // Règle critique canonique : un skill créature ne critique que s'il inflige
    // des DÉGÂTS PHYSIQUES avec `canCrit`. Sinon chance 0 (aucun jet critique) —
    // même helper que le chemin joueur → créature.
    const skillCanCrit = resolveEffectiveCanCrit(ability);
    await this.applyCreatureHitToPlayer(creature, target, server, state, {
      attacker: {
        attackPower: rawAmount,
        minimumAttack: 0,
        armorPenetrationPercent: stats.armorPenetrationPercent,
        criticalChancePercent: skillCanCrit ? stats.criticalChance : 0,
        criticalDamagePercent: stats.criticalDamage,
        accuracyPercent: stats.accuracy,
      },
      damageType: ability.damageType,
      // D1 : école transmise pour la mitigation magique du joueur défenseur.
      magicSchool: ability.magicSchool,
      // Flags défensifs SERVEUR du skill : le joueur défenseur ne peut esquiver/
      // bloquer que si le skill l'autorise (lus depuis la définition à jour).
      canBeDodged: ability.canBeDodged,
      canBeBlocked: ability.canBeBlocked,
      canBeParried: ability.canBeParried,
      skillName: ability.skillName,
    });
  }

  /**
   * Applique un hit créature → joueur via le resolver commun (`resolveCombatHit`),
   * met à jour les PV, émet `character_damaged` (unicast) + `combat:event` (room,
   * avec les flags isCritical/isDodged/isBlocked/blockedDamage), et gère la
   * mort/respawn + nettoyage de la cible. Point unique d'application d'un hit
   * créature → joueur : le défenseur applique son contrat défensif V4 (esquive +
   * blocage, stats dérivées serveur incluant l'équipement) ; parade JAMAIS sur un
   * hit créature (`canParry: false`). L'appelant fournit le bloc attaquant déjà
   * assemblé (montant + stats avancées) et consomme lui-même son cooldown.
   *
   * V5-G étape 1 : extrait de `castCreatureDamageSkill` sans changement de
   * comportement observable. L'auto-attaque legacy ne l'utilise PAS encore.
   */
  private async applyCreatureHitToPlayer(
    creature: Creature,
    target: ConnectedPlayer,
    server: Server,
    state: PatrolState,
    hit: {
      attacker: CombatHitAttacker;
      damageType: DamageType;
      /** École du hit (ADR-0022) — non nulle seulement pour `damageType: 'magic'`. */
      magicSchool?: MagicSchool | null;
      /** Flags défensifs SERVEUR du skill (défauts : dodge/block true, parade false).
       * Auto-attaque : omis → défauts (le joueur peut esquiver/bloquer, historique). */
      canBeDodged?: boolean;
      canBeBlocked?: boolean;
      canBeParried?: boolean;
      skillName?: string;
      /** Plancher des dégâts finaux. Défaut 1 (préserve le plancher legacy). */
      minimumDamage?: number;
    },
  ): Promise<void> {
    const char = await this.characterRepository.findOne({
      where: { id: target.characterId },
      relations: ['equipment', 'equipment.item'],
    });
    if (!char || char.health <= 0) return;

    const derivedStatDefinitions = await this.derivedStats.getDefinitions();
    const charDerived = CharacterStatsCalculator.compute(
      char,
      derivedStatDefinitions,
      aggregateEquipmentBonuses(char.equipment),
      mergeDerivedStatModifiers(
        await this.masteryEffects.getPermanentStatModifiers(char.id),
        aggregateEquipmentDerivedModifiers(char.equipment, derivedStatDefinitions),
      ),
    ).derived;

    // D1 (ADR-0022) : REJET EXPLICITE d'un hit `magic` sans école. La validation
    // serveur interdit un skill `magic` sans `magicSchool` (aucun fallback : ni
    // globale seule, ni école générique, ni sacré par défaut). Un hit magique
    // sans école est donc une anomalie : on l'ABANDONNE (aucun dégât, PV
    // inchangés) plutôt que d'inventer une école — même exigence que le chemin
    // joueur → créature (« Magic skill requires a magic school »).
    if (hit.damageType === 'magic' && !hit.magicSchool) {
      this.logger.warn(
        `Hit magique créature ${creature.id} sans magicSchool — hit ignoré (aucun dégât appliqué).`,
      );
      return;
    }

    // D1 (ADR-0022) : mitigation magique du joueur DÉFENSEUR. Résolue au moment
    // du hit depuis les stats dérivées serveur DÉJÀ calculées (base + coefficients
    // primaires + équipement + modificateurs), via le MÊME resolver générique que
    // la cible créature : effectiveResistance = magicResistanceGlobal +
    // magicResistance<École>. Aucun clamp (négatif = vulnérabilité, ≥ 100 ≠
    // immunité). physical/raw → 0 (aucune mitigation).
    const effectiveMagicResistance =
      hit.damageType === 'magic'
        ? resolveEffectiveMagicResistance(
            hit.magicSchool,
            magicResistanceReaderFromStats(charDerived as unknown as Record<string, number>),
          ).effectiveResistance
        : 0;

    // Flags défensifs SERVEUR du skill (défauts sûrs pour l'auto-attaque, qui ne
    // les fournit pas : le joueur peut esquiver/bloquer, comportement historique).
    // `canBeDodged: false` ⇒ AUCUN jet d'esquive (dodge 0), indépendamment de
    // damageType. Idem blocage. Parade JAMAIS déclenchée par le joueur sur un hit
    // créature (anti-récursion contre-attaque) : `canParry: false` conservé — le
    // flag `canBeParried` gouverne la parade côté créature défenseur, pas ici.
    // PROTECTION RUNTIME : un hit `magic` n'est JAMAIS esquivé (helper centralisé),
    // même si une ligne héritée incohérente a `canBeDodged: true`.
    const canBeDodged = resolveEffectiveCanBeDodged(hit.damageType, hit.canBeDodged);
    const canBeBlocked = hit.canBeBlocked ?? true;
    const result = resolveCombatHit({
      attacker: hit.attacker,
      defender: {
        defense: charDerived.defense,
        dodgeChancePercent: canBeDodged ? (charDerived.dodgeChance ?? 0) : 0,
        blockChancePercent: canBeBlocked ? (charDerived.blockChance ?? 0) : 0,
        blockReductionPercent: canBeBlocked ? (charDerived.blockReductionPercent ?? 0) : 0,
        canParry: false,
        parryChancePercent: 0,
        // Consommée uniquement si damageType === 'magic' (calculateur).
        effectiveMagicResistance,
      },
      damageType: hit.damageType,
      minimumDamage: hit.minimumDamage ?? 1,
      hpBefore: char.health,
    });
    const dmg = result.finalDamage;
    const newHealth = result.hpAfter;
    await this.characterRepository.update(char.id, { health: newHealth });
    server.to(target.socketId).emit('character_damaged', {
      characterId: char.id,
      damage: dmg,
      health: newHealth,
    });
    const targetMapId = target.mapId ?? char.mapId ?? DEFAULT_MAP_ID;
    server.to(getMapRoomId(targetMapId)).emit(COMBAT_EVENT, makeCombatEvent({
      type: 'damage',
      amount: dmg,
      sourceType: 'creature',
      sourceId: creature.id,
      targetType: 'player',
      targetId: char.id,
      worldX: target.worldX ?? char.worldX ?? 0,
      worldY: target.worldY ?? char.worldY ?? 0,
      text: `-${dmg}`,
      skillName: hit.skillName,
      isCritical: result.isCritical,
      isDodged: result.isDodged,
      isBlocked: result.isBlocked,
      blockedDamage: result.blockedDamage,
    }));
    if (newHealth === 0) {
      await this.worldService.respawnCharacter(char.id, server);
      await this.changeCreatureState(creature, 'alive');
      state.targetCharacterId = undefined;
    }
  }

  /**
   * V5-D1-B : self-heal créature. NE passe PAS par `resolveCombatHit` (ce n'est
   * pas un hit damage : ni armure, ni esquive, ni critique). Montant via
   * `calculateSkillEffect` (effectType heal), clampé aux PV manquants. Consomme la
   * fenêtre d'action + enregistre le cooldown skill. Pas de heal allié, pas d'AoE,
   * pas de mana/threat/cast time. L'appelant garantit `health < maxHealth`.
   */
  private async castCreatureHeal(
    creature: Creature,
    template: CreatureTemplate,
    ability: ResolvedCreatureAbility,
    server: Server,
    now: number,
  ): Promise<void> {
    // Consomme la fenêtre d'action + enregistre le cooldown (cast réel).
    this.lastCreatureAutoAttackAt.set(creature.id, now);
    let cd = this.creatureSkillCooldowns.get(creature.id);
    if (!cd) {
      cd = new Map();
      this.creatureSkillCooldowns.set(creature.id, cd);
    }
    cd.set(ability.skillKey, now);

    // Lot 2 : soin clampé au PV max EFFECTIF (base + Vitalité), jamais baseHealth brut.
    const maxHealth = this.resolveCreatureMaxHealth(template);
    // Arrondi entier : le montant de soin (calculateSkillEffect) peut être
    // fractionnaire → PV créature fractionnaires → échec de persistance
    // (colonne health INTEGER). Invariant entier, pas de changement d'équilibrage.
    const amount = Math.round(this.computeCreatureSkillAmount(creature, template, ability));
    const healApplied = Math.min(amount, Math.max(0, maxHealth - creature.health));
    if (healApplied <= 0) return; // rien à soigner / montant nul : pas d'event inutile

    creature.health = Math.min(maxHealth, creature.health + amount);
    await this.creatureRepository.save(creature);

    // Event heal (feedback) — source = cible = la créature. Les PV à jour sont
    // diffusés par le `creature_update` du tick courant.
    server.to(getMapRoomId(creature.mapId ?? DEFAULT_MAP_ID)).emit(COMBAT_EVENT, makeCombatEvent({
      type: 'heal',
      amount: healApplied,
      sourceType: 'creature',
      sourceId: creature.id,
      targetType: 'creature',
      targetId: creature.id,
      worldX: creature.worldX ?? 0,
      worldY: creature.worldY ?? 0,
      text: `+${healApplied}`,
      skillName: ability.skillName,
      targetName: template.name,
    }));
  }

  private async doEscaping(
    creature: Creature,
    state: PatrolState,
    template: CreatureTemplate,
    players: ConnectedPlayer[],
    now: number,
  ) {
    const nearest = findNearestPlayer(players, creature);

    // Plus de joueurs ou suffisamment loin → retour en patrouille
    if (!nearest || nearest.dist > legacyRadiusToWU(template.patrolRadius)) {
      await this.changeCreatureState(creature, 'alive');
      state.pauseUntil = now + rand(template.pauseMinMs, template.pauseMaxMs);
      return;
    }

    if (creature.worldX == null || creature.worldY == null) return;
    if (creature.spawn.worldX == null || creature.spawn.worldY == null) return;

    const spawnWU = { worldX: creature.spawn.worldX, worldY: creature.spawn.worldY };

    const dx = creature.worldX - nearest.player.worldX;
    const dy = creature.worldY - nearest.player.worldY;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;

    const dt = PATROL_TICK_MS / 1000;
    const stepWU = legacyRadiusToWU(this.resolveEffectiveSpeed(creature, template) * dt);
    const newWX = creature.worldX + (dx / dist) * stepWU;
    const newWY = creature.worldY + (dy / dist) * stepWU;

    const escDx = newWX - spawnWU.worldX;
    const escDy = newWY - spawnWU.worldY;
    const escDist = Math.hypot(escDx, escDy);
    const maxRadius = legacyRadiusToWU(template.patrolRadius) * ESCAPE_RADIUS_MULTIPLIER;

    if (escDist > maxRadius) {
      creature.worldX = Math.round(spawnWU.worldX + (escDx / escDist) * maxRadius);
      creature.worldY = Math.round(spawnWU.worldY + (escDy / escDist) * maxRadius);
    } else {
      creature.worldX = Math.round(newWX);
      creature.worldY = Math.round(newWY);
    }
    creature.mapId = creature.mapId ?? DEFAULT_MAP_ID;
  }

  private pixelToWUSafe(
    x: number,
    y: number,
  ): { worldX: number; worldY: number; mapId: number } | null {
    try {
      const wu = isoScreenToWorldWU(x, y);
      return { worldX: wu.worldX, worldY: wu.worldY, mapId: DEFAULT_MAP_ID };
    } catch {
      return null;
    }
  }

  private async changeCreatureState(creature: Creature, newState: Creature['state']) {
    creature.state = newState;
    await this.creatureRepository.update(creature.id, { state: newState });
  }

  private async respawnCreature(id: string) {
    const creature = this.liveCreatures.get(id);
    if (!creature || !creature.spawn || creature.state !== 'dead') return;

    const { template } = creature.spawn;
    // Lot 2 : respawn aux PV max effectifs (base + Vitalité, cap 1, floor).
    const maxHealth = this.resolveCreatureMaxHealth(template);
    creature.state = 'alive';
    creature.health = maxHealth;
    creature.respawnAt = null;
    if (creature.spawn.worldX == null || creature.spawn.worldY == null || creature.spawn.mapId == null) return;
    creature.worldX = creature.spawn.worldX;
    creature.worldY = creature.spawn.worldY;
    creature.mapId = creature.spawn.mapId;

    await this.creatureRepository.update(id, {
      state: 'alive',
      health: maxHealth,
      respawnAt: null,
      worldX: creature.worldX,
      worldY: creature.worldY,
      mapId: creature.mapId,
    });

    if (this.server) {
      this.server.to(getMapRoomId(creature.mapId ?? DEFAULT_MAP_ID)).emit('creature_update', this.toDto(creature));
    }
  }

  async attack(
    id: string,
    characterId: string,
    attackerPosition: { worldX: number; worldY: number; mapId: number },
  ): Promise<AttackResult> {
    const now = Date.now();
    const lastAttack = this.lastAttackAt.get(characterId) ?? 0;
    if (now - lastAttack < ATTACK_COOLDOWN_MS) {
      return { success: false, error: 'Attack on cooldown' };
    }

    const creature = this.liveCreatures.get(id);
    if (!creature) return { success: false, error: 'Creature not found' };
    if (creature.state === 'dead') return { success: false, error: 'Creature already dead' };

    const character = await this.characterRepository.findOne({
      where: { id: characterId },
      relations: ['equipment', 'equipment.item'],
    });
    if (!character) return { success: false, error: 'Character not found' };
    if (character.health <= 0) return { success: false, error: 'Character is dead' };

    const range = this.resolveAttackRange(character);
    if (creature.worldX == null || creature.worldY == null) {
      return { success: false, error: 'Target out of range' };
    }
    // Cartes différentes → jamais à portée (anti-exploit inter-map).
    if (creature.mapId != null && attackerPosition.mapId !== creature.mapId) {
      return { success: false, error: 'Target out of range' };
    }
    const distance = chebyshevDistanceWU(attackerPosition, { worldX: creature.worldX, worldY: creature.worldY });
    if (distance > range) return { success: false, error: 'Target out of range' };

    this.lastAttackAt.set(characterId, now);

    const { template } = creature.spawn;

    // Stats de combat effectives de la créature (point unique V6-A Lot 2) :
    // defenseTotal (créature défenseur du hit principal + contre-attaque) et
    // attackPower (créature attaquant de la riposte). Debug modifiers appliqués.
    const creatureStats = this.creatureCombatStats(creature, template);

    // Progression V1 : le combat lit les stats DÉRIVÉES serveur, jamais les
    // colonnes brutes. Force → physicalAttack, Endurance → defense. Critique /
    // agilité / dextérité NON branchés en combat V1 (affichage seul).
    // Mastery Effects V2 : un seul chargement pour les modificateurs permanents
    // (appliqués aux dérivées) ET le bonus contextuel de l'arme équipée.
    // weaponType résolu SERVEUR (jamais fourni par le client) ; formules et
    // clamps vivent dans le calculateur pur — rien de dupliqué ici.
    const weaponType = resolveEquippedWeaponType(character.equipment);
    const { statModifiers, combat: masteryCombat } =
      await this.masteryEffects.getMasteryBonuses(characterId, { weaponType });
    const derivedStatDefinitionsForAttack = await this.derivedStats.getDefinitions();
    const charStats = CharacterStatsCalculator.compute(
      character,
      derivedStatDefinitionsForAttack,
      aggregateEquipmentBonuses(character.equipment),
      // V5-F : stats secondaires d'équipement (flat) fusionnées avec les
      // modificateurs de maîtrise permanents (statModifiers). Alimente parade,
      // contre-attaque, critique, pénétration via le canal existant.
      mergeDerivedStatModifiers(
        statModifiers,
        aggregateEquipmentDerivedModifiers(character.equipment, derivedStatDefinitionsForAttack),
      ),
    );
    // Arrondi : les valeurs de combat restent entières (pattern existant —
    // planchers entiers de calculateCombatDamage, Math.round des dérivées).
    const effectiveAttack = Math.round(
      charStats.derived.physicalAttack * (1 + masteryCombat.damagePercent / 100) +
        masteryCombat.damageFlat,
    );

    const damageResult = resolveCombatHit({
      attacker: {
        attackPower: effectiveAttack,
        minimumAttack: 5,
        // V4-A : pénétration d'armure en % (stat dérivée serveur, inclut les
        // modificateurs de maîtrise permanents). 0 → inchangé.
        armorPenetrationPercent: charStats.derived.armorPenetrationPercent ?? 0,
        // V4-D : critique (bloc attaque) — stats dérivées serveur. 0 % → jamais.
        criticalChancePercent: charStats.derived.criticalChance ?? 0,
        criticalDamagePercent: charStats.derived.criticalDamage ?? 100,
        // V4-G : précision du joueur — réduit l'esquive effective de la créature
        // (V6-B3 : effectiveDodge = clamp(dodgeChance − accuracy, 0, 100)).
        accuracyPercent: charStats.derived.accuracy ?? 0,
      },
      defender: {
        defense: creatureStats.defenseTotal,
        // V6-B3 : la créature peut esquiver (dodgeChance dérivé/configuré).
        dodgeChancePercent: creatureStats.dodgeChance,
        // V6-B4 : blocage physique (après esquive/armure, géré par le calculateur).
        blockChancePercent: creatureStats.blockChance,
        blockReductionPercent: creatureStats.blockReductionPercent,
        // V6-B6 : parade (résolue en premier). Auto-attaque joueur = physique →
        // parable ; combinée à canParry créature (parryChance > 0).
        canParry:
          creatureStats.canParry &&
          isAttackParryable({ attackDefenseKind: 'physical', damageType: 'physical' }),
        parryChancePercent: creatureStats.parryChance,
      },
      damageType: 'physical',
      minimumDamage: 1,
      hpBefore: creature.health,
    });
    const damage = damageResult.finalDamage;

    creature.health = damageResult.hpAfter;
    if (creature.health === 0) {
      creature.state = 'dead';
      this.patrolStates.delete(creature.id);
      const delay = creature.respawnDelayMs ?? creature.spawn.respawnDelayMs ?? creature.spawn.template.respawnDelayMs;
      creature.respawnAt = new Date(Date.now() + delay);
      setTimeout(() => this.respawnCreature(creature.id), delay);
    }
    await this.creatureRepository.save(creature);

    // Transaction unique : Character XP (au kill) + Mastery XP (au hit).
    // characterId provient du paramètre, jamais du client.
    let loot: LootEntry[] | undefined;
    let characterXpUpdate: CharacterXpResult | undefined;
    let masteryUpdate: MasteryUpdatePayload | undefined;

    const masteryKey = this.resolveCombatMasteryKey(character);
    const masteryContext = masteryKey
      ? this.buildCombatMasteryXpContext(masteryKey, damage, character, template)
      : null;
    const masteryXpResult = masteryContext ? calculateMasteryXp(masteryContext) : null;

    const hasCharXp = creature.health === 0 && template.killCharacterXpReward > 0;

    if (hasCharXp || masteryXpResult) {
      try {
        const txResult = await this.dataSource.transaction(async (manager) => {
          let charXp: CharacterXpResult | undefined;
          if (hasCharXp) {
            charXp = await this.progression.applyCharacterXpInTx(
              characterId,
              template.killCharacterXpReward,
              ProgressionSource.COMBAT,
              manager,
            );
          }
          let masteryXp: MasteryUpdatePayload | undefined;
          if (masteryXpResult) {
            masteryXp = await this.masteriesService.applyMasteryXpInTx(
              characterId,
              masteryXpResult.masteryDefinitionKey,
              masteryXpResult.xpAmount,
              manager,
            );
          }
          return { charXp, masteryXp };
        });
        characterXpUpdate = txResult.charXp;
        masteryUpdate = txResult.masteryXp;
      } catch (err) {
        console.warn(`[CreaturesService] Récompenses ignorées pour ${characterId}: ${(err as Error).message}`);
      }
    }

    if (creature.health === 0) {
      const generated = this.loot.generateLoot(template.key, template.lootPool ?? null);
      if (generated.length > 0) loot = generated;
    }

    let riposte:
      | {
          damage: number;
          characterHealth: number;
          isDodged: boolean;
          isBlocked: boolean;
          blockedDamage: number;
          isParried: boolean;
        }
      | undefined;
    let counterAttack:
      | { damage: number; creatureHealth: number; killed: boolean; isCritical: boolean }
      | undefined;
    let creatureCounterAttack: CreatureCounterAttack | undefined;
    if (damageResult.isParried) {
      // V6-B7 : la créature a PARÉ le hit principal joueur → hit annulé (dégâts 0),
      // et la créature déclenche une CONTRE-ATTAQUE créature → joueur. Cette
      // réaction REMPLACE la riposte normale de ce tour (pas de double hit). Helper
      // partagé (mêmes gardes : créature vivante, joueur vivant, counterAttackPower > 0).
      creatureCounterAttack = await this.applyCreatureCounterAttack(
        creature,
        creatureStats,
        characterId,
        character.health,
        charStats.derived,
      );
    } else if ((creature.state === 'alive' || creature.state === 'fighting') && distance <= MELEE_RANGE_WU) {
      // Riposte : aucun plancher d'attaque (minimumAttack = 0), plancher dégâts 1.
      // V4-F : le joueur est le DÉFENSEUR → sa `dodgeChance` peut esquiver la
      // riposte (0 dégât, pas de mort). Roll serveur (Math.random).
      //
      // V4-I : le joueur peut aussi PARER la riposte (résolue AVANT l'esquive).
      // Éligibilité décidée ici (le calculateur ne lit jamais l'équipement) :
      // attaque créature = corps-à-corps de portée MELEE_RANGE_WU ; le joueur doit
      // avoir une arme de mêlée dont la portée couvre l'attaque entrante. Une arme
      // à distance seule ne pare pas.
      const defenderMeleeReachWU = resolveMeleeWeaponReachWU(character.equipment);
      const incomingAttackReachWU = MELEE_RANGE_WU; // attaque créature = mêlée
      // V6-B5 : parabilité de l'attaque entrante = nature défensive. La riposte
      // créature est physique (mêlée) → parable ; le gate reach reste la
      // condition côté défenseur. `existingCanParry && isAttackParryable(...)`.
      const defenderCanParry =
        defenderMeleeReachWU !== null &&
        defenderMeleeReachWU >= incomingAttackReachWU &&
        isAttackParryable({ attackDefenseKind: 'physical', damageType: 'physical' });

      const riposteResult = resolveCombatHit({
        attacker: {
          attackPower: creatureStats.attackPower,
          minimumAttack: 0,
          // V4-G : la créature (attaquant de la riposte) n'a pas de précision → 0.
          accuracyPercent: 0,
        },
        defender: {
          defense: charStats.derived.defense,
          // V4-F : le joueur défenseur peut esquiver la riposte.
          dodgeChancePercent: charStats.derived.dodgeChance ?? 0,
          // V4-H : et la bloquer (réduction des dégâts).
          blockChancePercent: charStats.derived.blockChance ?? 0,
          blockReductionPercent: charStats.derived.blockReductionPercent ?? 0,
          // V4-I : parade (résolue en premier, annule le hit) si éligible.
          parryChancePercent: charStats.derived.parryChance ?? 0,
          canParry: defenderCanParry,
        },
        minimumDamage: 1,
        hpBefore: character.health,
      });
      const riposteDamage = riposteResult.finalDamage;
      const characterHealth = riposteResult.hpAfter;
      await this.characterRepository.update(characterId, { health: characterHealth });
      riposte = {
        damage: riposteDamage,
        characterHealth,
        isDodged: riposteResult.isDodged,
        isBlocked: riposteResult.isBlocked,
        blockedDamage: riposteResult.blockedDamage,
        isParried: riposteResult.isParried,
      };
      if (characterHealth === 0) {
        // Mort du joueur pendant la riposte → si ce joueur ÉTAIT la cible de la
        // créature, elle l'abandonne explicitement AVANT le respawn (symétrie
        // avec le chemin passif applyCreatureHitToPlayer). Sans ce reset, la
        // créature resterait en poursuite jusqu'à ce que le repositionnement au
        // respawn / la leash la rompe (asymétrie de lifecycle). Le garde
        // `=== characterId` évite de casser une aggro sur un AUTRE joueur.
        const patrolState = this.patrolStates.get(creature.id);
        if (patrolState && patrolState.targetCharacterId === characterId) {
          patrolState.targetCharacterId = undefined;
        }
        if (this.server) {
          await this.worldService.respawnCharacter(characterId, this.server);
        }
      }

      // V4-I : parade réussie → hit entrant annulé (déjà 0 via le calculateur) et
      // CONTRE-ATTAQUE serveur joueur → créature. La contre-attaque n'autorise
      // JAMAIS une parade en retour (defenderCanParry: false) : pas de chaîne.
      if (riposteResult.isParried && (creature.state === 'alive' || creature.state === 'fighting')) {
        const counterResult = resolveCombatHit({
          attacker: {
            attackPower: charStats.derived.counterAttackPower ?? 0,
            minimumAttack: 0,
            armorPenetrationPercent: charStats.derived.armorPenetrationPercent ?? 0,
            criticalChancePercent: charStats.derived.criticalChance ?? 0,
            criticalDamagePercent: charStats.derived.criticalDamage ?? 100,
            accuracyPercent: charStats.derived.accuracy ?? 0,
          },
          defender: {
            // Créature défenseur : V6-B3 esquive + V6-B4 blocage + V6-B6 parade actifs.
            defense: creatureStats.defenseTotal,
            dodgeChancePercent: creatureStats.dodgeChance,
            blockChancePercent: creatureStats.blockChance,
            blockReductionPercent: creatureStats.blockReductionPercent,
            // Contre-attaque joueur = physique → parable ; combinée à canParry créature.
            canParry:
              creatureStats.canParry &&
              isAttackParryable({ attackDefenseKind: 'physical', damageType: 'physical' }),
            parryChancePercent: creatureStats.parryChance,
          },
          damageType: 'physical',
          minimumDamage: 1,
          hpBefore: creature.health,
        });
        creature.health = counterResult.hpAfter;
        const counterKilled = creature.health === 0;
        if (counterKilled) {
          // Réutilise EXACTEMENT la mécanique de mort du hit principal (état,
          // désinscription patrouille, planification du respawn) + loot/XP kill.
          creature.state = 'dead';
          this.patrolStates.delete(creature.id);
          const delay =
            creature.respawnDelayMs ??
            creature.spawn.respawnDelayMs ??
            creature.spawn.template.respawnDelayMs;
          creature.respawnAt = new Date(Date.now() + delay);
          setTimeout(() => this.respawnCreature(creature.id), delay);
          const generated = this.loot.generateLoot(template.key, template.lootPool ?? null);
          if (generated.length > 0) loot = generated;
          if (template.killCharacterXpReward > 0) {
            try {
              characterXpUpdate = await this.dataSource.transaction((manager) =>
                this.progression.applyCharacterXpInTx(
                  characterId,
                  template.killCharacterXpReward,
                  ProgressionSource.COMBAT,
                  manager,
                ),
              );
            } catch (err) {
              console.warn(
                `[CreaturesService] XP contre-attaque ignorée pour ${characterId}: ${(err as Error).message}`,
              );
            }
          }
        }
        await this.creatureRepository.save(creature);
        counterAttack = {
          damage: counterResult.finalDamage,
          creatureHealth: creature.health,
          killed: counterKilled,
          isCritical: counterResult.isCritical,
        };
      }
    }

    // `killed` = la mort causée par le HIT PRINCIPAL uniquement (jamais par la
    // contre-attaque, qui a son propre `counterAttack.killed`). On lit donc
    // `damageResult.hpAfter` et non `creature.health` (modifiée par la contre-attaque).
    return { success: true, dto: this.toDto(creature), damage, attackerId: character.id, isCritical: damageResult.isCritical, killed: damageResult.hpAfter === 0, isDodged: damageResult.isDodged, isBlocked: damageResult.isBlocked, blockedDamage: damageResult.blockedDamage, isParried: damageResult.isParried, riposte, counterAttack, creatureCounterAttack, loot, characterXpUpdate, masteryUpdate };
  }

  /**
   * Applique des dégâts de skill (Skills V1-D) à une créature.
   *
   * Point d'entrée réutilisé par le cast de skill : la logique métier du skill
   * (skill valide, cooldown, coût, stats, `calculateSkillEffect`) vit dans
   * `SkillCastService`. Cette méthode ne s'occupe QUE du côté créature —
   * validations créature (vivante, même map, portée) puis application des
   * dégâts, mort/respawn, XP personnage de kill et loot — en réutilisant
   * exactement le pipeline de `attack()`.
   *
   * Différences volontaires avec `attack()` :
   *   - `rawAmount` est fourni par l'appelant (déjà calculé serveur), pas dérivé
   *     de l'arme ;
   *   - la défense de la créature est appliquée via `calculateCombatDamage`
   *     (`minimumAttack: 0` — le skill a déjà produit son montant ;
   *     `minimumDamage: 1` — même plancher que le combat) ;
   *   - pas de cooldown d'auto-attaque, pas de riposte, pas d'XP mastery en V1-D.
   *
   * `attackerPosition` provient de l'état runtime live serveur (jamais du client).
   */
  async applySkillDamage(
    creatureId: string,
    characterId: string,
    attackerPosition: { worldX: number; worldY: number; mapId: number },
    rawAmount: number,
    rangeWU: number,
    // V4-A : pénétration d'armure en % de l'attaquant (déjà calculée serveur par
    // l'appelant depuis `stats.derived`). Défaut 0 → comportement inchangé.
    armorPenetrationPercent = 0,
    // V4-C : type de dégâts du skill (`physical` par défaut applique l'armure ;
    // `raw` l'ignore). Fourni par l'appelant depuis `skill.damageType`.
    damageType: DamageType = 'physical',
    // V4-D : critique (bloc attaque) — stats dérivées serveur du lanceur.
    // 0 % → jamais de critique. Roll serveur par défaut (Math.random).
    criticalChancePercent = 0,
    criticalDamagePercent = 100,
    // V4-G : précision du lanceur — réduit l'esquive effective de la créature
    // (V6-B3 : effectiveDodge = clamp(dodgeChance − accuracy, 0, 100)). Défaut 0.
    attackerAccuracyPercent = 0,
    // V6-B6 : nature défensive du skill (`skill.attackDefenseKind`) — décide la
    // parabilité avec `damageType`. Défaut 'physical' (rétrocompatible).
    attackerAttackDefenseKind: SkillAttackDefenseKind = 'physical',
    // Lot A/B : flags défensifs SERVEUR du skill (`skill.canBe*`, jamais du client).
    // Objet d'options (évite d'allonger la signature). Defaults SÛRS si absent :
    // esquive/blocage autorisés, parade DÉSACTIVÉE (skills non parables par défaut).
    defensiveFlags: {
      canBeDodged?: boolean;
      canBeBlocked?: boolean;
      canBeParried?: boolean;
    } = {},
    // ADR-0022 : école magique du skill (`skill.magicSchool`) — obligatoire pour
    // un skill `damageType: 'magic'` (aucun fallback). Sert à résoudre la
    // résistance magique effective de la cible. null/absent pour physical/raw.
    attackerMagicSchool: MagicSchool | null = null,
  ): Promise<AttackResult> {
    const creature = this.liveCreatures.get(creatureId);
    if (!creature) return { success: false, error: 'Creature not found' };
    if (creature.state === 'dead') return { success: false, error: 'Creature already dead' };
    if (creature.worldX == null || creature.worldY == null) {
      return { success: false, error: 'Target out of range' };
    }
    if (creature.mapId != null && attackerPosition.mapId !== creature.mapId) {
      return { success: false, error: 'Target out of range' };
    }
    const distance = chebyshevDistanceWU(attackerPosition, {
      worldX: creature.worldX,
      worldY: creature.worldY,
    });
    if (distance > rangeWU) return { success: false, error: 'Target out of range' };

    const { template } = creature.spawn;

    // Défense créature dérivée (même source que le combat), appliquée au montant
    // de skill déjà calculé serveur.
    // Créature défenseur (point unique V6-A Lot 2) : seule defenseTotal s'applique.
    const creatureStats = this.creatureCombatStats(creature, template);

    // Lot A/B : flags défensifs SERVEUR du skill (defaults sûrs si non fournis).
    // PROTECTION RUNTIME : un skill à dégâts `magic` n'est JAMAIS esquivé, même si
    // une ligne héritée incohérente a `canBeDodged: true` (helper centralisé).
    const canBeDodged = resolveEffectiveCanBeDodged(damageType, defensiveFlags.canBeDodged);
    const canBeBlocked = defensiveFlags.canBeBlocked ?? true;
    const canBeParried = defensiveFlags.canBeParried ?? false;

    // ── Résistance magique effective de la CIBLE (ADR-0022) : résolue AU MOMENT
    // du hit via le pipeline générique (jamais snapshottée au cast). Un skill
    // `magic` exige une école (aucun fallback global-only) — rejet explicite.
    let defenderEffectiveMagicResistance = 0;
    if (damageType === 'magic') {
      if (!attackerMagicSchool) {
        return { success: false, error: 'Magic skill requires a magic school' };
      }
      defenderEffectiveMagicResistance = await this.resolveCreatureEffectiveMagicResistance(
        template,
        attackerMagicSchool,
      );
    }

    const damageResult = resolveCombatHit({
      attacker: {
        attackPower: Math.max(0, rawAmount),
        minimumAttack: 0,
        armorPenetrationPercent,
        criticalChancePercent,
        criticalDamagePercent,
        accuracyPercent: attackerAccuracyPercent,
      },
      defender: {
        defense: creatureStats.defenseTotal,
        // V6-B3 : esquive créature — désactivée si le skill n'est pas esquivable.
        dodgeChancePercent: canBeDodged ? creatureStats.dodgeChance : 0,
        // V6-B4 : blocage physique — désactivé si le skill n'est pas bloquable
        // (raw ignore déjà le blocage côté calculateur quand il touche).
        blockChancePercent: canBeBlocked ? creatureStats.blockChance : 0,
        blockReductionPercent: canBeBlocked ? creatureStats.blockReductionPercent : 0,
        // V6-B6 + Lot B : parade seulement si le skill est parable (canBeParried),
        // que la créature peut parer, ET que la nature le permet (magic/… non
        // parable via isAttackParryable). raw physique reste parable si canBeParried.
        canParry:
          canBeParried &&
          creatureStats.canParry &&
          isAttackParryable({ attackDefenseKind: attackerAttackDefenseKind, damageType }),
        parryChancePercent: canBeParried ? creatureStats.parryChance : 0,
        // ADR-0022 : consommée uniquement si damageType === 'magic'.
        effectiveMagicResistance: defenderEffectiveMagicResistance,
      },
      damageType,
      minimumDamage: 1,
      hpBefore: creature.health,
    });
    const damage = damageResult.finalDamage;

    creature.health = damageResult.hpAfter;
    if (creature.health === 0) {
      creature.state = 'dead';
      this.patrolStates.delete(creature.id);
      const delay = creature.respawnDelayMs ?? creature.spawn.respawnDelayMs ?? creature.spawn.template.respawnDelayMs;
      creature.respawnAt = new Date(Date.now() + delay);
      setTimeout(() => this.respawnCreature(creature.id), delay);
    }
    await this.creatureRepository.save(creature);

    // XP personnage de kill uniquement (pas d'XP mastery en V1-D).
    let characterXpUpdate: CharacterXpResult | undefined;
    if (creature.health === 0 && template.killCharacterXpReward > 0) {
      try {
        characterXpUpdate = await this.dataSource.transaction((manager) =>
          this.progression.applyCharacterXpInTx(
            characterId,
            template.killCharacterXpReward,
            ProgressionSource.COMBAT,
            manager,
          ),
        );
      } catch (err) {
        console.warn(`[CreaturesService] XP skill ignorée pour ${characterId}: ${(err as Error).message}`);
      }
    }

    let loot: LootEntry[] | undefined;
    if (creature.health === 0) {
      const generated = this.loot.generateLoot(template.key, template.lootPool ?? null);
      if (generated.length > 0) loot = generated;
    }

    // V6-B7 : la créature a PARÉ le skill joueur → CONTRE-ATTAQUE créature → joueur
    // (uniquement sur parade : magic non parable → jamais paré ; raw physique reste
    // parable via isParried). Le lanceur (défenseur) n'étant pas chargé ici, on le
    // charge et on recompute ses dérivées serveur (pattern applyCreatureHitToPlayer),
    // puis on délègue au helper partagé (mêmes gardes que l'auto-attaque).
    let creatureCounterAttack: CreatureCounterAttack | undefined;
    if (damageResult.isParried && creatureStats.counterAttackPower > 0) {
      const char = await this.characterRepository.findOne({
        where: { id: characterId },
        relations: ['equipment', 'equipment.item'],
      });
      if (char && char.health > 0) {
        const derivedStatDefinitions = await this.derivedStats.getDefinitions();
        const charDerived = CharacterStatsCalculator.compute(
          char,
          derivedStatDefinitions,
          aggregateEquipmentBonuses(char.equipment),
          mergeDerivedStatModifiers(
            await this.masteryEffects.getPermanentStatModifiers(char.id),
            aggregateEquipmentDerivedModifiers(char.equipment, derivedStatDefinitions),
          ),
        ).derived;
        creatureCounterAttack = await this.applyCreatureCounterAttack(
          creature,
          creatureStats,
          characterId,
          char.health,
          charDerived,
        );
      }
    }

    return { success: true, dto: this.toDto(creature), damage, attackerId: characterId, isCritical: damageResult.isCritical, killed: creature.health === 0, isDodged: damageResult.isDodged, isBlocked: damageResult.isBlocked, blockedDamage: damageResult.blockedDamage, isParried: damageResult.isParried, creatureCounterAttack, loot, characterXpUpdate };
  }

  private resolveCombatMasteryKey(character: Character): string | null {
    // WeaponType résolu par le helper partagé (characters/equipped-weapon.helper)
    // — même source que les effets de maîtrise V1-D-B et le futur cast de skill.
    const weaponType = resolveEquippedWeaponType(character.equipment);
    if (!weaponType) return null;
    return COMBAT_WEAPON_MASTERY_MAP[weaponType] ?? null;
  }

  private buildCombatMasteryXpContext(
    masteryKey: string,
    damage: number,
    character: Character,
    template: CreatureTemplate,
  ): MasteryXpContext {
    return {
      masteryDefinitionKey: masteryKey,
      domain: 'combat' as MasteryDomain,
      action: 'attack_hit',
      success: true,
      // Lot 2 : difficulté = puissance runtime réelle → PV max effectif (base + Vitalité).
      difficulty: Math.max(1, Math.round(this.resolveCreatureMaxHealth(template) / 10)),
      quality: null,
      characterLevel: character.level ?? 1,
      masteryLevel: 1,
      duration: null,
      damage,
      blockedDamage: null,
      healedAmount: null,
      buffs: [],
      debuffs: [],
    };
  }

  // Portée effective : déléguée au helper serveur unique (partagé avec la
  // projection /characters/me). Aucune règle de portée dupliquée ici.
  private resolveAttackRange(character: Character): number {
    return resolveEffectiveAttackRangeWU(character.equipment);
  }

  // -------------------------------------------------------------------------
  // Seed — données initiales (exécuté une seule fois par entrée absente)
  // -------------------------------------------------------------------------

  private readonly TEMPLATE_LOOT_POOLS: Record<string, any[]> = {
    turkey: [{ itemId: 'wooden_stick', minQty: 1, maxQty: 2, probability: 0.8 }],
    goblin: [{ itemId: 'iron_ore', minQty: 1, maxQty: 1, probability: 0.5 }],
  };

  private async seedTemplates() {
    await this.templateRepository
      .createQueryBuilder()
      .insert()
      .values([
        {
          key: 'turkey',
          name: 'Turkey',
          textureKey: 'turkey',
          baseHealth: 30,
          baseArmor: 2,
          baseAttack: 5,
          patrolRadius: 200,
          speedMin: 25,
          speedMax: 60,
          pauseMinMs: 2000,
          pauseMaxMs: 12000,
          aggroRadius: 50,
          fleeThresholdPct: 75,
          respawnDelayMs: 20000,
        },
        {
          key: 'goblin',
          name: 'Goblin',
          textureKey: 'turkey', // placeholder jusqu'à l'import du sprite goblin
          baseHealth: 60,
          baseArmor: 5,
          baseAttack: 12,
          patrolRadius: 150,
          speedMin: 40,
          speedMax: 80,
          pauseMinMs: 1000,
          pauseMaxMs: 6000,
          aggroRadius: 120,
          fleeThresholdPct: 20,
          respawnDelayMs: 30000,
        },
      ])
      .orIgnore()
      .execute();

    // Backfill lootPool pour les templates déjà existants (null après ajout de colonne).
    const templates = await this.templateRepository.find({
      where: [{ key: 'turkey' }, { key: 'goblin' }],
    });
    for (const t of templates) {
      if (t.lootPool === null && this.TEMPLATE_LOOT_POOLS[t.key]) {
        await this.templateRepository.update(t.id, {
          lootPool: this.TEMPLATE_LOOT_POOLS[t.key],
        });
      }
    }
  }

  async createAdminSpawn(
    templateKey: string,
    worldX: number,
    worldY: number,
  ): Promise<CreatureDto | null> {
    const template = await this.templateRepository.findOne({
      where: { key: templateKey },
    });
    if (!template) return null;

    const targetWorldX = Math.round(worldX);
    const targetWorldY = Math.round(worldY);

    const spawnKey = `admin-${templateKey}-${Date.now()}`;
    const spawn = await this.spawnRepository.save(
      this.spawnRepository.create({
        key: spawnKey,
        template,
        worldX: targetWorldX,
        worldY: targetWorldY,
        mapId: DEFAULT_MAP_ID,
        respawnDelayMs: 30000,
      }),
    );

    const rawCreature = await this.creatureRepository.save(
      this.creatureRepository.create({
        spawn,
        worldX: targetWorldX,
        worldY: targetWorldY,
        mapId: DEFAULT_MAP_ID,
        // Lot 2 : nouvelle créature créée aux PV max effectifs.
        health: this.resolveCreatureMaxHealth(template),
        state: 'alive',
      }),
    );

    // Recharger avec les relations eager (spawn.template)
    const creature = await this.creatureRepository.findOne({
      where: { id: rawCreature.id },
    });
    if (!creature) return null;

    this.liveCreatures.set(creature.id, creature);
    return this.toDto(creature);
  }

  refreshTemplateInMemory(key: string, fields: Partial<Record<string, unknown>>): void {
    // Une SOURCE du PV max (baseHealth/vitality) peut changer → invalider le
    // snapshot AVANT de recalculer le nouveau max pour le clamp.
    this.invalidateMaxHealthCache(key);
    for (const creature of this.liveCreatures.values()) {
      if (creature.spawn?.template?.key === key) {
        Object.assign(creature.spawn.template, fields);
        // Lot 2 : recalibrer les PV si le PV max EFFECTIF diminue (baseHealth OU
        // Vitalité modifiés). Baisse → clamp immédiat ; hausse → PV inchangés (pas
        // de soin automatique). En mémoire : la persistance suivra au prochain save.
        // La 1re lecture ci-dessous recalcule et re-mémoïse le snapshot du template.
        const newMax = this.resolveCreatureMaxHealth(creature.spawn.template);
        if (creature.health > newMax) {
          creature.health = newMax;
        }
      }
    }
  }

  async adminDeleteCreature(id: string): Promise<CreatureDto | null> {
    const creature = this.liveCreatures.get(id);
    if (!creature) return null;

    const dto = this.toDto(creature);
    const spawnId = creature.spawn?.id;
    const spawnKey = creature.spawn?.key ?? '';

    this.liveCreatures.delete(id);
    this.patrolStates.delete(id);

    // Supprimer la ligne Creature — le startup ne pourra plus la ressusciter
    await this.creatureRepository.delete(id);

    // Supprimer aussi le spawn si créé par admin (pas de seed à conserver)
    if (spawnKey.startsWith('admin-') && spawnId) {
      await this.spawnRepository.delete(spawnId);
    }

    return dto;
  }

  async adminUpdateCreature(
    id: string,
    fields: Partial<{ health: number; worldX: number; worldY: number; state: string; respawnDelayMs: number | null }>,
  ): Promise<CreatureDto | null> {
    const creature = this.liveCreatures.get(id);
    if (!creature) return null;

    // Lot 2 : clamp SERVEUR de la valeur admin (non fiable) au PV max effectif.
    const adminMaxHealth = this.resolveCreatureMaxHealth(creature.spawn.template);
    if (fields.health !== undefined) {
      creature.health = Math.max(0, Math.min(fields.health, adminMaxHealth));
    }
    if (fields.state !== undefined) {
      creature.state = fields.state as Creature['state'];
      if (fields.state === 'alive') {
        creature.health = adminMaxHealth;
      }
    }

    if (fields.worldX !== undefined || fields.worldY !== undefined) {
      this.patrolStates.delete(id);
      if (fields.worldX !== undefined) creature.worldX = Math.round(fields.worldX);
      if (fields.worldY !== undefined) creature.worldY = Math.round(fields.worldY);
      creature.mapId = DEFAULT_MAP_ID;
    }

    // 0 → null (hérite du spawn/template)
    if ('respawnDelayMs' in fields) {
      creature.respawnDelayMs = (fields.respawnDelayMs != null && fields.respawnDelayMs > 0) ? fields.respawnDelayMs : null;
    }

    await this.creatureRepository.save(creature);

    const dto = this.toDto(creature);
    if (this.server) this.server.to(getMapRoomId(creature.mapId ?? DEFAULT_MAP_ID)).emit('creature_update', dto);
    return dto;
  }

  async moveCreature(creatureId: string, worldX: number, worldY: number): Promise<CreatureDto | null> {
    const creature = this.liveCreatures.get(creatureId);
    if (!creature || creature.state === 'dead') return null;

    creature.worldX = Math.round(worldX);
    creature.worldY = Math.round(worldY);
    creature.mapId = DEFAULT_MAP_ID;
    this.patrolStates.delete(creatureId);

    await this.creatureRepository.update(creatureId, { worldX: creature.worldX, worldY: creature.worldY, mapId: creature.mapId });

    if (this.server) {
      this.server.to(getMapRoomId(creature.mapId ?? DEFAULT_MAP_ID)).emit('creature_update', this.toDto(creature));
    }
    return this.toDto(creature);
  }

  async forceRespawnAll(templateKey: string): Promise<number> {
    let count = 0;
    for (const creature of this.liveCreatures.values()) {
      if (creature.spawn?.template?.key !== templateKey) continue;

      const { template } = creature.spawn;
      // Lot 2 : force-respawn admin aux PV max effectifs (base + Vitalité).
      const maxHealth = this.resolveCreatureMaxHealth(template);
      creature.state = 'alive';
      creature.health = maxHealth;
      if (creature.spawn.worldX == null || creature.spawn.worldY == null || creature.spawn.mapId == null) continue;
      creature.worldX = creature.spawn.worldX;
      creature.worldY = creature.spawn.worldY;
      creature.mapId = creature.spawn.mapId;

      this.patrolStates.delete(creature.id);
      this.lastCreatureAutoAttackAt.delete(creature.id);
      this.creatureSkillCooldowns.delete(creature.id);

      await this.creatureRepository.update(creature.id, {
        state: 'alive',
        health: maxHealth,
        worldX: creature.worldX,
        worldY: creature.worldY,
        mapId: creature.mapId,
      });

      if (this.server) {
        this.server.to(getMapRoomId(creature.mapId ?? DEFAULT_MAP_ID)).emit('creature_update', this.toDto(creature));
      }
      count++;
    }
    return count;
  }

  private async seedSpawns() {
    const template = await this.templateRepository.findOne({ where: { key: 'turkey' } });
    if (!template) return;

    const existing = await this.spawnRepository.findOne({ where: { key: 'turkey_spawn_1' } });
    if (existing) {
      if (existing.respawnDelayMs !== 20000) {
        await this.spawnRepository.update(existing.id, { respawnDelayMs: 20000 });
      }
      return;
    }

    const turkeySpawnWU = this.pixelToWUSafe(600, 580);
    await this.spawnRepository.save(
      this.spawnRepository.create({
        key: 'turkey_spawn_1',
        template,
        respawnDelayMs: 20000,
        ...(turkeySpawnWU ?? {}),
      }),
    );
  }

  private async seedInstances() {
    const spawns = await this.spawnRepository.find();

    for (const spawn of spawns) {
      const existing = await this.creatureRepository.findOne({
        where: { spawn: { id: spawn.id } },
      });
      if (existing) continue;

      if (spawn.worldX == null || spawn.worldY == null || spawn.mapId == null) continue;
      await this.creatureRepository.save(
        this.creatureRepository.create({
          spawn,
          worldX: spawn.worldX,
          worldY: spawn.worldY,
          mapId: spawn.mapId,
          // Lot 2 : instance seedée aux PV max effectifs (base + Vitalité).
          health: this.resolveCreatureMaxHealth(spawn.template),
          state: 'alive',
        }),
      );
    }
  }
}
