import { ConnectedPlayer, MAX_REASONABLE_POSITION, WorldService } from './world.service';
import { WorldSocket } from '../types/world-socket';
import { wuToChunkIndex } from '../common/world-coordinates';

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

// ─── updatePlayer — chemin WU direct ─────────────────────────────────────────

describe('WorldService.updatePlayer — chemin WU direct', () => {
  it('utilise worldX/worldY/mapId directement si présents et valides', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1, x: 400, y: 300 });
    injectPlayer(svc, socket, player);

    // worldX=6080, worldY=12480 → pixel(600, 580)
    svc.updatePlayer(socket, { x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 1 });

    expect(player.worldX).toBe(6080);
    expect(player.worldY).toBe(12480);
    expect(player.mapId).toBe(1);
    expect(player.x).toBe(600);
    expect(player.y).toBe(580);
  });

  it('dérive le cache pixel depuis worldX/Y (chemin WU — ne lit pas payload.x/y)', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, x: 400, y: 300 });
    injectPlayer(svc, socket, player);

    // On passe des pixels incohérents avec worldX/Y — le chemin WU doit les ignorer
    svc.updatePlayer(socket, { x: 999, y: 999, worldX: 6080, worldY: 12480, mapId: 1 });

    expect(player.x).toBe(600);  // dérivé de worldX/Y, pas de payload.x
    expect(player.y).toBe(580);
  });

  it('met à jour mapId via le chemin WU', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ mapId: 1 });
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: 600, y: 580, worldX: 6080, worldY: 12480, mapId: 2 });

    expect(player.mapId).toBe(2);
  });

  it('tombe en fallback pixel si worldX manquant', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1, x: 400, y: 300 });
    injectPlayer(svc, socket, player);

    // worldY et mapId présents mais worldX absent → fallback pixel
    svc.updatePlayer(socket, { x: 600, y: 300, worldY: 12480, mapId: 1 });

    expect(player.worldX).toBe(1600);  // converti depuis pixel(600, 300)
    expect(player.worldY).toBe(8000);
  });

  it('tombe en fallback pixel si mapId manquant', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1, x: 400, y: 300 });
    injectPlayer(svc, socket, player);

    // worldX et worldY présents mais mapId absent → fallback pixel
    svc.updatePlayer(socket, { x: 600, y: 300, worldX: 6080, worldY: 12480 });

    expect(player.worldX).toBe(1600);  // converti depuis pixel(600, 300)
    expect(player.worldY).toBe(8000);
  });

  it('tombe en fallback pixel si worldX est NaN', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1, x: 400, y: 300 });
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: 600, y: 300, worldX: NaN, worldY: 12480, mapId: 1 });

    expect(player.worldX).toBe(1600);  // fallback pixel
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

// ─── updatePlayer — instrumentation passive Movement Authority P1 ─────────────

