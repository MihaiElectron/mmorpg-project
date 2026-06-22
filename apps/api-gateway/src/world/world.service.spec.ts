import { ConnectedPlayer, WorldService } from './world.service';
import { WorldSocket } from '../types/world-socket';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSocket(overrides: Partial<WorldSocket> = {}): WorldSocket {
  return {
    id: 'socket-1',
    data: { player: undefined as any, userId: 'user-1', role: 'player' },
    emit: jest.fn(),
    ...overrides,
  } as unknown as WorldSocket;
}

function makePlayer(overrides: Partial<ConnectedPlayer> = {}): ConnectedPlayer {
  return {
    socketId: 'socket-1',
    characterId: 'char-1',
    name: 'Test',
    worldX: 1600,
    worldY: 8000,
    mapId: 1,
    x: 600,
    y: 300,
    direction: 'down',
    ...overrides,
  };
}

function makeService(): WorldService {
  const charRepo = { find: jest.fn(), findOne: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn() };
  const respawnRepo = { find: jest.fn(), count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn() };
  const svc = new WorldService(charRepo as any, respawnRepo as any);
  return svc;
}

function injectPlayer(svc: WorldService, socket: WorldSocket, player: ConnectedPlayer) {
  (svc as any).connectedPlayers.set(socket.id, player);
}

// ─── updatePlayer — cas normaux ───────────────────────────────────────────────

describe('WorldService.updatePlayer — vérité WU prioritaire', () => {
  it('met à jour worldX/worldY avant x/y', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, x: 400, y: 300 });
    injectPlayer(svc, socket, player);

    // pixel(600, 300) → WU(1600, 8000)
    svc.updatePlayer(socket, { x: 600, y: 300 });

    expect(player.worldX).toBe(1600);
    expect(player.worldY).toBe(8000);
    expect(player.x).toBe(600);
    expect(player.y).toBe(300);
  });

  it('met à jour la direction sans affecter la position si seulement direction change', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1600, worldY: 8000, x: 600, y: 300, direction: 'down' });
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: 600, y: 300, direction: 'up' });

    expect(player.direction).toBe('up');
    expect(player.worldX).toBe(1600);
    expect(player.worldY).toBe(8000);
  });

  it('conserve la direction précédente si non fournie', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ direction: 'left' });
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: 600, y: 300 });

    expect(player.direction).toBe('left');
  });

  it('mapId inchangé après updatePlayer', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ mapId: 1 });
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: 600, y: 300 });

    expect(player.mapId).toBe(1);
  });

  it('client.data.player reçoit x/y mis à jour', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ x: 400, y: 300 });
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: 700, y: 400 });

    expect(socket.data.player.x).toBe(700);
    expect(socket.data.player.y).toBe(400);
  });

  it('client.data.player reçoit worldX/worldY/mapId après updatePlayer', () => {
    const svc = makeService();
    const socket = makeSocket();
    // pixel(600, 300) → WU(1600, 8000)
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1, x: 400, y: 300 });
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: 600, y: 300 });

    expect(socket.data.player.worldX).toBe(1600);
    expect(socket.data.player.worldY).toBe(8000);
    expect(socket.data.player.mapId).toBe(1);
  });

  it('client.data.player garde worldX/worldY si payload invalide', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1600, worldY: 8000, mapId: 1, x: 600, y: 300 });
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: NaN, y: NaN });

    expect(socket.data.player.worldX).toBe(1600);
    expect(socket.data.player.worldY).toBe(8000);
    expect(socket.data.player.mapId).toBe(1);
  });

  it('retourne le ConnectedPlayer mis à jour', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer();
    injectPlayer(svc, socket, player);

    const result = svc.updatePlayer(socket, { x: 600, y: 300 });

    expect(result).toBe(player);
  });

  it('retourne null si le socket est inconnu', () => {
    const svc = makeService();
    const socket = makeSocket();

    const result = svc.updatePlayer(socket, { x: 600, y: 300 });

    expect(result).toBeNull();
  });
});

// ─── updatePlayer — garde-fous NaN / Infinity ─────────────────────────────────

describe('WorldService.updatePlayer — garde-fous coordonnées invalides', () => {
  it('NaN dans x : worldX/Y et x/y conservent leur valeur précédente', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1600, worldY: 8000, x: 600, y: 300 });
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: NaN, y: 300 });

    expect(player.worldX).toBe(1600);
    expect(player.worldY).toBe(8000);
    expect(player.x).toBe(600);
    expect(player.y).toBe(300);
  });

  it('NaN dans y : worldX/Y et x/y conservent leur valeur précédente', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1600, worldY: 8000, x: 600, y: 300 });
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: 600, y: NaN });

    expect(player.worldX).toBe(1600);
    expect(player.worldY).toBe(8000);
    expect(player.x).toBe(600);
    expect(player.y).toBe(300);
  });

  it('Infinity dans x : position conservée', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1600, worldY: 8000, x: 600, y: 300 });
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: Infinity, y: 300 });

    expect(player.worldX).toBe(1600);
    expect(player.x).toBe(600);
  });

  it('-Infinity dans y : position conservée', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1600, worldY: 8000, x: 600, y: 300 });
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: 600, y: -Infinity });

    expect(player.worldY).toBe(8000);
    expect(player.y).toBe(300);
  });

  it('payload invalide : client.data.player garde les coordonnées précédentes', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ x: 600, y: 300 });
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: NaN, y: NaN });

    expect(socket.data.player.x).toBe(600);
    expect(socket.data.player.y).toBe(300);
  });

  it('payload invalide : retourne quand même le player (direction mise à jour)', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ direction: 'down' });
    injectPlayer(svc, socket, player);

    const result = svc.updatePlayer(socket, { x: NaN, y: NaN, direction: 'right' });

    expect(result).toBe(player);
    expect(player.direction).toBe('right');
  });
});

// ─── updatePlayer — worldX/Y cohérence avec la projection isométrique ─────────

describe('WorldService.updatePlayer — cohérence WU ↔ pixels', () => {
  // pixel(400, 300) → WU(0, 9600) selon la projection isométrique du projet
  it('pixel(400, 300) → worldX=0 worldY=9600', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer();
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: 400, y: 300 });

    expect(player.worldX).toBe(0);
    expect(player.worldY).toBe(9600);
  });

  // pixel(600, 580) → WU(6080, 12480)
  it('pixel(600, 580) → worldX=6080 worldY=12480', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer();
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: 600, y: 580 });

    expect(player.worldX).toBe(6080);
    expect(player.worldY).toBe(12480);
  });

  it('pixel(600, 300) → worldX=1600 worldY=8000', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer();
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: 600, y: 300 });

    expect(player.worldX).toBe(1600);
    expect(player.worldY).toBe(8000);
  });
});
