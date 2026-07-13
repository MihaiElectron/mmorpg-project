import { ConnectedPlayer, MAX_REASONABLE_POSITION, WorldService } from './world.service';
import { WorldSocket } from '../types/world-socket';
import { wuToChunkIndex, DEFAULT_MAP_ID } from '../common/world-coordinates';

// Fallback vide → CharacterStatsCalculator retombe sur DEFAULT_DERIVED_STAT_DEFINITIONS
// (mêmes valeurs que les anciennes formules hardcodées).
const derivedStatsMock = { getDefinitions: jest.fn().mockResolvedValue([]) };
const masteryEffectsMock = { getPermanentStatModifiers: jest.fn().mockResolvedValue({ percent: {}, flat: {} }) };

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
    direction: 'down',
    ...overrides,
  };
}

function makeService(): WorldService {
  const charRepo = { find: jest.fn(), findOne: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn() };
  const respawnRepo = { find: jest.fn(), count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn() };
  const svc = new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
  return svc;
}

function injectPlayer(svc: WorldService, socket: WorldSocket, player: ConnectedPlayer) {
  (svc as any).connectedPlayers.set(socket.id, player);
}

// ─── Helpers mouvement (M4 Phase A) ──────────────────────────────────────────

// Prépare l'état d'observation pour simuler un joueur déjà en mouvement :
// dernier mouvement validé il y a `validatedAgoMs`, dernière proposition il y
// a `proposalAgoMs` (échappe au rate-limit par défaut).
function primeMovement(
  svc: WorldService,
  socketId: string,
  opts: { validatedAgoMs?: number; proposalAgoMs?: number } = {},
) {
  const now = Date.now();
  (svc as any).movementObservation.set(socketId, {
    lastValidatedAt: now - (opts.validatedAgoMs ?? 200),
    lastProposalAt: now - (opts.proposalAgoMs ?? 200),
    lastSuspectLogAt: {},
  });
}

function silenceMovementLogs(svc: WorldService) {
  jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
}

// ─── updatePlayer — validation M4 Phase A : mouvements acceptés ──────────────

describe('WorldService.updatePlayer — mouvements acceptés', () => {
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('accepte un déplacement plausible et met à jour la position runtime', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1600, worldY: 8000, mapId: 1 });
    injectPlayer(svc, socket, player);
    primeMovement(svc, socket.id, { validatedAgoMs: 200 });

    const result = svc.updatePlayer(socket, {
      worldX: 1700,
      worldY: 8100,
      mapId: 1,
    });

    expect(result).toEqual({ status: 'accepted', player });
    expect(player.worldX).toBe(1700);
    expect(player.worldY).toBe(8100);
    expect(socket.data.player.worldX).toBe(1700);
    expect(socket.data.player.worldY).toBe(8100);
  });

  it('met à jour la direction et la conserve si non fournie', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({
      worldX: 1600,
      worldY: 8000,
      direction: 'left',
    });
    injectPlayer(svc, socket, player);
    primeMovement(svc, socket.id);

    svc.updatePlayer(socket, {
      worldX: 1650,
      worldY: 8000,
      mapId: 1,
      direction: 'up',
    });
    expect(player.direction).toBe('up');

    primeMovement(svc, socket.id);
    svc.updatePlayer(socket, { worldX: 1700, worldY: 8000, mapId: 1 });
    expect(player.direction).toBe('up');
  });

  it('premier mouvement après join : un petit déplacement ne subit aucun faux rejet', () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1600, worldY: 8000, mapId: 1 });
    injectPlayer(svc, socket, player);
    // Pas de primeMovement : l'état est créé paresseusement comme au join
    // (lastValidatedAt = maintenant). Le plancher PLAYER_MOVE_MIN_DT_MS
    // garantit un budget minimal.

    const result = svc.updatePlayer(socket, {
      worldX: 1700,
      worldY: 8000,
      mapId: 1,
    });

    expect(result).toEqual({ status: 'accepted', player });
    expect(player.worldX).toBe(1700);
  });

  it('retourne null si le socket est inconnu', () => {
    const svc = makeService();
    const socket = makeSocket();

    const result = svc.updatePlayer(socket, {
      worldX: 1600,
      worldY: 8000,
      mapId: 1,
    });

    expect(result).toBeNull();
  });
});

// ─── updatePlayer — rejets : payload invalide ─────────────────────────────────