describe('WorldService.updatePlayer — métriques passives mouvement', () => {
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  function silenceMovementLogs(svc: WorldService) {
    jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
  }

  it('compte un mouvement normal sans anomalie et sans rejet', () => {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1_600, worldY: 8_000, mapId: 1 });
    injectPlayer(svc, socket, player);

    const result = svc.updatePlayer(socket, {
      x: 606,
      y: 306,
      worldX: 1_700,
      worldY: 8_100,
      mapId: 1,
    });

    expect(result).toBe(player);
    expect(player.worldX).toBe(1_700);
    expect(player.worldY).toBe(8_100);
    expect(svc.getMovementMetrics()).toEqual({
      totalMoves: 1,
      suspectTeleports: 0,
      suspectSpeed: 0,
      invalidCoordinates: 0,
      mapMismatch: 0,
    });
  });

  it('détecte une vitesse suspecte mais accepte le mouvement', () => {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1 });
    injectPlayer(svc, socket, player);

    svc.updatePlayer(socket, { x: 1_000, y: 0, worldX: 0, worldY: 0, mapId: 1 });
    nowSpy.mockReturnValue(1_100);
    const result = svc.updatePlayer(socket, {
      x: 1_125,
      y: 63,
      worldX: 2_000,
      worldY: 0,
      mapId: 1,
    });

    expect(result).toBe(player);
    expect(player.worldX).toBe(2_000);
    expect(svc.getMovementMetrics().suspectSpeed).toBe(1);
  });

  it('détecte une téléportation suspecte mais accepte le mouvement', () => {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1 });
    injectPlayer(svc, socket, player);

    const result = svc.updatePlayer(socket, {
      x: 1_625,
      y: 313,
      worldX: 10_000,
      worldY: 0,
      mapId: 1,
    });

    expect(result).toBe(player);
    expect(player.worldX).toBe(10_000);
    expect(svc.getMovementMetrics().suspectTeleports).toBe(1);
  });

  it('détecte des coordonnées invalides sans rejeter le fallback existant', () => {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1, x: 400, y: 300 });
    injectPlayer(svc, socket, player);

    const result = svc.updatePlayer(socket, {
      x: 600,
      y: 300,
      worldX: NaN,
      worldY: 12_480,
      mapId: 1,
    });

    expect(result).toBe(player);
    expect(player.worldX).toBe(1_600);
    expect(player.worldY).toBe(8_000);
    expect(svc.getMovementMetrics().invalidCoordinates).toBe(1);
  });

  it('détecte une position hors plage raisonnable sans rejet', () => {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1 });
    injectPlayer(svc, socket, player);

    const hugeWorldX = MAX_REASONABLE_POSITION + 1;
    const result = svc.updatePlayer(socket, {
      x: 8_389_608,
      y: 4_194_304,
      worldX: hugeWorldX,
      worldY: 0,
      mapId: 1,
    });

    expect(result).toBe(player);
    expect(player.worldX).toBe(hugeWorldX);
    expect(svc.getMovementMetrics().invalidCoordinates).toBe(1);
  });

  it('détecte un map mismatch mais conserve le comportement actuel', () => {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1_600, worldY: 8_000, mapId: 1 });
    injectPlayer(svc, socket, player);

    const result = svc.updatePlayer(socket, {
      x: 600,
      y: 300,
      worldX: 1_600,
      worldY: 8_000,
      mapId: 2,
    });

    expect(result).toBe(player);
    expect(player.mapId).toBe(2);
    expect(svc.getMovementMetrics().mapMismatch).toBe(1);
  });
});

// ─── teleportCharacter ────────────────────────────────────────────────────────

describe('WorldService.teleportCharacter', () => {
  function makeServer() {
    const emitted: { event: string; payload: any }[] = [];
    const socketEmit = jest.fn((event: string, payload: any) => { emitted.push({ event, payload }); });
    const server = {
      to: jest.fn().mockReturnValue({ emit: socketEmit }),
      except: jest.fn().mockReturnValue({ emit: jest.fn() }),
    } as unknown as any;
    return { server, emitted, socketEmit };
  }

  it("émet character_teleport avec worldX/worldY/characterId/chunkX/chunkY", async () => {
    const svc = makeService();
    const socket = makeSocket();
    // pixel(600, 300) → WU(1600, 8000) selon la projection isométrique
    const player = makePlayer({ worldX: 1600, worldY: 8000, x: 600, y: 300 });
    injectPlayer(svc, socket, player);

    const { server, emitted } = makeServer();
    // téléportation en pixel(600, 580) → WU(6080, 12480) selon ADR-0001
    await svc.teleportCharacter('char-1', 600, 580, server);

    expect(emitted).toHaveLength(1);
    const payload = emitted[0].payload;
    expect(emitted[0].event).toBe('character_teleport');
    expect(payload.characterId).toBe('char-1');
    expect(payload.worldX).toBe(6080);
    expect(payload.worldY).toBe(12480);
    expect(payload.chunkX).toBe(0);  // 6080 >> 16 = 0
    expect(payload.chunkY).toBe(0);  // 12480 >> 16 = 0
    expect(payload.mapId).toBeDefined();
  });

  it("met à jour le player.worldX/worldY en mémoire après téléportation", async () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer();
    injectPlayer(svc, socket, player);

    const { server } = makeServer();
    await svc.teleportCharacter('char-1', 600, 580, server);

    expect(player.worldX).toBe(6080);
    expect(player.worldY).toBe(12480);
  });

  it("retourne null si le personnage n'est pas connecté", async () => {
    const svc = makeService();
    const { server } = makeServer();
    const result = await svc.teleportCharacter('inexistant', 600, 300, server);
    expect(result).toBeNull();
  });

  it("conserve worldX/Y précédent si la position cible est hors isométrie", async () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1600, worldY: 8000 });
    injectPlayer(svc, socket, player);

    const { server } = makeServer();
    // Coordonnées pixel impossibles à convertir → fallback sur la valeur précédente
    await svc.teleportCharacter('char-1', NaN, NaN, server);

    // Le player ne bouge pas si rx/ry sont NaN
    expect(player.worldX).toBe(1600);
    expect(player.worldY).toBe(8000);
  });
});

