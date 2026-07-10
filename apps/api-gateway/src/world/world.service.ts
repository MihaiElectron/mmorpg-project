// apps/api-gateway/src/world/world.service.ts

import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { WorldSocket } from '../types/world-socket';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server } from 'socket.io';
import { ADMIN_ROOM } from '../common/socket-rooms';

export type AdminCharacterDirtyReason =
  | 'equipment'
  | 'stats'
  | 'inventory'
  | 'wallet'
  | 'unknown';
import { Character } from '../characters/entities/character.entity';
import { CharacterStatsCalculator } from '../characters/character-stats-calculator';
import { aggregateEquipmentBonuses } from '../characters/equipment-stats.helper';
import { DerivedStatsService } from '../derived-stats/derived-stats.service';
import { RespawnPoint } from './entities/respawn-point.entity';
import {
  wuToIsoScreenX,
  wuToIsoScreenY,
  isoScreenToWorldWU,
  chebyshevDistanceWU,
  wuToChunkIndex,
  DEFAULT_MAP_ID,
} from '../common/world-coordinates';

export type ConnectedPlayer = {
  socketId: string;
  characterId: string;
  name: string;
  sex?: string;
  worldX: number;
  worldY: number;
  mapId: number;
  direction?: string;
};

export const MAX_REASONABLE_MOVE_DISTANCE_WU = 8_192;
export const MAX_REASONABLE_POSITION = 134_217_728;
const MOVE_SUSPECT_LOG_THROTTLE_MS = 10_000;

// ---------------------------------------------------------------------------
// M4 Phase A — validation serveur bloquante de player_move (ADR-0003, option C).
// Le client PROPOSE une position ; le serveur n'accepte que les déplacements
// atteignables à la vitesse serveur dans le temps écoulé. Tout rejet laisse la
// position runtime inchangée et déclenche une correction vers le seul émetteur.
// ---------------------------------------------------------------------------

/**
 * Vitesse maximale légitime du joueur, en WU/s, possédée par le serveur.
 * Calibrage : le client se déplace à 100 px/s (Player.js) ; en projection iso
 * 1 px écran = 16 WU (axe X) ou 32 WU (axe Y). Le pire cas légitime est la
 * diagonale clavier (100 px/s sur chaque axe) : hypot(100×16, 100×32) ≈ 3578
 * WU/s. Arrondi à 3600. À terme, cette valeur doit devenir une stat dérivée
 * par personnage (effectiveSpeed, ADR-0003 §3).
 */
export const PLAYER_BASE_SPEED_WU_PER_SEC = 3_600;

/**
 * Résout la valeur d'une ressource (mana/énergie) à la connexion (Skills V1-J-B).
 * - valeur non finie → traitée comme 0 ;
 * - à 0 avec un max positif → REFILL au max (comportement V1 temporaire) ;
 * - sinon → clamp dans [0, max].
 */
function resolveJoinResource(current: number, max: number): number {
  const cur = Number.isFinite(current) ? current : 0;
  const cap = Number.isFinite(max) && max > 0 ? Math.round(max) : 0;
  if (cur <= 0 && cap > 0) return cap; // refill (V1 temporaire, pas de regen)
  return Math.min(Math.max(0, cur), cap); // clamp
}

/** Marge de tolérance (jitter réseau, arrondis px→WU) appliquée au budget de distance. */
export const PLAYER_MOVE_TOLERANCE_MULTIPLIER = 1.5;

/**
 * Bornes du delta-temps utilisé par le distance gate :
 * - plancher (MIN) : deux propositions très rapprochées ne donnent pas un
 *   budget quasi nul sujet au bruit d'horodatage ;
 * - plafond (MAX) : un joueur silencieux (AFK, onglet en pause) n'accumule pas
 *   un budget de distance illimité — le saut max par mouvement accepté reste
 *   PLAYER_BASE_SPEED × tolérance × 1 s ≈ 5 400 WU (~5 tiles).
 */
export const PLAYER_MOVE_MIN_DT_MS = 25;
export const PLAYER_MOVE_MAX_DT_MS = 1_000;

