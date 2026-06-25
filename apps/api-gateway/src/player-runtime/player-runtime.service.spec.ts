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
      expect(await makeService(null).getPlayerRuntime('unknown')).toBeNull();
    });

    it('retourne un PlayerRuntime complet', async () => {
      const runtime = await makeService(makeCharacter()).getPlayerRuntime('char-1');

      expect(runtime).not.toBeNull();
      expect(runtime!.characterId).toBe('char-1');
      expect(runtime!.baseStats.level).toBe(3);
      expect(runtime!.derivedStats.maxHp).toBe(100);
    });

    it('isConnected false et socketId null si joueur non connecté', async () => {
      const runtime = await makeService(makeCharacter(), null).getPlayerRuntime('char-1');

      expect(runtime!.isConnected).toBe(false);
      expect(runtime!.socketId).toBeNull();
    });

    it('utilise la position live ConnectedPlayer si connecté', async () => {
      const connected = makeConnectedPlayer({ worldX: 5000, worldY: 6000 });
      const runtime = await makeService(makeCharacter({ worldX: 1024, worldY: 2048 }), connected).getPlayerRuntime('char-1');

      expect(runtime!.worldX).toBe(5000);
      expect(runtime!.worldY).toBe(6000);
      expect(runtime!.isConnected).toBe(true);
      expect(runtime!.socketId).toBe('socket-abc');
    });

    it('fallback sur position DB si ConnectedPlayer absent', async () => {
      const runtime = await makeService(makeCharacter({ worldX: 1024, worldY: 2048 })).getPlayerRuntime('char-1');

      expect(runtime!.worldX).toBe(1024);
      expect(runtime!.worldY).toBe(2048);
    });

    it('position 0/0 si worldX/Y DB sont null et joueur non connecté', async () => {
      const runtime = await makeService(
        makeCharacter({ worldX: null as any, worldY: null as any }),
      ).getPlayerRuntime('char-1');

      expect(runtime!.worldX).toBe(0);
      expect(runtime!.worldY).toBe(0);
    });
  });

  describe('getRuntimeStats', () => {
    it('retourne null si le personnage est introuvable', async () => {
      expect(await makeService(null).getRuntimeStats('unknown')).toBeNull();
    });

    it('retourne base et derived stats', async () => {
      const result = await makeService(makeCharacter()).getRuntimeStats('char-1');

      expect(result!.base.level).toBe(3);
      expect(result!.derived.maxHp).toBe(100);
      expect(result!.derived.attackPower).toBe(10);
    });
  });

  describe('getRuntimeTrace', () => {
    it('retourne null si le personnage est introuvable', async () => {
      expect(await makeService(null).getRuntimeTrace('unknown')).toBeNull();
    });

    it('retourne une trace avec modifierCount 0 en phase 2', async () => {
      const trace = await makeService(makeCharacter()).getRuntimeTrace('char-1');

      expect(trace).not.toBeNull();
      expect(trace!.modifierCount).toBe(0);
      expect(trace!.stats.maxHp?.baseValue).toBe(100);
      expect(trace!.stats.maxHp?.finalValue).toBe(100);
      expect(trace!.stats.maxHp?.modifiers).toHaveLength(0);
      expect(trace!.computedAt).toBeInstanceOf(Date);
    });

    it('trace couvre toutes les StatKey', async () => {
      const trace = await makeService(makeCharacter()).getRuntimeTrace('char-1');

      expect(trace!.stats.maxHp).toBeDefined();
      expect(trace!.stats.attackPower).toBeDefined();
      expect(trace!.stats.defenseTotal).toBeDefined();
      expect(trace!.stats.speed).toBeDefined();
      expect(trace!.stats.gatheringRange).toBeDefined();
      expect(trace!.stats.attackRange).toBeDefined();
    });
  });

  describe('recalculateRuntime', () => {
    it('retourne le même résultat que getPlayerRuntime', async () => {
      const runtime = await makeService(makeCharacter()).recalculateRuntime('char-1');

      expect(runtime!.baseStats.level).toBe(3);
    });
  });
});