// ─── respawnCharacter ─────────────────────────────────────────────────────────

describe('WorldService.respawnCharacter', () => {
  function makeRespawnServer() {
    const emitted: { event: string; payload: any }[] = [];
    const socketEmit = jest.fn((event: string, payload: any) => { emitted.push({ event, payload }); });
    const server = {
      to: jest.fn().mockReturnValue({ emit: socketEmit }),
      except: jest.fn().mockReturnValue({ emit: jest.fn() }),
    } as unknown as any;
    return { server, emitted };
  }

  function makeRespawnService(
    character: Partial<{ id: string; health: number; maxHealth: number; worldX: number; worldY: number; mapId: number; positionX: number; positionY: number }>,
    respawnPoint: Partial<{ worldX: number; worldY: number; mapId: number; x: number; y: number; radius: number }>,
  ) {
    const charRepo = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue({ id: 'char-1', health: 0, maxHealth: 100, worldX: 1600, worldY: 8000, mapId: 1, positionX: 600, positionY: 300, ...character }),
      update: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(1),
      save: jest.fn(),
      create: jest.fn(),
    };
    const respawnRepo = {
      find: jest.fn().mockResolvedValue([{ worldX: 0, worldY: 0, mapId: 1, x: 0, y: 0, radius: 0, ...respawnPoint }]),
      count: jest.fn().mockResolvedValue(1),
      save: jest.fn(),
      create: jest.fn(),
    };
    return new WorldService(charRepo as any, respawnRepo as any);
  }

  it("émet character_respawn avec worldX/worldY/characterId/chunkX/chunkY", async () => {
    // pixel(600, 300) → WU(1600, 8000) ; point de respawn à worldX=0, worldY=0, map=1
    const svc = makeRespawnService(
      { id: 'char-1', maxHealth: 100, worldX: 1600, worldY: 8000, mapId: 1, positionX: 600, positionY: 300 },
      { worldX: 0, worldY: 0, mapId: 1, radius: 0 },
    );

    // Connecter un joueur pour que l'emit soit possible
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1600, worldY: 8000, x: 600, y: 300 });
    injectPlayer(svc, socket, player);

    const { server, emitted } = makeRespawnServer();
    await svc.respawnCharacter('char-1', server);

    expect(emitted).toHaveLength(1);
    const payload = emitted[0].payload;
    expect(emitted[0].event).toBe('character_respawn');
    expect(payload.characterId).toBe('char-1');
    expect(typeof payload.worldX).toBe('number');
    expect(typeof payload.worldY).toBe('number');
    expect(payload.chunkX).toBe(wuToChunkIndex(payload.worldX));
    expect(payload.chunkY).toBe(wuToChunkIndex(payload.worldY));
    expect(payload.health).toBe(100);
  });

  it("ne fait rien si le personnage est introuvable", async () => {
    const charRepo = {
      find: jest.fn(), findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(), count: jest.fn().mockResolvedValue(0), save: jest.fn(), create: jest.fn(),
    };
    const respawnRepo = {
      find: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), save: jest.fn(), create: jest.fn(),
    };
    const svc = new WorldService(charRepo as any, respawnRepo as any);
    const { server, emitted } = makeRespawnServer();
    await svc.respawnCharacter('inexistant', server);
    expect(emitted).toHaveLength(0);
  });

  it("ne fait rien si aucun respawn point disponible", async () => {
    const svc = makeRespawnService({ id: 'char-1' }, {});
    (svc as any).respawnPointRepository = { find: jest.fn().mockResolvedValue([]) };
    const { server, emitted } = makeRespawnServer();
    await svc.respawnCharacter('char-1', server);
    expect(emitted).toHaveLength(0);
  });
});