/**
 * Rate-limit serveur : le client légitime émet au plus toutes les 80 ms
 * (WorldScene.syncLocalPlayer). En dessous de cet intervalle, la proposition
 * est ignorée silencieusement (aucune correction émise : éviter qu'un spam de
 * player_move se transforme en spam de player_position_correction).
 */
export const PLAYER_MOVE_MIN_INTERVAL_MS = 30;

export type MovementRejectionReason =
  | 'invalid_payload'
  | 'map_mismatch'
  | 'speed_limit'
  | 'rate_limit';

export type UpdatePlayerResult =
  | { status: 'accepted'; player: ConnectedPlayer }
  | {
      status: 'rejected';
      player: ConnectedPlayer;
      reason: MovementRejectionReason;
    };

export type MovementSuspectType =
  | 'TELEPORT_SUSPECT'
  | 'SPEED_SUSPECT'
  | 'INVALID_COORDINATE'
  | 'MAP_MISMATCH';

export type MovementMetrics = {
  totalMoves: number;
  rejectedMoves: number;
  suspectTeleports: number;
  suspectSpeed: number;
  invalidCoordinates: number;
  mapMismatch: number;
};

type MovementObservationState = {
  /** Dernier mouvement ACCEPTÉ (ou position forcée : join, teleport, respawn). */
  lastValidatedAt: number;
  /** Dernière proposition reçue, acceptée ou non (rate-limit). */
  lastProposalAt: number;
  lastSuspectLogAt: Partial<Record<MovementSuspectType, number>>;
};

export type JoinWorldPayload = {
  characterId: string;
  name: string;
  sex?: string;
  direction?: string;
};

/**
 * Ressources courantes + max dérivés renvoyés au join (Skills V1-J-C).
 * Permet à la gateway d'émettre `character_resource_update` au client afin que
 * l'UI reflète immédiatement le refill/clamp du join (sans F5). Les max sont
 * des stats DÉRIVÉES serveur, jamais des colonnes DB.
 */
export type JoinResourceSnapshot = {
  characterId: string;
  health: number;
  mana: number;
  energy: number;
  maxHealth: number;
  maxMana: number;
  maxEnergy: number;
};

export type JoinedPlayer = {
  player: ConnectedPlayer;
  previousSocketId: string | null;
  resources: JoinResourceSnapshot;
};

