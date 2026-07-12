import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Server } from 'socket.io';
import { Creature } from './entities/creature.entity';
import { CreatureTemplate } from './entities/creature-template.entity';
import { CreatureSpawn } from './entities/creature-spawn.entity';
import { Character } from '../characters/entities/character.entity';
import { CharacterStatsCalculator } from '../characters/character-stats-calculator';
import { aggregateEquipmentBonuses } from '../characters/equipment-stats.helper';
import { resolveEffectiveAttackRangeWU, MELEE_RANGE_WU } from '../characters/attack-range.helper';
import { resolveEquippedWeaponType } from '../characters/equipped-weapon.helper';
import { calculateCombatDamage, DamageType } from './combat-damage.calculator';
import { makeCombatEvent, COMBAT_EVENT } from './combat-event';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { EquipmentSlot } from '../characters/dto/equip-item.dto';
import { CreatureDto, CreatureRuntimeStats } from './dto/creature.dto';
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
import { RuntimeComputeEngine } from '../player-runtime/runtime-compute';
import { RuntimeDebugRegistry } from '../player-runtime/debug-modifier.registry';
import { CreatureDerivedStats } from '../creature-runtime/creature-runtime.types';
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


type PatrolState = {
  dirX: number;
  dirY: number;
  speed: number;
  moveUntil: number;
  pauseUntil: number;
  targetCharacterId?: string;
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
  riposte?: { damage: number; characterHealth: number; isDodged: boolean };
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
  private readonly lastAttackAt = new Map<string, number>();
  private readonly lastCreatureAutoAttackAt = new Map<string, number>();
  private readonly liveCreatures = new Map<string, Creature>();
  private readonly patrolStates = new Map<string, PatrolState>();
  private server: Server | null = null;

  constructor(
    @InjectRepository(Creature)
    private readonly creatureRepository: Repository<Creature>,
    @InjectRepository(CreatureTemplate)
    private readonly templateRepository: Repository<CreatureTemplate>,
    @InjectRepository(CreatureSpawn)
    private readonly spawnRepository: Repository<CreatureSpawn>,
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
  ) {}

  async onModuleInit() {
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
          a.health = a.spawn.template.baseHealth;
          a.respawnAt = null;
          if (a.spawn.worldX == null || a.spawn.worldY == null || a.spawn.mapId == null) continue;
          a.worldX = a.spawn.worldX;
          a.worldY = a.spawn.worldY;
          a.mapId = a.spawn.mapId;
          await this.creatureRepository.save(a);
          this.liveCreatures.set(a.id, a);
        }
      } else {
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
    let runtimeStats: CreatureRuntimeStats | undefined;
    if (t) {
      const base = CreatureRuntimeCalculator.calculateBaseStats(creature, t);
      const debugMods = this.debugRegistry.getModifiers(creature.id);
      runtimeStats = RuntimeComputeEngine.compute<CreatureDerivedStats>(
        CREATURE_STAT_KEYS,
        (stat) => CREATURE_DERIVED_BASE[stat as CreatureStatKey](base),
        debugMods,
      );
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
      maxHealth: t.baseHealth,
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
      const hpPct = (creature.health / template.baseHealth) * 100;

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

    // Auto-attaque
    const lastAtk = this.lastCreatureAutoAttackAt.get(creature.id) ?? 0;
    if (dist <= MELEE_RANGE_WU && now - lastAtk >= AUTO_ATTACK_COOLDOWN_MS) {
      this.lastCreatureAutoAttackAt.set(creature.id, now);
      const char = await this.characterRepository.findOne({
        where: { id: target.characterId },
        relations: ['equipment', 'equipment.item'],
      });
      if (char && char.health > 0) {
        // Défense dérivée serveur (Endurance incluse + bonus d'équipement et
        // modificateurs de maîtrise permanents), jamais la colonne brute.
        const derivedStatDefinitions = await this.derivedStats.getDefinitions();
        const charDefense = CharacterStatsCalculator.compute(
          char,
          derivedStatDefinitions,
          aggregateEquipmentBonuses(char.equipment),
          await this.masteryEffects.getPermanentStatModifiers(char.id),
        ).derived.defense;
        const dmg = Math.max(template.baseAttack - charDefense, 1);
        const newHealth = Math.max(char.health - dmg, 0);
        await this.characterRepository.update(char.id, { health: newHealth });
        server.to(target.socketId).emit('character_damaged', {
          characterId: char.id,
          damage: dmg,
          health: newHealth,
        });
        // Combat Event V1 : auto-attaque créature → joueur (room map).
        // Position = état runtime live du joueur (`target`), jamais la ligne DB
        // (`char`) qui est la position persistée (respawn / dernière sauvegarde).
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
        }));
        if (newHealth === 0) {
          await this.worldService.respawnCharacter(char.id, server);
          // Cible tuée → abandon immédiat (évite de chasser le joueur respawné)
          await this.changeCreatureState(creature, 'alive');
          state.targetCharacterId = undefined;
        }
      }
    }
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
    creature.state = 'alive';
    creature.health = template.baseHealth;
    creature.respawnAt = null;
    if (creature.spawn.worldX == null || creature.spawn.worldY == null || creature.spawn.mapId == null) return;
    creature.worldX = creature.spawn.worldX;
    creature.worldY = creature.spawn.worldY;
    creature.mapId = creature.spawn.mapId;

    await this.creatureRepository.update(id, {
      state: 'alive',
      health: template.baseHealth,
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

    // Calcul runtime synchrone depuis la mémoire — aucun appel DB, aucun async.
    // debugMods=[] par défaut (pas de registre debug creature en production).
    const base = CreatureRuntimeCalculator.calculateBaseStats(creature, template);
    const debugMods = this.debugRegistry.getModifiers(creature.id);
    const derived = RuntimeComputeEngine.compute<CreatureDerivedStats>(
      CREATURE_STAT_KEYS,
      (stat) => CREATURE_DERIVED_BASE[stat as CreatureStatKey](base),
      debugMods,
    );

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
      statModifiers,
    );
    // Arrondi : les valeurs de combat restent entières (pattern existant —
    // planchers entiers de calculateCombatDamage, Math.round des dérivées).
    const effectiveAttack = Math.round(
      charStats.derived.physicalAttack * (1 + masteryCombat.damagePercent / 100) +
        masteryCombat.damageFlat,
    );

    const damageResult = calculateCombatDamage({
      attackerValue: effectiveAttack,
      targetDefense: derived.defenseTotal,
      // V4-A : pénétration d'armure en % de l'attaquant (stat dérivée serveur,
      // inclut les modificateurs de maîtrise permanents). 0 → inchangé.
      armorPenetrationPercent: charStats.derived.armorPenetrationPercent ?? 0,
      damageType: 'physical',
      // V4-D : critique (bloc attaque) — stats dérivées serveur. Roll serveur
      // par défaut (Math.random). 0 % → jamais de critique, historique inchangé.
      criticalChancePercent: charStats.derived.criticalChance ?? 0,
      criticalDamagePercent: charStats.derived.criticalDamage ?? 100,
      // V4-G : précision du joueur (attaquant). Le défenseur est la créature
      // (pas de dodgeChance) → aucune esquive à réduire ; inchangé aujourd'hui.
      attackerAccuracyPercent: charStats.derived.accuracy ?? 0,
      defenderDodgeChancePercent: 0,
      minimumAttack: 5,
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

    let riposte: { damage: number; characterHealth: number; isDodged: boolean } | undefined;
    if ((creature.state === 'alive' || creature.state === 'fighting') && distance <= MELEE_RANGE_WU) {
      // Riposte : aucun plancher d'attaque (minimumAttack = 0), plancher dégâts 1.
      // V4-F : le joueur est le DÉFENSEUR → sa `dodgeChance` peut esquiver la
      // riposte (0 dégât, pas de mort). Roll serveur (Math.random).
      const riposteResult = calculateCombatDamage({
        attackerValue: derived.attackPower,
        targetDefense: charStats.derived.defense,
        defenderDodgeChancePercent: charStats.derived.dodgeChance ?? 0,
        // V4-G : la créature (attaquant de la riposte) n'a pas de précision → 0.
        // Le joueur défenseur esquive comme en V4-F (comportement identique).
        attackerAccuracyPercent: 0,
        minimumAttack: 0,
        minimumDamage: 1,
        hpBefore: character.health,
      });
      const riposteDamage = riposteResult.finalDamage;
      const characterHealth = riposteResult.hpAfter;
      await this.characterRepository.update(characterId, { health: characterHealth });
      riposte = { damage: riposteDamage, characterHealth, isDodged: riposteResult.isDodged };
      if (characterHealth === 0 && this.server) {
        await this.worldService.respawnCharacter(characterId, this.server);
      }
    }

    return { success: true, dto: this.toDto(creature), damage, attackerId: character.id, isCritical: damageResult.isCritical, killed: creature.health === 0, isDodged: damageResult.isDodged, riposte, loot, characterXpUpdate, masteryUpdate };
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
    // V4-G : précision du lanceur (réduit l'esquive du défenseur). Le défenseur
    // est la créature (pas de dodgeChance) → sans effet aujourd'hui. Défaut 0.
    attackerAccuracyPercent = 0,
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
    const base = CreatureRuntimeCalculator.calculateBaseStats(creature, template);
    const debugMods = this.debugRegistry.getModifiers(creature.id);
    const derived = RuntimeComputeEngine.compute<CreatureDerivedStats>(
      CREATURE_STAT_KEYS,
      (stat) => CREATURE_DERIVED_BASE[stat as CreatureStatKey](base),
      debugMods,
    );

    const damageResult = calculateCombatDamage({
      attackerValue: Math.max(0, rawAmount),
      targetDefense: derived.defenseTotal,
      armorPenetrationPercent,
      damageType,
      criticalChancePercent,
      criticalDamagePercent,
      attackerAccuracyPercent,
      defenderDodgeChancePercent: 0,
      minimumAttack: 0,
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

    return { success: true, dto: this.toDto(creature), damage, attackerId: characterId, isCritical: damageResult.isCritical, killed: creature.health === 0, isDodged: damageResult.isDodged, loot, characterXpUpdate };
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
      difficulty: Math.max(1, Math.round(template.baseHealth / 10)),
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
        health: template.baseHealth,
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
    for (const creature of this.liveCreatures.values()) {
      if (creature.spawn?.template?.key === key) {
        Object.assign(creature.spawn.template, fields);
        // Recalibrer les HP si baseHealth diminue sous le HP actuel
        const newMax = (creature.spawn.template as any).baseHealth;
        if (newMax !== undefined && creature.health > newMax) {
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

    if (fields.health !== undefined) {
      creature.health = Math.max(0, Math.min(fields.health, creature.spawn.template.baseHealth));
    }
    if (fields.state !== undefined) {
      creature.state = fields.state as Creature['state'];
      if (fields.state === 'alive') {
        creature.health = creature.spawn.template.baseHealth;
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
      creature.state = 'alive';
      creature.health = template.baseHealth;
      if (creature.spawn.worldX == null || creature.spawn.worldY == null || creature.spawn.mapId == null) continue;
      creature.worldX = creature.spawn.worldX;
      creature.worldY = creature.spawn.worldY;
      creature.mapId = creature.spawn.mapId;

      this.patrolStates.delete(creature.id);
      this.lastCreatureAutoAttackAt.delete(creature.id);

      await this.creatureRepository.update(creature.id, {
        state: 'alive',
        health: template.baseHealth,
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
          health: spawn.template.baseHealth,
          state: 'alive',
        }),
      );
    }
  }
}