describe('WorldService.updatePlayer — rejet payload invalide', () => {
  function rejectCase(payload: {
    worldX: number;
    worldY: number;
    mapId: number;
  }) {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({
      worldX: 1600,
      worldY: 8000,
      mapId: 1,
      direction: 'down',
    });
    socket.data.player = { ...player };
    injectPlayer(svc, socket, player);
    primeMovement(svc, socket.id);

    const result = svc.updatePlayer(socket, payload);
    return { svc, socket, player, result };
  }

  it('worldX NaN : rejet invalid_payload, position et miroir socket inchangés', () => {
    const { svc, socket, player, result } = rejectCase({
      worldX: NaN,
      worldY: 8000,
      mapId: 1,
    });

    expect(result).toEqual({
      status: 'rejected',
      player,
      reason: 'invalid_payload',
    });
    expect(player.worldX).toBe(1600);
    expect(player.worldY).toBe(8000);
    expect(socket.data.player.worldX).toBe(1600);
    expect(svc.getMovementMetrics().invalidCoordinates).toBe(1);
    expect(svc.getMovementMetrics().rejectedMoves).toBe(1);
  });

  it('Infinity dans worldX : rejet invalid_payload', () => {
    const { player, result } = rejectCase({
      worldX: Infinity,
      worldY: 8000,
      mapId: 1,
    });
    expect(result).toEqual({
      status: 'rejected',
      player,
      reason: 'invalid_payload',
    });
    expect(player.worldX).toBe(1600);
  });

  it('mapId NaN : rejet invalid_payload', () => {
    const { player, result } = rejectCase({
      worldX: 1600,
      worldY: 8000,
      mapId: NaN,
    });
    expect(result).toEqual({
      status: 'rejected',
      player,
      reason: 'invalid_payload',
    });
  });

  it('position au-delà de MAX_REASONABLE_POSITION : rejet invalid_payload', () => {
    const { player, result } = rejectCase({
      worldX: MAX_REASONABLE_POSITION + 1,
      worldY: 0,
      mapId: 1,
    });
    expect(result).toEqual({
      status: 'rejected',
      player,
      reason: 'invalid_payload',
    });
    expect(player.worldX).toBe(1600);
  });

  it('payload rejeté ne modifie pas la direction', () => {
    const { player } = rejectCase({ worldX: NaN, worldY: NaN, mapId: 1 });
    expect(player.direction).toBe('down');
  });
});

// ─── updatePlayer — rejets : mapId incohérent ────────────────────────────────

describe('WorldService.updatePlayer — rejet map_mismatch', () => {
  it('un mapId différent du mapId serveur est rejeté et ne change pas la map', () => {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1600, worldY: 8000, mapId: 1 });
    injectPlayer(svc, socket, player);
    primeMovement(svc, socket.id);

    const result = svc.updatePlayer(socket, {
      worldX: 1600,
      worldY: 8000,
      mapId: 2,
    });

    expect(result).toEqual({
      status: 'rejected',
      player,
      reason: 'map_mismatch',
    });
    expect(player.mapId).toBe(1);
    expect(svc.getMovementMetrics().mapMismatch).toBe(1);
    expect(svc.getMovementMetrics().rejectedMoves).toBe(1);
  });
});

// ─── updatePlayer — rejets : distance gate (téléportation / speedhack) ───────

