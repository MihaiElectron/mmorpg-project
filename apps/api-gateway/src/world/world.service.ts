// apps/api-gateway/src/world/world.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WorldSocket } from '../types/world-socket';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server } from 'socket.io';
import { Character } from '../characters/entities/character.entity';
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

export const MAX_REASONABLE_SPEED_WU_PER_SEC = 10_000;
export const MAX_REASONABLE_MOVE_DISTANCE_WU = 8_192;
export const MAX_REASONABLE_POSITION = 134_217_728;
const MOVE_SUSPECT_LOG_THROTTLE_MS = 10_000;

export type MovementSuspectType =
  | 'TELEPORT_SUSPECT'
  | 'SPEED_SUSPECT'
  | 'INVALID_COORDINATE'
  | 'MAP_MISMATCH';

export type MovementMetrics = {
  totalMoves: number;
  suspectTeleports: number;
  suspectSpeed: number;
  invalidCoordinates: number;
  mapMismatch: number;
};

type MovementMetricSample = {
  characterId: string;
  deltaTimeMs: number;
  deltaWorldX: number;
  deltaWorldY: number;
  distanceWU: number;
  speedWUPerSec: number;
};

type MovementObservationState = {
  lastObservedAt: number;
  lastSuspectLogAt: Partial<Record<MovementSuspectType, number>>;
};

export type JoinWorldPayload = {
  characterId: string;
  name: string;
  sex?: string;
  direction?: string;
};

export type JoinedPlayer = {
  player: ConnectedPlayer;
  previousSocketId: string | null;
};

@Injectable()
export class WorldService implements OnModuleInit {
  private readonly logger = new Logger(WorldService.name);
  private connectedPlayers = new Map<string, ConnectedPlayer>();
  private movementObservation = new Map<string, MovementObservationState>();
  private movementMetrics: MovementMetrics = {
    totalMoves: 0,
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
    const character = await this.characterRepository.findOne({ where: { id: characterId } });
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

    const newHealth = character.maxHealth;

    await this.characterRepository.update(characterId, {
      health: newHealth,
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
        server.to(player.socketId).emit('character_respawn', {
          characterId,
          worldX: newWX,
          worldY: newWY,
          chunkX: wuToChunkIndex(newWX),
          chunkY: wuToChunkIndex(newWY),
          mapId: nearestWU.mapId,
          health: newHealth,
          maxHealth: character.maxHealth,
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
    });
    if (!character) return null;

    // Le personnage doit appartenir à l'utilisateur authentifié sur ce socket.
    if (character.userId !== client.data.userId) return null;

    // Position WU requise — garantie par P7-A (character.create initialise toujours worldX/Y/mapId).
    if (character.worldX == null || character.worldY == null || character.mapId == null) {
      return null; // guard explicite : impossible après P7-A
    }
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
      lastObservedAt: Date.now(),
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

    return { player, previousSocketId };
  }

  updatePlayer(
    client: WorldSocket,
    payload: { worldX: number; worldY: number; mapId: number; direction?: string },
  ): ConnectedPlayer | null {
    const player = this.connectedPlayers.get(client.id);
    if (!player) return null;

    const now = Date.now();
    const previousWorldX = player.worldX;
    const previousWorldY = player.worldY;
    const previousMapId = player.mapId;
    const state = this.getMovementObservationState(client.id, now);
    const deltaTimeMs = Math.max(now - state.lastObservedAt, 0);

    this.movementMetrics.totalMoves++;
    if (this.hasInvalidMovementCoordinate(payload)) {
      this.recordMovementSuspect(client.id, player.characterId, 'INVALID_COORDINATE', now, {
        worldX: payload.worldX,
        worldY: payload.worldY,
        mapId: payload.mapId,
      });
    }

    player.direction = payload.direction ?? player.direction;

    if (
      Number.isFinite(payload.worldX) &&
      Number.isFinite(payload.worldY) &&
      Number.isFinite(payload.mapId)
    ) {
      // Chemin WU direct — seule source de vérité depuis P5
      player.worldX = payload.worldX;
      player.worldY = payload.worldY;
      player.mapId  = payload.mapId;
    }

    this.observeMovementDelta(client.id, player, {
      previousWorldX,
      previousWorldY,
      previousMapId,
      deltaTimeMs,
      now,
      payload,
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

    return player;
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
      state = { lastObservedAt: now, lastSuspectLogAt: {} };
      this.movementObservation.set(socketId, state);
    }
    return state;
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

  private observeMovementDelta(
    socketId: string,
    player: ConnectedPlayer,
    context: {
      previousWorldX: number;
      previousWorldY: number;
      previousMapId: number;
      deltaTimeMs: number;
      now: number;
      payload: { mapId?: number };
    },
  ): void {
    const deltaWorldX = player.worldX - context.previousWorldX;
    const deltaWorldY = player.worldY - context.previousWorldY;
    const distanceWU = Math.hypot(deltaWorldX, deltaWorldY);
    const speedWUPerSec = context.deltaTimeMs > 0
      ? distanceWU / (context.deltaTimeMs / 1000)
      : 0;

    const sample: MovementMetricSample = {
      characterId: player.characterId,
      deltaTimeMs: context.deltaTimeMs,
      deltaWorldX,
      deltaWorldY,
      distanceWU,
      speedWUPerSec,
    };

    if (distanceWU > MAX_REASONABLE_MOVE_DISTANCE_WU) {
      this.recordMovementSuspect(socketId, player.characterId, 'TELEPORT_SUSPECT', context.now, sample);
    }

    if (
      context.deltaTimeMs > 0 &&
      speedWUPerSec > MAX_REASONABLE_SPEED_WU_PER_SEC
    ) {
      this.recordMovementSuspect(socketId, player.characterId, 'SPEED_SUSPECT', context.now, sample);
    }

    if (
      Number.isFinite(context.payload.mapId) &&
      context.payload.mapId !== context.previousMapId
    ) {
      this.recordMovementSuspect(socketId, player.characterId, 'MAP_MISMATCH', context.now, {
        previousMapId: context.previousMapId,
        receivedMapId: context.payload.mapId,
      });
    }

    const state = this.getMovementObservationState(socketId, context.now);
    state.lastObservedAt = context.now;
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
}
