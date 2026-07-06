import { WorldGateway } from './world.gateway';
import { WorldService, ConnectedPlayer } from './world.service';
import { WsAuthService } from '../common/ws-auth.service';
import { getMapRoomId } from '../common/socket-rooms';
import type { WorldSocket } from '../types/world-socket';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeClient(overrides: Record<string, unknown> = {}): WorldSocket {
  return {
    id: 'socket-1',
    handshake: { auth: {}, headers: {} },
    connected: true,
    data: {},
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    broadcast: { emit: jest.fn(), to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
    disconnect: jest.fn(),
    ...overrides,
  } as unknown as WorldSocket;
}

function makePlayer(overrides: Partial<ConnectedPlayer> = {}): ConnectedPlayer {
  return {
    socketId: 'socket-1',
    characterId: 'char-1',
    name: 'Hero',
    sex: 'male',
    worldX: 1024,
    worldY: 2048,
    mapId: 1,
    x: 64,
    y: 128,
    direction: 'down',
    ...overrides,
  } as ConnectedPlayer;
}

function makeGateway(worldServiceMock: Partial<WorldService>) {
  const wsAuth = { authenticate: jest.fn().mockResolvedValue({ userId: 'u-1', role: 'user' }) };
  const gateway = new WorldGateway(worldServiceMock as WorldService, wsAuth as unknown as WsAuthService);
  const roomEmit = jest.fn();
  const globalEmit = jest.fn();
  (gateway as any).server = { to: jest.fn().mockReturnValue({ emit: roomEmit }), emit: globalEmit };
  return { gateway, wsAuth };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('WorldGateway — rooms par mapId', () => {
  describe('join_world', () => {
    it("rejoint la room map:1 après un join_world réussi", async () => {
      const player = makePlayer({ mapId: 1 });
      const worldService = {
        joinPlayer: jest.fn().mockResolvedValue({ player, previousSocketId: null }),
        getPlayersExcept: jest.fn().mockReturnValue([]),
      };
      const { gateway } = makeGateway(worldService);
      const client = makeClient();

      await gateway.handleJoinWorld(client, {
        characterId: 'char-1',
        name: 'Hero',
      });

      expect(client.join).toHaveBeenCalledWith(getMapRoomId(1));
    });

    it("player_joined est émis dans la room map:1, pas en broadcast global", async () => {
      const player = makePlayer({ mapId: 1 });
      const worldService = {
        joinPlayer: jest.fn().mockResolvedValue({ player, previousSocketId: null }),
        getPlayersExcept: jest.fn().mockReturnValue([]),
      };
      const { gateway } = makeGateway(worldService);
      const client = makeClient();

      await gateway.handleJoinWorld(client, { characterId: 'char-1', name: 'Hero' });

      const broadcastTo = (client.broadcast as any).to;
      expect(broadcastTo).toHaveBeenCalledWith(getMapRoomId(1));
      // broadcast global non appelé
      expect((client.broadcast as any).emit).not.toHaveBeenCalled();
    });

    it("player_left (reconnexion) est émis dans la room mapId, pas en global", async () => {
      const player = makePlayer({ mapId: 2 });
      const worldService = {
        joinPlayer: jest.fn().mockResolvedValue({ player, previousSocketId: 'old-socket' }),
        getPlayersExcept: jest.fn().mockReturnValue([]),
      };
      const { gateway } = makeGateway(worldService);
      const client = makeClient();

      await gateway.handleJoinWorld(client, { characterId: 'char-1', name: 'Hero' });

      const serverTo = (gateway as any).server.to;
      expect(serverTo).toHaveBeenCalledWith(getMapRoomId(2));
      // server.emit global non appelé pour player_left
      expect((gateway as any).server.emit).not.toHaveBeenCalled();
    });

    it("map:2 distinct de map:1 — les rooms sont isolées", () => {
      expect(getMapRoomId(1)).toBe('map:1');
      expect(getMapRoomId(2)).toBe('map:2');
      expect(getMapRoomId(1)).not.toBe(getMapRoomId(2));
    });

    it("current_players est filtré par mapId du joueur qui rejoint", async () => {
      const player = makePlayer({ mapId: 3 });
      const getPlayersExcept = jest.fn().mockReturnValue([]);
      const worldService = {
        joinPlayer: jest.fn().mockResolvedValue({ player, previousSocketId: null }),
        getPlayersExcept,
      };
      const { gateway } = makeGateway(worldService);
      const client = makeClient();

      await gateway.handleJoinWorld(client, { characterId: 'char-1', name: 'Hero' });

      // getPlayersExcept doit recevoir le mapId du joueur
      expect(getPlayersExcept).toHaveBeenCalledWith(client.id, 3);
    });
  });

  describe('player_move', () => {
    it('mouvement accepté : player_moved est émis dans la room du joueur, pas en broadcast global', () => {
      const player = makePlayer({ mapId: 1 });
      const worldService = {
        updatePlayer: jest.fn().mockReturnValue({ status: 'accepted', player }),
      };
      const { gateway } = makeGateway(worldService);
      const client = makeClient({
        data: { player: { mapId: 1 } },
      });

      gateway.handlePlayerMove(client, {
        worldX: 1024,
        worldY: 2048,
        mapId: 1,
      });

      const broadcastTo = (client.broadcast as any).to;
      expect(broadcastTo).toHaveBeenCalledWith(getMapRoomId(1));
      expect((client.broadcast as any).emit).not.toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalledWith(
        'player_position_correction',
        expect.anything(),
      );
    });

    it('mouvement rejeté : player_position_correction émis au seul client fautif, pas de player_moved', () => {
      const player = makePlayer({ mapId: 1, worldX: 1600, worldY: 8000 });
      const worldService = {
        updatePlayer: jest.fn().mockReturnValue({
          status: 'rejected',
          player,
          reason: 'speed_limit',
        }),
      };
      const { gateway } = makeGateway(worldService);
      const client = makeClient({
        data: { player: { mapId: 1 } },
      });

      gateway.handlePlayerMove(client, {
        worldX: 999_999,
        worldY: 0,
        mapId: 1,
      });

      expect(client.emit).toHaveBeenCalledWith(
        'player_position_correction',
        expect.objectContaining({
          worldX: 1600,
          worldY: 8000,
          mapId: 1,
          reason: 'speed_limit',
          serverTime: expect.any(Number),
        }),
      );
      // Aucun broadcast : ni la room ni les autres clients ne voient le rejet.
      expect((client.broadcast as any).to).not.toHaveBeenCalled();
    });

    it('mouvement rejeté en rate_limit : drop silencieux, aucune correction émise', () => {
      const player = makePlayer({ mapId: 1 });
      const worldService = {
        updatePlayer: jest.fn().mockReturnValue({
          status: 'rejected',
          player,
          reason: 'rate_limit',
        }),
      };
      const { gateway } = makeGateway(worldService);
      const client = makeClient({
        data: { player: { mapId: 1 } },
      });

      gateway.handlePlayerMove(client, {
        worldX: 1024,
        worldY: 2048,
        mapId: 1,
      });

      expect(client.emit).not.toHaveBeenCalled();
      expect((client.broadcast as any).to).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it("player_left (déconnexion) est émis dans la room du joueur, pas en broadcast global", async () => {
      const player = makePlayer({ mapId: 1 });
      const worldService = {
        removePlayer: jest.fn().mockReturnValue(player),
        persistPlayerPosition: jest.fn().mockResolvedValue(undefined),
      };
      const { gateway } = makeGateway(worldService);
      const client = makeClient();

      await gateway.handleDisconnect(client);

      const broadcastTo = (client.broadcast as any).to;
      expect(broadcastTo).toHaveBeenCalledWith(getMapRoomId(1));
      expect((client.broadcast as any).emit).not.toHaveBeenCalled();
    });
  });
});