describe('WorldService.updatePlayer — rejet distance gate', () => {
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('téléportation évidente rejetée : position inchangée, pas de mise à jour du miroir', () => {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1 });
    socket.data.player = { ...player };
    injectPlayer(svc, socket, player);
    primeMovement(svc, socket.id, { validatedAgoMs: 200 });

    const result = svc.updatePlayer(socket, {
      worldX: 50_000,
      worldY: 0,
      mapId: 1,
    });

    expect(result).toEqual({
      status: 'rejected',
      player,
      reason: 'speed_limit',
    });
    expect(player.worldX).toBe(0);
    expect(player.worldY).toBe(0);
    expect(socket.data.player.worldX).toBe(0);
    expect(svc.getMovementMetrics().suspectTeleports).toBe(1);
    expect(svc.getMovementMetrics().rejectedMoves).toBe(1);
  });

  it('speedhack modéré (~x2) rejeté en SPEED_SUSPECT', () => {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1 });
    injectPlayer(svc, socket, player);
    // dt = 200 ms → budget = 3600 × 1.5 × 0.2 = 1080 WU. 2000 WU ≈ x2 la
    // vitesse légitime max : doit être rejeté.
    primeMovement(svc, socket.id, { validatedAgoMs: 200 });

    const result = svc.updatePlayer(socket, {
      worldX: 2_000,
      worldY: 0,
      mapId: 1,
    });

    expect(result).toEqual({
      status: 'rejected',
      player,
      reason: 'speed_limit',
    });
    expect(player.worldX).toBe(0);
    expect(svc.getMovementMetrics().suspectSpeed).toBe(1);
  });

  it('un dt très long est capé : pas de saut illimité après une longue inactivité', () => {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1 });
    injectPlayer(svc, socket, player);
    // 1 h sans mouvement validé : le budget reste capé à
    // 3600 × 1.5 × (PLAYER_MOVE_MAX_DT_MS / 1000) = 5 400 WU.
    primeMovement(svc, socket.id, { validatedAgoMs: 3_600_000 });

    const rejected = svc.updatePlayer(socket, {
      worldX: 8_000,
      worldY: 0,
      mapId: 1,
    });
    expect(rejected).toEqual({
      status: 'rejected',
      player,
      reason: 'speed_limit',
    });
    expect(player.worldX).toBe(0);

    primeMovement(svc, socket.id, { validatedAgoMs: 3_600_000 });
    const accepted = svc.updatePlayer(socket, {
      worldX: 5_000,
      worldY: 0,
      mapId: 1,
    });
    expect(accepted).toEqual({ status: 'accepted', player });
    expect(player.worldX).toBe(5_000);
  });

  it('un déplacement dans le budget juste après un rejet reste accepté', () => {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1 });
    injectPlayer(svc, socket, player);
    primeMovement(svc, socket.id, { validatedAgoMs: 200 });

    svc.updatePlayer(socket, { worldX: 50_000, worldY: 0, mapId: 1 }); // rejeté

    primeMovement(svc, socket.id, { validatedAgoMs: 200 });
    const result = svc.updatePlayer(socket, {
      worldX: 100,
      worldY: 100,
      mapId: 1,
    });

    expect(result).toEqual({ status: 'accepted', player });
    expect(player.worldX).toBe(100);
  });
});

// ─── updatePlayer — rejets : rate-limit serveur ───────────────────────────────

describe('WorldService.updatePlayer — rate-limit', () => {
  it('une proposition trop rapprochée est rejetée en rate_limit sans compteur suspect', () => {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1600, worldY: 8000, mapId: 1 });
    injectPlayer(svc, socket, player);
    primeMovement(svc, socket.id, { proposalAgoMs: 5 });

    const result = svc.updatePlayer(socket, {
      worldX: 1650,
      worldY: 8000,
      mapId: 1,
    });

    expect(result).toEqual({
      status: 'rejected',
      player,
      reason: 'rate_limit',
    });
    expect(player.worldX).toBe(1600);
    const metrics = svc.getMovementMetrics();
    expect(metrics.rejectedMoves).toBe(1);
    expect(metrics.suspectTeleports).toBe(0);
    expect(metrics.suspectSpeed).toBe(0);
    expect(metrics.invalidCoordinates).toBe(0);
  });
});

// ─── updatePlayer — resynchronisation après mouvement forcé ──────────────────

describe('WorldService.updatePlayer — resynchronisation après teleport', () => {
  it('un mouvement légitime juste après teleportCharacter est accepté (pas de faux suspect)', async () => {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1 });
    injectPlayer(svc, socket, player);
    primeMovement(svc, socket.id, { validatedAgoMs: 200 });

    const emit = jest.fn();
    const server = {
      to: jest.fn().mockReturnValue({ emit }),
      except: jest.fn().mockReturnValue({ emit }),
    } as any;

    await svc.teleportCharacter(player.characterId, 40_000, 40_000, server);
    expect(player.worldX).toBe(40_000);

    // Petit déplacement depuis la NOUVELLE position : doit passer sans rejet.
    const result = svc.updatePlayer(socket, {
      worldX: 40_100,
      worldY: 40_050,
      mapId: 1,
    });

    expect(result).toEqual({ status: 'accepted', player });
    expect(player.worldX).toBe(40_100);
    expect(svc.getMovementMetrics().rejectedMoves).toBe(0);
    expect(svc.getMovementMetrics().suspectTeleports).toBe(0);
  });
});