@Injectable()
export class WorldService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(WorldService.name);
  private connectedPlayers = new Map<string, ConnectedPlayer>();
  // Serveur Socket.IO enregistré par WorldGateway.afterInit — permet aux
  // services HTTP (allocation stats, etc.) d'émettre vers le socket d'un joueur.
  private server: Server | null = null;
  private movementObservation = new Map<string, MovementObservationState>();
  private movementMetrics: MovementMetrics = {
    totalMoves: 0,
    rejectedMoves: 0,
    suspectTeleports: 0,
    suspectSpeed: 0,
    invalidCoordinates: 0,
    mapMismatch: 0,
  };

  constructor(
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
    @InjectRepository(RespawnPoint)
    private readonly respawnPointRepository: Repository<RespawnPoint>,
    private readonly derivedStats: DerivedStatsService,
  ) {}

  async onModuleInit() {
    // Remettre les personnages morts à plein de vie au redémarrage
    const deadChars = await this.characterRepository.find({ where: { health: 0 } });
    for (const char of deadChars) {
      await this.characterRepository.update(char.id, { health: char.maxHealth });
    }

    const count = await this.respawnPointRepository.count();
    if (count === 0) {
      const rpWU = isoScreenToWorldWU(600, 300);
      await this.respawnPointRepository.save(
        this.respawnPointRepository.create({
          radius: 20,
          worldX: rpWU.worldX,
          worldY: rpWU.worldY,
          mapId: DEFAULT_MAP_ID,
        }),
      );
    }
  }

  async respawnCharacter(characterId: string, server: Server): Promise<void> {
    const character = await this.characterRepository.findOne({
      where: { id: characterId },
      relations: ['equipment', 'equipment.item'],
    });
    if (!character) return;

    const points = await this.respawnPointRepository.find();
    if (points.length === 0) return;

    // Position WU requise — garantie par P7-A.
    if (character.worldX == null || character.worldY == null || character.mapId == null) {
      return; // guard explicite : impossible après P7-A
    }
    const charWU = { worldX: character.worldX, worldY: character.worldY, mapId: character.mapId };

    // Trouver le respawn point le plus proche sur la même map, en distance Chebyshev WU
    let nearest = points[0];
    let nearestWU: { worldX: number; worldY: number; mapId: number } | null = null;
    let minDist = Infinity;

    for (const p of points) {
      if (p.worldX == null || p.worldY == null || p.mapId == null) continue;
      const pWU = { worldX: p.worldX, worldY: p.worldY, mapId: p.mapId };
      if (pWU.mapId !== charWU.mapId) continue;
      const d = chebyshevDistanceWU(charWU, pWU);
      if (d < minDist) { minDist = d; nearest = p; nearestWU = pWU; }
    }

    // Fallback : aucun point sur la même map → premier point valide disponible
    if (nearestWU === null) {
      for (const p of points) {
        if (p.worldX == null || p.worldY == null || p.mapId == null) continue;
        nearestWU = { worldX: p.worldX, worldY: p.worldY, mapId: p.mapId };
        nearest = p;
        break;
      }
    }
    if (nearestWU === null) return;

    // Position de respawn : base WU officielle du point, offset aléatoire en pixels
    const baseX = Math.round(wuToIsoScreenX(nearestWU.worldX, nearestWU.worldY));
    const baseY = Math.round(wuToIsoScreenY(nearestWU.worldX, nearestWU.worldY));
    const angle = Math.random() * Math.PI * 2;
    const drift = Math.random() * nearest.radius;
    const newX = Math.round(baseX + Math.cos(angle) * drift);
    const newY = Math.round(baseY + Math.sin(angle) * drift);

    // Convertir la position finale en WU pour la vérité serveur
    let newWX = nearestWU.worldX;
    let newWY = nearestWU.worldY;
    try {
      const wu = isoScreenToWorldWU(newX, newY);
      newWX = wu.worldX;
      newWY = wu.worldY;
    } catch { /* position hors isométrie : conserver la WU du point */ }

    // Respawn full HP = PV max DÉRIVÉS (Vitalité incluse), pas la colonne brute.
    // Mana/énergie également remis au max dérivé (V1-K-A) : cohérent avec le
    // full-life, évite une ressource morte juste après la mort.
    const derivedStatDefinitions = await this.derivedStats.getDefinitions();
    const derived = CharacterStatsCalculator.compute(
      character,
      derivedStatDefinitions,
      aggregateEquipmentBonuses(character.equipment),
    ).derived;
    const derivedMaxHealth = derived.maxHealth;
    const newHealth = derivedMaxHealth;
    const newMana = Math.max(0, Math.round(derived.maxMana));
    const newEnergy = Math.max(0, Math.round(derived.maxEnergy));

    await this.characterRepository.update(characterId, {
      health: newHealth,
      mana: newMana,
      energy: newEnergy,
      worldX: newWX,
      worldY: newWY,
      mapId: nearestWU.mapId,
    });

    // Mettre à jour la position en mémoire et notifier le joueur
    for (const player of this.connectedPlayers.values()) {
      if (player.characterId === characterId) {
        player.worldX  = newWX;
        player.worldY  = newWY;
        player.mapId   = nearestWU.mapId;
        // Mouvement forcé serveur : resynchroniser le distance gate (cf. teleport).
        this.resyncMovementValidation(player.socketId);
        server.to(player.socketId).emit('character_respawn', {
          characterId,
          worldX: newWX,
          worldY: newWY,
          chunkX: wuToChunkIndex(newWX),
          chunkY: wuToChunkIndex(newWY),
          mapId: nearestWU.mapId,
          health: newHealth,
          maxHealth: derivedMaxHealth,
        });
        // Sync ressources (mana/énergie refaites au max) au seul joueur (V1-K-A).
        server.to(player.socketId).emit('character_resource_update', {
          characterId,
          health: Math.round(newHealth),
          mana: newMana,
          energy: newEnergy,
          maxHealth: Math.max(1, Math.round(derivedMaxHealth)),
          maxMana: newMana,
          maxEnergy: newEnergy,
        });
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Synchronisation temps réel des joueurs
  // ---------------------------------------------------------------------------
  async joinPlayer(
    client: WorldSocket,
    payload: JoinWorldPayload,
  ): Promise<JoinedPlayer | null> {
    const previousSocketId = this.findSocketIdByCharacterId(
      payload.characterId,
      client.id,
    );

    if (previousSocketId) {
      const previousPlayer = this.connectedPlayers.get(previousSocketId);
      if (previousPlayer) {
        await this.persistPlayerPosition(previousPlayer);
      }

      this.connectedPlayers.delete(previousSocketId);
      this.movementObservation.delete(previousSocketId);
    }

    const character = await this.characterRepository.findOne({
      where: { id: payload.characterId },
      relations: ['equipment', 'equipment.item'],
    });
    if (!character) return null;

    // Le personnage doit appartenir à l'utilisateur authentifié sur ce socket.
    if (character.userId !== client.data.userId) return null;

    // Position WU requise — garantie par P7-A (character.create initialise toujours worldX/Y/mapId).
    if (character.worldX == null || character.worldY == null || character.mapId == null) {
      return null; // guard explicite : impossible après P7-A
    }

    // Ressources mana/énergie : clamp aux max dérivés + refill V1 temporaire.
    // Renvoie le snapshot pour que la gateway sync l'UI (character_resource_update).
    const resources = await this.refillCharacterResourcesOnJoin(character);

    const player: ConnectedPlayer = {
      socketId: client.id,
      characterId: payload.characterId,
      name: character.name,
      sex: character.sex,
      worldX: character.worldX,
      worldY: character.worldY,
      mapId: character.mapId,
      direction: payload.direction ?? 'down',
    };

    this.connectedPlayers.set(client.id, player);
    this.movementObservation.set(client.id, {
      lastValidatedAt: Date.now(),
      lastProposalAt: 0,
      lastSuspectLogAt: {},
    });
    client.data.player = {
      characterId: player.characterId,
      name: player.name,
      sex: player.sex,
      worldX: player.worldX,
      worldY: player.worldY,
      mapId: player.mapId,
      direction: player.direction,
    };

    return { player, previousSocketId, resources };
  }

  /**
   * Ressources mana/énergie à la connexion (Skills V1-J-B).
   *
   * Calcule les max dérivés serveur, clampe `mana`/`energy` dans [0, max], et
   * applique un REFILL V1 TEMPORAIRE : si une ressource est à 0 alors que son
   * max dérivé est positif, elle est remontée au max — évite d'avoir des
   * ressources mortes tant que la régénération réelle n'existe pas (V1-K).
   *
   * Aucune régénération périodique ici : ce refill n'a lieu qu'au join.
   * Persiste en DB uniquement si une valeur change. Le mana/énergie du
   * `ConnectedPlayer` n'est pas suivi runtime : la source reste la DB, lue à
   * chaque cast par `SkillCastService`.
   */
  private async refillCharacterResourcesOnJoin(
    character: Character,
  ): Promise<JoinResourceSnapshot> {
    const derivedDefinitions = await this.derivedStats.getDefinitions();
    // Bonus d'équipement inclus : les max dérivés (PV/mana/énergie) doivent être
    // cohérents avec l'équipement porté, sinon le join écrase l'UI avec des max
    // non équipés (regressions Équipement V1).
    const stats = CharacterStatsCalculator.compute(
      character,
      derivedDefinitions,
      aggregateEquipmentBonuses(character.equipment),
    );

    const maxHealth = Math.max(1, Math.round(stats.derived.maxHealth));
    const maxMana = Math.max(0, Math.round(stats.derived.maxMana));
    const maxEnergy = Math.max(0, Math.round(stats.derived.maxEnergy));

    const mana = resolveJoinResource(character.mana, stats.derived.maxMana);
    const energy = resolveJoinResource(character.energy, stats.derived.maxEnergy);

    if (mana !== character.mana || energy !== character.energy) {
      character.mana = mana;
      character.energy = energy;
      await this.characterRepository.update(character.id, { mana, energy });
    }

    // Snapshot TOUJOURS renvoyé (même sans changement) : la gateway émet
    // character_resource_update au join pour que l'UI affiche les valeurs
    // courantes + max dérivés sans F5, quelle que soit la course avec loadCharacter.
    return {
      characterId: character.id,
      health: character.health,
      mana,
      energy,
      maxHealth,
      maxMana,
      maxEnergy,
    };
  }

  /**
   * M4 Phase A — pipeline de validation bloquant (ADR-0003, option C).
   * Le client propose une position ; la position runtime (`ConnectedPlayer`,
   * lue par combat/récolte/aggro/interactions) n'est mise à jour QUE si la
   * proposition passe toutes les vérifications. Tout rejet laisse la position
   * serveur inchangée ; la gateway émet alors `player_position_correction`
   * au seul client fautif (sauf rate_limit : drop silencieux).
   */
  updatePlayer(
    client: WorldSocket,
    payload: { worldX: number; worldY: number; mapId: number; direction?: string },
  ): UpdatePlayerResult | null {
    const player = this.connectedPlayers.get(client.id);
    if (!player) return null;

    const now = Date.now();
    const state = this.getMovementObservationState(client.id, now);
    this.movementMetrics.totalMoves++;

    // 1) Payload invalide : coordonnées non finies ou hors plage plausible.
    if (this.hasInvalidMovementCoordinate(payload)) {
      this.recordMovementSuspect(
        client.id,
        player.characterId,
        'INVALID_COORDINATE',
        now,
        {
          worldX: payload.worldX,
          worldY: payload.worldY,
          mapId: payload.mapId,
        },
      );
      return this.rejectMovement(player, 'invalid_payload');
    }

    // 2) Rate-limit : proposition trop rapprochée de la précédente (spam).
    const sinceLastProposalMs = now - state.lastProposalAt;
    state.lastProposalAt = now;
    if (sinceLastProposalMs < PLAYER_MOVE_MIN_INTERVAL_MS) {
      return this.rejectMovement(player, 'rate_limit');
    }

    // 3) mapId : Phase A — aucun changement de map via player_move. La map
    //    serveur (chargée depuis la DB au join) reste la vérité.
    if (payload.mapId !== player.mapId) {
      this.recordMovementSuspect(
        client.id,
        player.characterId,
        'MAP_MISMATCH',
        now,
        {
          previousMapId: player.mapId,
          receivedMapId: payload.mapId,
        },
      );
      return this.rejectMovement(player, 'map_mismatch');
    }

    // 4) Distance gate : le déplacement doit être atteignable à la vitesse
    //    serveur dans le temps écoulé depuis le dernier mouvement validé.
    const deltaTimeMs = Math.min(
      Math.max(now - state.lastValidatedAt, PLAYER_MOVE_MIN_DT_MS),
      PLAYER_MOVE_MAX_DT_MS,
    );
    const distanceWU = Math.hypot(
      payload.worldX - player.worldX,
      payload.worldY - player.worldY,
    );
    const allowanceWU =
      PLAYER_BASE_SPEED_WU_PER_SEC *
      PLAYER_MOVE_TOLERANCE_MULTIPLIER *
      (deltaTimeMs / 1000);
    if (distanceWU > allowanceWU) {
      const suspectType: MovementSuspectType =
        distanceWU > MAX_REASONABLE_MOVE_DISTANCE_WU
          ? 'TELEPORT_SUSPECT'
          : 'SPEED_SUSPECT';
      this.recordMovementSuspect(
        client.id,
        player.characterId,
        suspectType,
        now,
        {
          deltaTimeMs,
          distanceWU,
          allowanceWU,
        },
      );
      return this.rejectMovement(player, 'speed_limit');
    }

    // Mouvement accepté : la proposition devient la nouvelle position validée.
    player.worldX = payload.worldX;
    player.worldY = payload.worldY;
    player.direction = payload.direction ?? player.direction;
    state.lastValidatedAt = now;

    client.data.player = {
      characterId: player.characterId,
      name: player.name,
      sex: player.sex,
      worldX: player.worldX,
      worldY: player.worldY,
      mapId: player.mapId,
      direction: player.direction,
    };

    return { status: 'accepted', player };
  }

  private rejectMovement(
    player: ConnectedPlayer,
    reason: MovementRejectionReason,
  ): UpdatePlayerResult {
    this.movementMetrics.rejectedMoves++;
    return { status: 'rejected', player, reason };
  }

  removePlayer(client: WorldSocket): ConnectedPlayer | undefined {
    const player = this.connectedPlayers.get(client.id);
    this.connectedPlayers.delete(client.id);
    this.movementObservation.delete(client.id);
    return player;
  }

  async persistPlayerPosition(player: ConnectedPlayer): Promise<void> {
    const wuX   = Number.isFinite(player.worldX) ? player.worldX : 0;
    const wuY   = Number.isFinite(player.worldY) ? player.worldY : 0;
    const wuMap = Number.isFinite(player.mapId)   ? player.mapId  : DEFAULT_MAP_ID;

    await this.characterRepository.update(player.characterId, {
      worldX: wuX,
      worldY: wuY,
      mapId: wuMap,
    });
  }

  /**
   * Flush en DB de la position de TOUS les joueurs actuellement connectés.
   *
   * Filet de sécurité pour l'arrêt gracieux du serveur (SIGINT/SIGTERM) : sans
   * lui, un redémarrage backend avec un joueur connecté perdrait la dernière
   * position live, `handleDisconnect` n'étant pas garanti sur arrêt du process.
   *
   * Réutilise `persistPlayerPosition` (point d'écriture unique de la position
   * joueur) — aucune logique d'update DB dupliquée. `Promise.allSettled` :
   * l'échec d'un joueur n'empêche jamais la sauvegarde des autres. Les joueurs
   * sans `characterId` valide sont ignorés (aucune écriture).
   */
  async flushConnectedPlayerPositions(): Promise<{ saved: number; failed: number }> {
    const players = Array.from(this.connectedPlayers.values()).filter(
      (p) => p && typeof p.characterId === 'string' && p.characterId.length > 0,
    );
    if (players.length === 0) return { saved: 0, failed: 0 };

    const results = await Promise.allSettled(
      players.map((p) => this.persistPlayerPosition(p)),
    );

    let saved = 0;
    let failed = 0;
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        saved++;
      } else {
        failed++;
        this.logger.error(
          `Flush position échoué pour character ${players[i].characterId}: ${
            (result.reason as Error)?.message ?? result.reason
          }`,
        );
      }
    });

    this.logger.log(`Flush positions à l'arrêt : ${saved} sauvegardée(s), ${failed} échec(s).`);
    return { saved, failed };
  }

  /**
   * Hook NestJS (activé par `app.enableShutdownHooks()` dans main.ts) : persiste
   * les positions live avant l'arrêt. Ne relance jamais : un échec de flush ne
   * doit pas bloquer l'arrêt du serveur.
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    try {
      await this.flushConnectedPlayerPositions();
    } catch (err) {
      this.logger.error(
        `Flush des positions au shutdown (${signal ?? 'unknown'}) échoué : ${(err as Error).message}`,
      );
    }
  }

  getAllConnectedPlayers(): ConnectedPlayer[] {
    return Array.from(this.connectedPlayers.values());
  }

  getConnectedCount(): number {
    const unique = new Set(Array.from(this.connectedPlayers.values()).map((p) => p.characterId));
    return unique.size;
  }

  getMovementMetrics(): MovementMetrics {
    return { ...this.movementMetrics };
  }

  resetMovementMetrics(): MovementMetrics {
    this.movementMetrics = {
      totalMoves: 0,
      rejectedMoves: 0,
      suspectTeleports: 0,
      suspectSpeed: 0,
      invalidCoordinates: 0,
      mapMismatch: 0,
    };
    return this.getMovementMetrics();
  }

  getPlayersExcept(socketId: string, mapId?: number): ConnectedPlayer[] {
    const playersByCharacter = new Map<string, ConnectedPlayer>();

    for (const player of this.connectedPlayers.values()) {
      if (player.socketId !== socketId) {
        if (mapId == null || player.mapId === mapId) {
          playersByCharacter.set(player.characterId, player);
        }
      }
    }

    return Array.from(playersByCharacter.values());
  }

  getSocketIdByCharacterId(characterId: string): string | null {
    for (const player of this.connectedPlayers.values()) {
      if (player.characterId === characterId) return player.socketId;
    }
    return null;
  }

  getConnectedPlayerByCharacterId(characterId: string): ConnectedPlayer | null {
    for (const player of this.connectedPlayers.values()) {
      if (player.characterId === characterId) return { ...player };
    }
    return null;
  }

  /** Enregistre le serveur Socket.IO (appelé par WorldGateway au démarrage). */
  registerServer(server: Server): void {
    this.server = server;
  }

  /**
   * Émet `character:reload` vers le socket du personnage s'il est connecté.
   * No-op silencieux si le joueur est hors ligne ou si le serveur n'est pas
   * encore enregistré. Réutilisable par tous les domaines (stats, bank, mail…).
   */
  emitCharacterReload(characterId: string): void {
    if (!this.server) return;
    const player = this.getConnectedPlayerByCharacterId(characterId);
    if (player) this.server.to(player.socketId).emit('character:reload');
  }

  /**
   * Émet un signal léger d'invalidation vers la room admin uniquement, pour que
   * les Player Inspector ouverts sur ce personnage refetch leur snapshot.
   * Payload minimal (aucun snapshot diffusé). No-op si serveur non enregistré.
   */
  emitAdminCharacterDirty(characterId: string, reason: AdminCharacterDirtyReason): void {
    if (!this.server) return;
    this.server.to(ADMIN_ROOM).emit('admin:character_details_dirty', {
      characterId,
      reason,
      updatedAt: Date.now(),
    });
  }

  findPlayerByNameOrId(nameOrId: string): ConnectedPlayer | null {
    const lower = nameOrId.toLowerCase();
    for (const player of this.connectedPlayers.values()) {
      if (player.characterId === nameOrId) return player;
    }
    for (const player of this.connectedPlayers.values()) {
      if (player.name.toLowerCase() === lower) return player;
    }
    return null;
  }

  async teleportCharacter(
    characterId: string,
    worldX: number,
    worldY: number,
    server: Server,
  ): Promise<ConnectedPlayer | null> {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return null;
    const targetWorldX = Math.round(worldX);
    const targetWorldY = Math.round(worldY);

    for (const player of this.connectedPlayers.values()) {
      if (player.characterId === characterId) {
        player.worldX = targetWorldX;
        player.worldY = targetWorldY;
        // Mouvement forcé serveur : resynchroniser le distance gate pour que le
        // prochain player_move légitime ne soit pas mesuré depuis l'ancienne position.
        this.resyncMovementValidation(player.socketId);
        const teleportMapId = player.mapId;

        await this.characterRepository.update(characterId, {
          worldX: targetWorldX,
          worldY: targetWorldY,
          mapId: teleportMapId,
        });
        server.to(player.socketId).emit('character_teleport', {
          characterId,
          worldX: targetWorldX,
          worldY: targetWorldY,
          chunkX: wuToChunkIndex(targetWorldX),
          chunkY: wuToChunkIndex(targetWorldY),
          mapId: teleportMapId,
        });
        server.except(player.socketId).emit('player_moved', {
          socketId:    player.socketId,
          characterId: player.characterId,
          name:        player.name,
          sex:         player.sex,
          worldX:      player.worldX,
          worldY:      player.worldY,
          mapId:       player.mapId,
          direction:   player.direction,
        });
        return player;
      }
    }

    return null;
  }

  private findSocketIdByCharacterId(
    characterId: string,
    exceptSocketId: string,
  ) {
    for (const player of this.connectedPlayers.values()) {
      if (
        player.characterId === characterId &&
        player.socketId !== exceptSocketId
      ) {
        return player.socketId;
      }
    }

    return null;
  }

  private getMovementObservationState(
    socketId: string,
    now: number,
  ): MovementObservationState {
    let state = this.movementObservation.get(socketId);
    if (!state) {
      state = { lastValidatedAt: now, lastProposalAt: 0, lastSuspectLogAt: {} };
      this.movementObservation.set(socketId, state);
    }
    return state;
  }

  /**
   * Resynchronise le distance gate après un mouvement forcé d'origine serveur
   * (teleport admin, respawn). Sans cela, le premier player_move légitime après
   * la position forcée serait mesuré depuis l'ANCIENNE position et faussement
   * rejeté/flaggé (bug identifié à l'audit M4).
   */
  private resyncMovementValidation(socketId: string): void {
    const state = this.getMovementObservationState(socketId, Date.now());
    state.lastValidatedAt = Date.now();
  }

  private hasInvalidMovementCoordinate(
    payload: { worldX: number; worldY: number; mapId: number },
  ): boolean {
    if (!Number.isFinite(payload.worldX) || !Number.isFinite(payload.worldY) || !Number.isFinite(payload.mapId)) {
      return true;
    }
    if (Math.abs(payload.worldX) > MAX_REASONABLE_POSITION) return true;
    if (Math.abs(payload.worldY) > MAX_REASONABLE_POSITION) return true;
    return false;
  }

  private recordMovementSuspect(
    socketId: string,
    characterId: string,
    type: MovementSuspectType,
    now: number,
    details: Record<string, unknown>,
  ): void {
    switch (type) {
      case 'TELEPORT_SUSPECT':
        this.movementMetrics.suspectTeleports++;
        break;
      case 'SPEED_SUSPECT':
        this.movementMetrics.suspectSpeed++;
        break;
      case 'INVALID_COORDINATE':
        this.movementMetrics.invalidCoordinates++;
        break;
      case 'MAP_MISMATCH':
        this.movementMetrics.mapMismatch++;
        break;
    }

    const state = this.getMovementObservationState(socketId, now);
    const lastLogAt = state.lastSuspectLogAt[type];
    if (
      lastLogAt !== undefined &&
      now - lastLogAt < MOVE_SUSPECT_LOG_THROTTLE_MS
    ) return;
    state.lastSuspectLogAt[type] = now;

    const detailText = Object.entries(details)
      .map(([key, value]) => `${key}=${this.formatMoveMetricValue(value)}`)
      .join(' ');

    this.logger.warn(
      `[MOVE_SUSPECT] type=${type} characterId=${characterId} ${detailText}`,
    );
  }

  private formatMoveMetricValue(value: unknown): string {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value.toFixed(2) : String(value);
    }
    return String(value);
  }

  /**
   * Validates that a character is close enough to an entity to interact with it.
   * Uses chebyshevDistanceWU (L∞ norm) — the standard for all gameplay range gates.
   *
   * Returns null on success, or a rejection reason string.
   */
  validateInteraction(
    character: { worldX: number; worldY: number; mapId: number },
    target: { worldX: number; worldY: number; mapId: number },
    interactionRadiusWU: number,
  ): string | null {
    if (character.mapId !== target.mapId) {
      return 'Carte différente.';
    }
    const dist = chebyshevDistanceWU(
      { worldX: character.worldX, worldY: character.worldY },
      { worldX: target.worldX, worldY: target.worldY },
    );
    if (dist > interactionRadiusWU) {
      return `Trop loin (distance=${dist} WU, rayon=${interactionRadiusWU} WU).`;
    }
    return null;
  }
}
