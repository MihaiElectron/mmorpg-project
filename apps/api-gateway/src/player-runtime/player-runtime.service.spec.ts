// apps/api-gateway/src/player-runtime/player-runtime.service.spec.ts

import { PlayerRuntimeService } from './player-runtime.service';
import { Character } from '../characters/entities/character.entity';
import { ConnectedPlayer } from '../world/world.service';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return Object.assign(new Character(), {
    id: 'char-1',
    name: 'Hero',
    level: 3,
    health: 70,
    maxHealth: 100,
    attack: 10,
    defense: 5,
    experience: 200,
    worldX: 1024,
    worldY: 2048,
    mapId: 1,
    positionX: 400,
    positionY: 300,
    sex: 'male',
    userId: 'user-1',
    ...overrides,
  } as Character);
}

function makeConnectedPlayer(overrides: Partial<ConnectedPlayer> = {}): ConnectedPlayer {
  return {
    socketId: 'socket-abc',
    characterId: 'char-1',
    name: 'Hero',
    worldX: 5000,
    worldY: 6000,
    mapId: 1,
    x: 100,
    y: 200,
    ...overrides,
  };
}

function makeService(
  character: Character | null,
  connected: ConnectedPlayer | null = null,
): PlayerRuntimeService {
  const characterRepo = {
    findOne: jest.fn().mockResolvedValue(character),
  } as any;
  const worldService = {
    getConnectedPlayerByCharacterId: jest.fn().mockReturnValue(connected),
  } as any;
  return new PlayerRuntimeService(characterRepo, worldService);
}

describe('PlayerRuntimeService', () => {
  describe('getPlayerRuntime', () => {
    it('retourne null si le personnage est introuvable', async () => {
      const service = makeService(null);
      expect(await service.getPlayerRuntime('unknown')).toBeNull();
    });

    it('retourne un PlayerRuntime complet', async () => {
      const character = makeCharacter();
      const service = makeService(character, null);
      const runtime = await service.getPlayerRuntime('char-1');

      expect(runtime).not.toBeNull();
      expect(runtime!.characterId).toBe('char-1');
      expect(runtime!.name).toBe('Hero');
      expect(runtime!.baseStats.level).toBe(3);
      expect(runtime!.baseStats.health).toBe(70);
      expect(runtime!.baseStats.maxHealth).toBe(100);
      expect(runtime!.derivedStats.maxHp).toBe(100);
      expect(runtime!.derivedStats.attackPower).toBe(10);
      expect(runtime!.derivedStats.defenseTotal).toBe(5);
    });

    it('isConnected false et socketId null si joueur non connecté', async () => {
      const service = makeService(makeCharacter(), null);
      const runtime = await service.getPlayerRuntime('char-1');

      expect(runtime!.isConnected).toBe(false);
      expect(runtime!.socketId).toBeNull();
    });

    it('utilise la position live ConnectedPlayer si connecté', async () => {
      const connected = makeConnectedPlayer({ worldX: 5000, worldY: 6000 });
      const service = makeService(makeCharacter({ worldX: 1024, worldY: 2048 }), connected);
      const runtime = await service.getPlayerRuntime('char-1');

      expect(runtime!.worldX).toBe(5000);
      expect(runtime!.worldY).toBe(6000);
      expect(runtime!.isConnected).toBe(true);
      expect(runtime!.socketId).toBe('socket-abc');
    });

    it('fallback sur position DB si ConnectedPlayer absent', async () => {
      const service = makeService(makeCharacter({ worldX: 1024, worldY: 2048 }), null);
      const runtime = await service.getPlayerRuntime('char-1');

      expect(runtime!.worldX).toBe(1024);
      expect(runtime!.worldY).toBe(2048);
    });

    it('position 0/0 si worldX/Y DB sont null et joueur non connecté', async () => {
      const service = makeService(
        makeCharacter({ worldX: null as any, worldY: null as any }),
        null,
      );
      const runtime = await service.getPlayerRuntime('char-1');

      expect(runtime!.worldX).toBe(0);
      expect(runtime!.worldY).toBe(0);
    });
  });

  describe('getRuntimeStats', () => {
    it('retourne null si le personnage est introuvable', async () => {
      const service = makeService(null);
      expect(await service.getRuntimeStats('unknown')).toBeNull();
    });

    it('retourne base et derived stats', async () => {
      const service = makeService(makeCharacter());
      const result = await service.getRuntimeStats('char-1');

      expect(result).not.toBeNull();
      expect(result!.base.level).toBe(3);
      expect(result!.derived.maxHp).toBe(100);
    });
  });

  describe('recalculateRuntime', () => {
    it('retourne le même résultat que getPlayerRuntime en phase 1', async () => {
      const character = makeCharacter();
      const service = makeService(character, null);

      const runtime = await service.recalculateRuntime('char-1');
      expect(runtime).not.toBeNull();
      expect(runtime!.baseStats.level).toBe(3);
    });
  });
});