// ─── métriques : reset ────────────────────────────────────────────────────────

describe('WorldService — métriques mouvement', () => {
  it('resetMovementMetrics remet tous les compteurs à zéro sans toucher les joueurs', () => {
    const svc = makeService();
    silenceMovementLogs(svc);
    const socket = makeSocket();
    const player = makePlayer({ worldX: 0, worldY: 0, mapId: 1 });
    injectPlayer(svc, socket, player);
    primeMovement(svc, socket.id);

    svc.updatePlayer(socket, { worldX: 50_000, worldY: 0, mapId: 1 }); // rejeté

    expect(svc.getMovementMetrics().rejectedMoves).toBe(1);

    const reset = svc.resetMovementMetrics();

    expect(reset).toEqual({
      totalMoves: 0,
      rejectedMoves: 0,
      suspectTeleports: 0,
      suspectSpeed: 0,
      invalidCoordinates: 0,
      mapMismatch: 0,
    });
    expect(svc.getAllConnectedPlayers()).toHaveLength(1);
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
    const player = makePlayer({ worldX: 1600, worldY: 8000 });
    injectPlayer(svc, socket, player);

    const { server, emitted } = makeServer();
    // Téléportation WU(6080, 12480) — P6 : le gateway envoie déjà des WU
    await svc.teleportCharacter('char-1', 6080, 12480, server);

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
    await svc.teleportCharacter('char-1', 6080, 12480, server);

    expect(player.worldX).toBe(6080);
    expect(player.worldY).toBe(12480);
  });

  it("retourne null si le personnage n'est pas connecté", async () => {
    const svc = makeService();
    const { server } = makeServer();
    const result = await svc.teleportCharacter('inexistant', 1600, 8000, server);
    expect(result).toBeNull();
  });

  it("retourne null si les coordonnées WU sont NaN", async () => {
    const svc = makeService();
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1600, worldY: 8000 });
    injectPlayer(svc, socket, player);

    const { server } = makeServer();
    const result = await svc.teleportCharacter('char-1', NaN, NaN, server);

    expect(result).toBeNull();
    // Le player ne bouge pas
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
    return new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
  }

  it("émet character_respawn avec worldX/worldY/characterId/chunkX/chunkY", async () => {
    // pixel(600, 300) → WU(1600, 8000) ; point de respawn à worldX=0, worldY=0, map=1
    const svc = makeRespawnService(
      { id: 'char-1', maxHealth: 100, worldX: 1600, worldY: 8000, mapId: 1, positionX: 600, positionY: 300 },
      { worldX: 0, worldY: 0, mapId: 1, radius: 0 },
    );

    // Connecter un joueur pour que l'emit soit possible
    const socket = makeSocket();
    const player = makePlayer({ worldX: 1600, worldY: 8000 });
    injectPlayer(svc, socket, player);

    const { server, emitted } = makeRespawnServer();
    await svc.respawnCharacter('char-1', server);

    // character_respawn + character_resource_update (V1-K-A) au joueur.
    const respawnEvt = emitted.find((e) => e.event === 'character_respawn');
    expect(respawnEvt).toBeDefined();
    const payload = respawnEvt!.payload;
    expect(payload.characterId).toBe('char-1');
    expect(typeof payload.worldX).toBe('number');
    expect(typeof payload.worldY).toBe('number');
    expect(payload.chunkX).toBe(wuToChunkIndex(payload.worldX));
    expect(payload.chunkY).toBe(wuToChunkIndex(payload.worldY));
    expect(payload.health).toBe(100);

    // Ressources refaites au max dérivé et synchronisées.
    const resEvt = emitted.find((e) => e.event === 'character_resource_update');
    expect(resEvt).toBeDefined();
    expect(resEvt!.payload.characterId).toBe('char-1');
    expect(resEvt!.payload.mana).toBe(resEvt!.payload.maxMana);
    expect(resEvt!.payload.energy).toBe(resEvt!.payload.maxEnergy);
  });

  it("V5-F : un item avec maxHealth secondaire augmente les PV de respawn", async () => {
    // defs [] → DEFAULT defs (maxHealth = char.maxHealth + vitalité×10) + fallback
    // allowlist (maxHealth autorisé). Item +50 maxHealth via le canal flat.
    const svc = makeRespawnService(
      {
        id: 'char-1', maxHealth: 100, worldX: 1600, worldY: 8000, mapId: 1, positionX: 600, positionY: 300,
        equipment: [{ item: { statBonuses: { maxHealth: 50 } } }],
      } as any,
      { worldX: 0, worldY: 0, mapId: 1, radius: 0 },
    );
    const socket = makeSocket();
    injectPlayer(svc, socket, makePlayer({ worldX: 1600, worldY: 8000 }));
    const { server, emitted } = makeRespawnServer();
    await svc.respawnCharacter('char-1', server);
    const respawnEvt = emitted.find((e) => e.event === 'character_respawn');
    expect(respawnEvt).toBeDefined();
    expect(respawnEvt!.payload.health).toBe(150); // 100 base + 50 (item, canal flat)
  });

  it("ne fait rien si le personnage est introuvable", async () => {
    const charRepo = {
      find: jest.fn(), findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(), count: jest.fn().mockResolvedValue(0), save: jest.fn(), create: jest.fn(),
    };
    const respawnRepo = {
      find: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), save: jest.fn(), create: jest.fn(),
    };
    const svc = new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
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

// ─── P7-B : guards WU explicites ─────────────────────────────────────────────

describe('WorldService — P7-B : guards WU explicites', () => {
  function makeServer() {
    return { to: jest.fn().mockReturnValue({ emit: jest.fn() }), except: jest.fn().mockReturnValue({ emit: jest.fn() }) } as unknown as any;
  }

  describe('joinPlayer — retourne null si worldX/Y/mapId absent', () => {
    it('retourne null quand worldX est null', async () => {
      const charRepo = {
        find: jest.fn(), findOne: jest.fn().mockResolvedValue({ id: 'c-1', userId: 'u-1', worldX: null, worldY: 8000, mapId: 1, sex: 'male', name: 'Hero' }),
        update: jest.fn(), count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn(),
      };
      const respawnRepo = { count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn() };
      const svc = new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
      const socket = makeSocket({ data: { userId: 'u-1', role: 'player', player: undefined as any } });
      const result = await svc.joinPlayer(socket, { characterId: 'c-1', name: 'Hero' });
      expect(result).toBeNull();
    });

    it('retourne null quand mapId est null', async () => {
      const charRepo = {
        find: jest.fn(), findOne: jest.fn().mockResolvedValue({ id: 'c-1', userId: 'u-1', worldX: 1600, worldY: 8000, mapId: null, sex: 'male', name: 'Hero' }),
        update: jest.fn(), count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn(),
      };
      const respawnRepo = { count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn() };
      const svc = new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
      const socket = makeSocket({ data: { userId: 'u-1', role: 'player', player: undefined as any } });
      const result = await svc.joinPlayer(socket, { characterId: 'c-1', name: 'Hero' });
      expect(result).toBeNull();
    });
  });

  describe('joinPlayer — refill/clamp mana & énergie (V1-J-B)', () => {
    // maxMana = intelligence×10 + wisdom×5 ; maxEnergy = endurance×8 + agility×2.
    function makeCharRepo(overrides: Record<string, unknown>) {
      return {
        find: jest.fn(),
        findOne: jest.fn().mockResolvedValue({
          id: 'c-1', userId: 'u-1', name: 'Hero', sex: 'male',
          worldX: 1600, worldY: 8000, mapId: 1,
          health: 100, maxHealth: 100,
          baseIntelligence: 5, baseWisdom: 0, // maxMana = 50
          baseEndurance: 5, baseAgility: 0, // maxEnergy = 40
          mana: 0, energy: 0,
          ...overrides,
        }),
        update: jest.fn(), count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn(),
      };
    }
    function makeSvc(charRepo: any) {
      const respawnRepo = { count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn() };
      return new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
    }

    it('inclut les bonus d\'équipement dans les max au join (Équipement V1)', async () => {
      // Base int 0 → maxMana 0 sans équipement ; item +5 int → maxMana 50.
      const charRepo = makeCharRepo({
        baseIntelligence: 0, baseWisdom: 0, baseEndurance: 0, baseAgility: 0,
        mana: 0, energy: 0,
        equipment: [{ item: { statBonuses: { intelligence: 5 } } }],
      });
      const svc = makeSvc(charRepo);
      const socket = makeSocket({ data: { userId: 'u-1', role: 'player', player: undefined as any } });
      const result = await svc.joinPlayer(socket, { characterId: 'c-1', name: 'Hero' });
      // maxMana dérivé AVEC équipement = 50 (sinon 0 → aucune ressource).
      expect(result?.resources?.maxMana).toBe(50);
      expect(result?.resources?.mana).toBe(50);
    });

    it('refill V1 : mana/énergie à 0 → remontés aux max dérivés', async () => {
      const charRepo = makeCharRepo({ mana: 0, energy: 0 });
      const svc = makeSvc(charRepo);
      const socket = makeSocket({ data: { userId: 'u-1', role: 'player', player: undefined as any } });
      const result = await svc.joinPlayer(socket, { characterId: 'c-1', name: 'Hero' });
      expect(result).not.toBeNull();
      expect(charRepo.update).toHaveBeenCalledWith('c-1', { mana: 50, energy: 40 });
      // Snapshot renvoyé pour la sync UI (character_resource_update).
      expect(result?.resources).toEqual({
        characterId: 'c-1',
        health: 100,
        mana: 50,
        energy: 40,
        maxHealth: 100,
        maxMana: 50,
        maxEnergy: 40,
      });
    });

    it('clamp : mana/énergie au-dessus des max → ramenés aux max', async () => {
      const charRepo = makeCharRepo({ mana: 999, energy: 999 });
      const svc = makeSvc(charRepo);
      const socket = makeSocket({ data: { userId: 'u-1', role: 'player', player: undefined as any } });
      const result = await svc.joinPlayer(socket, { characterId: 'c-1', name: 'Hero' });
      expect(charRepo.update).toHaveBeenCalledWith('c-1', { mana: 50, energy: 40 });
      expect(result?.resources).toMatchObject({ mana: 50, energy: 40, maxMana: 50, maxEnergy: 40 });
    });

    it('aucune écriture si mana/énergie déjà dans [0, max] et non nuls, mais snapshot renvoyé', async () => {
      const charRepo = makeCharRepo({ mana: 30, energy: 20 });
      const svc = makeSvc(charRepo);
      const socket = makeSocket({ data: { userId: 'u-1', role: 'player', player: undefined as any } });
      const result = await svc.joinPlayer(socket, { characterId: 'c-1', name: 'Hero' });
      expect(charRepo.update).not.toHaveBeenCalled();
      // Même sans écriture DB, le snapshot reflète l'état courant pour l'UI.
      expect(result?.resources).toMatchObject({ mana: 30, energy: 20, maxMana: 50, maxEnergy: 40 });
    });
  });

  describe('respawnCharacter — retourne tôt si worldX/Y/mapId absent', () => {
    it('ne fait rien si character.worldX est null', async () => {
      const charRepo = {
        find: jest.fn(), findOne: jest.fn().mockResolvedValue({ id: 'c-1', maxHealth: 100, worldX: null, worldY: 8000, mapId: 1 }),
        update: jest.fn().mockResolvedValue(undefined), count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn(),
      };
      const respawnRepo = {
        find: jest.fn().mockResolvedValue([{ worldX: 0, worldY: 0, mapId: 1, radius: 0 }]),
        count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn(),
      };
      const svc = new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
      const server = makeServer();
      await svc.respawnCharacter('c-1', server);
      expect(charRepo.update).not.toHaveBeenCalled();
    });

    it('ignore un respawn point dont worldX est null', async () => {
      const charRepo = {
        find: jest.fn(), findOne: jest.fn().mockResolvedValue({ id: 'c-1', maxHealth: 100, worldX: 1600, worldY: 8000, mapId: 1 }),
        update: jest.fn().mockResolvedValue(undefined), count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn(),
      };
      const respawnRepo = {
        find: jest.fn().mockResolvedValue([{ worldX: null, worldY: 0, mapId: 1, radius: 0 }]),
        count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn(),
      };
      const svc = new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
      const server = makeServer();
      await svc.respawnCharacter('c-1', server);
      // Aucun point valide → nearestWU reste null → retour sans update
      expect(charRepo.update).not.toHaveBeenCalled();
    });
  });
});

// ─── onModuleInit — seed RespawnPoint WU (P7-A) ──────────────────────────────

describe('WorldService.onModuleInit — seed RespawnPoint (P7-A)', () => {
  function makeInitService() {
    const charRepo = { find: jest.fn().mockResolvedValue([]), update: jest.fn() };
    const created: Record<string, unknown>[] = [];
    const respawnRepo = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((a) => { created.push(a); return a; }),
      save: jest.fn().mockResolvedValue({}),
    };
    const svc = new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
    return { svc, respawnRepo, created };
  }

  it('crée le RespawnPoint avec worldX défini quand count=0', async () => {
    const { svc, created } = makeInitService();
    await svc.onModuleInit();
    expect(created[0]).toHaveProperty('worldX');
    expect(typeof created[0].worldX).toBe('number');
  });

  it('crée le RespawnPoint avec worldY défini quand count=0', async () => {
    const { svc, created } = makeInitService();
    await svc.onModuleInit();
    expect(created[0]).toHaveProperty('worldY');
    expect(typeof created[0].worldY).toBe('number');
  });

  it('crée le RespawnPoint avec mapId=DEFAULT_MAP_ID quand count=0', async () => {
    const { svc, created } = makeInitService();
    await svc.onModuleInit();
    expect(created[0]).toHaveProperty('mapId', DEFAULT_MAP_ID);
  });

  it('worldX=1600, worldY=8000 pour le spawn par défaut (600, 300) — ADR-0001', async () => {
    const { svc, created } = makeInitService();
    await svc.onModuleInit();
    expect(created[0].worldX).toBe(1600);
    expect(created[0].worldY).toBe(8000);
  });

  it('ne crée pas de RespawnPoint quand count > 0', async () => {
    const { svc, respawnRepo, created } = makeInitService();
    respawnRepo.count.mockResolvedValue(1);
    await svc.onModuleInit();
    expect(created).toHaveLength(0);
  });
});

// ─── validateInteraction ─────────────────────────────────────────────────────

describe("WorldService.validateInteraction", () => {
  const svc = makeService();

  const building = { worldX: 1000, worldY: 1000, mapId: 1 };
  const radius = 2048;

  it("retourne null si le personnage est à portée sur la même carte", () => {
    const char = { worldX: 1100, worldY: 1000, mapId: 1 };
    expect(svc.validateInteraction(char, building, radius)).toBeNull();
  });

  it("retourne un message si la carte est différente (mapId mismatch)", () => {
    const char = { worldX: 1000, worldY: 1000, mapId: 2 };
    const result = svc.validateInteraction(char, building, radius);
    expect(result).not.toBeNull();
    expect(result).toContain("Carte différente");
  });

  it("retourne un message si le personnage est trop loin (L∞ norm)", () => {
    const char = { worldX: 5000, worldY: 1000, mapId: 1 };
    const result = svc.validateInteraction(char, building, radius);
    expect(result).not.toBeNull();
    expect(result).toContain("Trop loin");
  });

  it("accepte un personnage exactement à la limite du rayon", () => {
    const char = { worldX: 1000 + radius, worldY: 1000, mapId: 1 };
    expect(svc.validateInteraction(char, building, radius)).toBeNull();
  });

  it("refuse un personnage d'un WU au-delà du rayon", () => {
    const char = { worldX: 1000 + radius + 1, worldY: 1000, mapId: 1 };
    expect(svc.validateInteraction(char, building, radius)).not.toBeNull();
  });
});

// ─── flushConnectedPlayerPositions — persistance à l'arrêt gracieux ──────────

describe('WorldService.flushConnectedPlayerPositions', () => {
  function makeRepos() {
    const charRepo = {
      find: jest.fn(), findOne: jest.fn(), update: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn(),
    };
    const respawnRepo = { find: jest.fn(), count: jest.fn().mockResolvedValue(1), save: jest.fn(), create: jest.fn() };
    return { charRepo, respawnRepo };
  }

  function silenceLogs(svc: WorldService) {
    jest.spyOn((svc as any).logger, 'log').mockImplementation(() => undefined);
    jest.spyOn((svc as any).logger, 'error').mockImplementation(() => undefined);
  }

  it('persiste la dernière position live après joinPlayer + updatePlayer', async () => {
    const { charRepo, respawnRepo } = makeRepos();
    charRepo.findOne.mockResolvedValue({
      id: 'c-1', userId: 'u-1', worldX: 1600, worldY: 8000, mapId: 1, sex: 'male', name: 'Hero',
    });
    const svc = new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
    silenceLogs(svc);

    const socket = makeSocket({ data: { userId: 'u-1', role: 'player', player: undefined as any } });
    await svc.joinPlayer(socket, { characterId: 'c-1', name: 'Hero' });
    // Fenêtre large pour éviter tout rejet du distance gate sur un déplacement modeste.
    primeMovement(svc, socket.id, { validatedAgoMs: 1000, proposalAgoMs: 1000 });

    const result = svc.updatePlayer(socket, { worldX: 1700, worldY: 8100, mapId: 1 });
    expect(result?.status).toBe('accepted');

    const flush = await svc.flushConnectedPlayerPositions();

    expect(charRepo.update).toHaveBeenCalledWith('c-1', { worldX: 1700, worldY: 8100, mapId: 1 });
    expect(flush).toEqual({ saved: 1, failed: 0 });
  });

  it('flush plusieurs joueurs connectés', async () => {
    const { charRepo, respawnRepo } = makeRepos();
    const svc = new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
    silenceLogs(svc);

    injectPlayer(svc, makeSocket({ id: 's-1' }), makePlayer({ socketId: 's-1', characterId: 'c-1', worldX: 10, worldY: 20 }));
    injectPlayer(svc, makeSocket({ id: 's-2' }), makePlayer({ socketId: 's-2', characterId: 'c-2', worldX: 30, worldY: 40 }));

    const flush = await svc.flushConnectedPlayerPositions();

    expect(charRepo.update).toHaveBeenCalledTimes(2);
    expect(charRepo.update).toHaveBeenCalledWith('c-1', { worldX: 10, worldY: 20, mapId: 1 });
    expect(charRepo.update).toHaveBeenCalledWith('c-2', { worldX: 30, worldY: 40, mapId: 1 });
    expect(flush).toEqual({ saved: 2, failed: 0 });
  });

  it("l'échec d'un joueur n'empêche pas la sauvegarde des autres", async () => {
    const { charRepo, respawnRepo } = makeRepos();
    charRepo.update.mockImplementation((id: string) =>
      id === 'c-bad' ? Promise.reject(new Error('DB down')) : Promise.resolve(undefined),
    );
    const svc = new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
    silenceLogs(svc);

    injectPlayer(svc, makeSocket({ id: 's-1' }), makePlayer({ socketId: 's-1', characterId: 'c-bad' }));
    injectPlayer(svc, makeSocket({ id: 's-2' }), makePlayer({ socketId: 's-2', characterId: 'c-ok', worldX: 55, worldY: 66 }));

    const flush = await svc.flushConnectedPlayerPositions();

    expect(charRepo.update).toHaveBeenCalledWith('c-ok', { worldX: 55, worldY: 66, mapId: 1 });
    expect(flush).toEqual({ saved: 1, failed: 1 });
  });

  it('ignore un joueur sans characterId valide (aucune écriture)', async () => {
    const { charRepo, respawnRepo } = makeRepos();
    const svc = new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
    silenceLogs(svc);

    injectPlayer(svc, makeSocket({ id: 's-1' }), makePlayer({ socketId: 's-1', characterId: '' }));
    injectPlayer(svc, makeSocket({ id: 's-2' }), makePlayer({ socketId: 's-2', characterId: 'c-ok', worldX: 7, worldY: 8 }));

    const flush = await svc.flushConnectedPlayerPositions();

    expect(charRepo.update).toHaveBeenCalledTimes(1);
    expect(charRepo.update).toHaveBeenCalledWith('c-ok', { worldX: 7, worldY: 8, mapId: 1 });
    expect(flush).toEqual({ saved: 1, failed: 0 });
  });

  it('ne persiste rien si aucun joueur connecté', async () => {
    const { charRepo, respawnRepo } = makeRepos();
    const svc = new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
    silenceLogs(svc);

    const flush = await svc.flushConnectedPlayerPositions();

    expect(charRepo.update).not.toHaveBeenCalled();
    expect(flush).toEqual({ saved: 0, failed: 0 });
  });

  it('onApplicationShutdown déclenche le flush sans relancer en cas d\'erreur', async () => {
    const { charRepo, respawnRepo } = makeRepos();
    const svc = new WorldService(charRepo as any, respawnRepo as any, derivedStatsMock as any, masteryEffectsMock as any);
    silenceLogs(svc);
    const flushSpy = jest.spyOn(svc, 'flushConnectedPlayerPositions').mockRejectedValue(new Error('boom'));

    await expect(svc.onApplicationShutdown('SIGINT')).resolves.toBeUndefined();
    expect(flushSpy).toHaveBeenCalled();
  });
});
