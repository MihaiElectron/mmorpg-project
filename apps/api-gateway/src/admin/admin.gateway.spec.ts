import { AdminGateway } from './admin.gateway';
import { WsAuthService } from '../common/ws-auth.service';
import { CreaturesService } from '../creatures/creatures.service';
import { WorldService } from '../world/world.service';
import { AdminService } from './admin.service';
import { ResourcesService } from '../resources/resources.service';
import type { WorldSocket } from '../types/world-socket';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeClient(data: Record<string, unknown> = {}): WorldSocket {
  return {
    id: 'socket-1',
    handshake: { auth: {}, headers: {} },
    data,
    disconnect: jest.fn(),
    emit: jest.fn(),
  } as unknown as WorldSocket;
}

function makeGateway(wsAuth: Partial<WsAuthService>) {
  return new AdminGateway(
    {} as unknown as CreaturesService,
    {} as unknown as WorldService,
    {} as unknown as AdminService,
    {} as unknown as ResourcesService,
    {} as unknown as import('../buildings/buildings.service').BuildingsService,
    wsAuth as WsAuthService,
    {} as unknown as import('../economy/economy.service').EconomyService,
    {} as unknown as import('typeorm').DataSource,
    {} as unknown as import('../item-materialization/item-materialization.service').ItemMaterializationService,
    {} as unknown as import('../items/item.service').ItemService,
    {} as unknown as import('../item-transfer/item-transfer.service').ItemTransferService,
  );
}

// ─── handleConnection ─────────────────────────────────────────────────────────

describe('AdminGateway — handleConnection', () => {
  it('déconnecte si JWT absent ou invalide', async () => {
    const wsAuth = { authenticate: jest.fn().mockResolvedValue(null) };
    const gateway = makeGateway(wsAuth);
    const client = makeClient();

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.data.role).toBeUndefined();
  });

  it('pose client.data.role = admin pour un JWT admin valide', async () => {
    const wsAuth = {
      authenticate: jest.fn().mockResolvedValue({ userId: 'u-1', role: 'admin' }),
    };
    const gateway = makeGateway(wsAuth);
    const client = makeClient();

    await gateway.handleConnection(client);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.userId).toBe('u-1');
    expect(client.data.role).toBe('admin');
  });

  it('accepte la connexion mais pose role = user pour un JWT user valide', async () => {
    const wsAuth = {
      authenticate: jest.fn().mockResolvedValue({ userId: 'u-2', role: 'user' }),
    };
    const gateway = makeGateway(wsAuth);
    const client = makeClient();

    await gateway.handleConnection(client);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.role).toBe('user');
  });

  it('le rôle vient du JWT serveur, pas de client.data pré-existant', async () => {
    const wsAuth = {
      authenticate: jest.fn().mockResolvedValue({ userId: 'u-3', role: 'user' }),
    };
    const gateway = makeGateway(wsAuth);
    // Simule un client qui aurait pré-renseigné role='admin' (impossible en production,
    // car client.data est côté serveur, mais vérifie que handleConnection écrase bien)
    const client = makeClient({ role: 'admin' });

    await gateway.handleConnection(client);

    expect(client.data.role).toBe('user');
  });
});

// ─── Handlers — vérification inline du rôle ──────────────────────────────────

describe('AdminGateway — handlers refusent les non-admins', () => {
  let gateway: AdminGateway;
  let creaturesService: Record<string, jest.Mock>;
  let worldService: Record<string, jest.Mock>;
  let adminService: Record<string, jest.Mock>;

  beforeEach(() => {
    creaturesService = { createAdminSpawn: jest.fn() };
    worldService = { teleportCharacter: jest.fn() };
    adminService = { respawnAll: jest.fn() };

    gateway = new AdminGateway(
      creaturesService as unknown as CreaturesService,
      worldService as unknown as WorldService,
      adminService as unknown as AdminService,
      {} as unknown as ResourcesService,
      {} as unknown as import('../buildings/buildings.service').BuildingsService,
      { authenticate: jest.fn() } as unknown as WsAuthService,
      {} as unknown as import('../economy/economy.service').EconomyService,
      {} as unknown as import('typeorm').DataSource,
      {} as unknown as import('../item-materialization/item-materialization.service').ItemMaterializationService,
      {} as unknown as import('../items/item.service').ItemService,
      {} as unknown as import('../item-transfer/item-transfer.service').ItemTransferService,
    );
    (gateway as any).server = { emit: jest.fn() };
  });

  it('admin:spawn — refuse si role = user', async () => {
    const client = makeClient({ role: 'user' });
    const result = await (gateway as any).onSpawn(client, {
      templateKey: 'turkey',
      worldX: 1024,
      worldY: 1024,
    });
    expect(result.success).toBe(false);
    expect(creaturesService.createAdminSpawn).not.toHaveBeenCalled();
  });

  it('admin:respawn_all — refuse si role absent', async () => {
    const client = makeClient({});
    const result = await (gateway as any).onRespawnAll(client, { templateKey: 'turkey' });
    expect(result.success).toBe(false);
    expect(adminService.respawnAll).not.toHaveBeenCalled();
  });
});

// ─── admin:add_balance ────────────────────────────────────────────────────────

function makeAddBalanceGateway(overrides: {
  character?: any;
  creditResult?: any;
  debitError?: Error | null;
} = {}) {
  const character = overrides.character !== undefined
    ? overrides.character
    : { id: "char-1", name: "Héros" };

  const walletA = { id: "wallet-1", balanceBronze: "5000" };
  const walletB = { id: "wallet-1", balanceBronze: "6000" };

  const adminServiceMock = {
    respawnAll: jest.fn(),
    findCharacterById: character === null
      ? jest.fn().mockResolvedValue(null)
      : jest.fn().mockResolvedValue(character),
  };

  const economyServiceMock = {
    getOrCreateWallet: jest.fn()
      .mockResolvedValueOnce(walletA)
      .mockResolvedValueOnce(walletB),
    credit: overrides.creditResult !== undefined
      ? jest.fn().mockResolvedValue(overrides.creditResult)
      : jest.fn().mockResolvedValue({}),
    debit: overrides.debitError
      ? jest.fn().mockRejectedValue(overrides.debitError)
      : jest.fn().mockResolvedValue({}),
  };

  const gw = new AdminGateway(
    {} as unknown as CreaturesService,
    { getConnectedPlayerByCharacterId: jest.fn().mockReturnValue(null) } as unknown as WorldService,
    adminServiceMock as unknown as AdminService,
    {} as unknown as ResourcesService,
    {} as unknown as import('../buildings/buildings.service').BuildingsService,
    { authenticate: jest.fn() } as unknown as WsAuthService,
    economyServiceMock as unknown as import('../economy/economy.service').EconomyService,
    {} as unknown as import('typeorm').DataSource,
    {} as unknown as import('../item-materialization/item-materialization.service').ItemMaterializationService,
    {} as unknown as import('../items/item.service').ItemService,
    {} as unknown as import('../item-transfer/item-transfer.service').ItemTransferService,
  );
  (gw as any).server = { emit: jest.fn() };

  return { gw, adminServiceMock, economyServiceMock };
}

describe("AdminGateway — admin:add_balance", () => {
  it("refuse si role !== admin", async () => {
    const { gw } = makeAddBalanceGateway();
    const result = await (gw as any).onAddBalance(
      makeClient({ role: "user" }),
      { characterId: "char-1", amountBronze: 100, direction: "credit" },
    );
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/autorisé/i);
  });

  it("refuse si characterId absent", async () => {
    const { gw } = makeAddBalanceGateway();
    const result = await (gw as any).onAddBalance(
      makeClient({ role: "admin" }),
      { amountBronze: 100, direction: "credit" },
    );
    expect(result.success).toBe(false);
  });

  it("refuse si amountBronze <= 0", async () => {
    const { gw } = makeAddBalanceGateway();
    const result = await (gw as any).onAddBalance(
      makeClient({ role: "admin" }),
      { characterId: "char-1", amountBronze: 0, direction: "credit" },
    );
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/positif/i);
  });

  it("refuse si montant > plafond", async () => {
    const { gw } = makeAddBalanceGateway();
    const result = await (gw as any).onAddBalance(
      makeClient({ role: "admin" }),
      { characterId: "char-1", amountBronze: 2_000_000_000, direction: "credit" },
    );
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/élevé/i);
  });

  it("refuse si personnage introuvable", async () => {
    const { gw, economyServiceMock } = makeAddBalanceGateway({ character: null });
    const result = await (gw as any).onAddBalance(
      makeClient({ role: "admin" }),
      { characterId: "char-inexistant", amountBronze: 100, direction: "credit" },
    );
    expect(result.success).toBe(false);
    expect(economyServiceMock.credit).not.toHaveBeenCalled();
  });

  it("crédit : appelle economyService.credit et retourne succès", async () => {
    const { gw, economyServiceMock } = makeAddBalanceGateway();
    const result = await (gw as any).onAddBalance(
      makeClient({ role: "admin", userId: "admin-1" }),
      { characterId: "char-1", amountBronze: 1000, direction: "credit" },
    );
    expect(result.success).toBe(true);
    expect(economyServiceMock.credit).toHaveBeenCalledWith(
      expect.objectContaining({ amountBronze: 1000n }),
    );
  });

  it("débit : appelle economyService.debit et retourne succès", async () => {
    const { gw, economyServiceMock } = makeAddBalanceGateway();
    const result = await (gw as any).onAddBalance(
      makeClient({ role: "admin", userId: "admin-1" }),
      { characterId: "char-1", amountBronze: 500, direction: "debit" },
    );
    expect(result.success).toBe(true);
    expect(economyServiceMock.debit).toHaveBeenCalledWith(
      expect.objectContaining({ amountBronze: 500n }),
    );
  });

  it("débit : retourne échec si solde insuffisant", async () => {
    const { gw } = makeAddBalanceGateway({
      debitError: new Error("Solde insuffisant"),
    });
    const result = await (gw as any).onAddBalance(
      makeClient({ role: "admin", userId: "admin-1" }),
      { characterId: "char-1", amountBronze: 9999, direction: "debit" },
    );
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/insuffisant/i);
  });

  it("gold/silver/bronze convertis en bronze total : 1g 2a 3b = 10203 bronze", async () => {
    const { gw, economyServiceMock } = makeAddBalanceGateway();
    const result = await (gw as any).onAddBalance(
      makeClient({ role: "admin", userId: "admin-1" }),
      { characterId: "char-1", gold: 1, silver: 2, bronze: 3, direction: "credit" },
    );
    expect(result.success).toBe(true);
    expect(economyServiceMock.credit).toHaveBeenCalledWith(
      expect.objectContaining({ amountBronze: 10203n }),
    );
  });

  it("set solde supérieur au solde actuel → crédite le delta", async () => {
    // wallet initial = 5000, target = 8000 → credit 3000
    const { gw, economyServiceMock } = makeAddBalanceGateway();
    const result = await (gw as any).onAddBalance(
      makeClient({ role: "admin", userId: "admin-1" }),
      { characterId: "char-1", amountBronze: 8000, direction: "set" },
    );
    expect(result.success).toBe(true);
    expect(economyServiceMock.credit).toHaveBeenCalledWith(
      expect.objectContaining({ amountBronze: 3000n }),
    );
    expect(economyServiceMock.debit).not.toHaveBeenCalled();
  });

  it("set solde inférieur au solde actuel → débite le delta", async () => {
    // wallet initial = 5000, target = 2000 → debit 3000
    const { gw, economyServiceMock } = makeAddBalanceGateway();
    const result = await (gw as any).onAddBalance(
      makeClient({ role: "admin", userId: "admin-1" }),
      { characterId: "char-1", amountBronze: 2000, direction: "set" },
    );
    expect(result.success).toBe(true);
    expect(economyServiceMock.debit).toHaveBeenCalledWith(
      expect.objectContaining({ amountBronze: 3000n }),
    );
    expect(economyServiceMock.credit).not.toHaveBeenCalled();
  });

  it("set solde égal au solde actuel → aucune mutation", async () => {
    // wallet initial = 5000, target = 5000 → no-op
    const { gw, economyServiceMock } = makeAddBalanceGateway();
    const result = await (gw as any).onAddBalance(
      makeClient({ role: "admin", userId: "admin-1" }),
      { characterId: "char-1", amountBronze: 5000, direction: "set" },
    );
    expect(result.success).toBe(true);
    expect(economyServiceMock.credit).not.toHaveBeenCalled();
    expect(economyServiceMock.debit).not.toHaveBeenCalled();
  });

  it("montants négatifs refusés", async () => {
    const { gw, economyServiceMock } = makeAddBalanceGateway();
    const result = await (gw as any).onAddBalance(
      makeClient({ role: "admin", userId: "admin-1" }),
      { characterId: "char-1", gold: -1, silver: 0, bronze: 0, direction: "credit" },
    );
    expect(result.success).toBe(false);
    expect(economyServiceMock.credit).not.toHaveBeenCalled();
  });

  it("direction set à 0 — solde à zéro → débite tout", async () => {
    // wallet initial = 5000, target = 0 → debit 5000
    const { gw, economyServiceMock } = makeAddBalanceGateway();
    const result = await (gw as any).onAddBalance(
      makeClient({ role: "admin", userId: "admin-1" }),
      { characterId: "char-1", amountBronze: 0, direction: "set" },
    );
    expect(result.success).toBe(true);
    expect(economyServiceMock.debit).toHaveBeenCalledWith(
      expect.objectContaining({ amountBronze: 5000n }),
    );
  });
});

// ─── admin:teleport ───────────────────────────────────────────────────────────

function makeTeleportGateway(opts: {
  adminPlayer?: object | null;
  targetPlayer?: object | null;
  dbChar?: object | null;
  teleportResult?: object | null;
}) {
  const worldService = {
    findPlayerByNameOrId: jest.fn().mockReturnValue(
      opts.adminPlayer !== undefined
        ? opts.adminPlayer
        : { characterId: "admin-char-1", name: "Admin" }
    ),
    getConnectedPlayerByCharacterId: jest.fn().mockReturnValue(
      opts.targetPlayer !== undefined ? opts.targetPlayer : null
    ),
    teleportCharacter: jest.fn().mockResolvedValue(
      opts.teleportResult !== undefined
        ? opts.teleportResult
        : { characterId: "admin-char-1", name: "Admin" }
    ),
  };
  const adminService = {
    findCharacterById: jest.fn().mockResolvedValue(
      opts.dbChar !== undefined ? opts.dbChar : null
    ),
  };
  const gw = new AdminGateway(
    {} as unknown as CreaturesService,
    worldService as unknown as WorldService,
    adminService as unknown as AdminService,
    {} as unknown as ResourcesService,
    {} as unknown as import("../buildings/buildings.service").BuildingsService,
    { authenticate: jest.fn() } as unknown as WsAuthService,
    {} as unknown as import("../economy/economy.service").EconomyService,
    {} as unknown as import("typeorm").DataSource,
    {} as unknown as import("../item-materialization/item-materialization.service").ItemMaterializationService,
    {} as unknown as import("../items/item.service").ItemService,
    {} as unknown as import("../item-transfer/item-transfer.service").ItemTransferService,
  );
  (gw as any).server = { to: jest.fn().mockReturnThis(), emit: jest.fn(), except: jest.fn().mockReturnThis() };
  return { gw, worldService, adminService };
}

const ADMIN_CLIENT = makeClient({ role: "admin" });

describe("admin:teleport — targetCharacterId (TP vers joueur)", () => {
  it("cible connectée — utilise la position live ConnectedPlayer", async () => {
    const { gw, worldService } = makeTeleportGateway({
      targetPlayer: { worldX: 9000, worldY: 8000, mapId: 1 },
    });

    const result = await (gw as any).onTeleport(ADMIN_CLIENT, {
      characterId: "admin-char-1",
      targetCharacterId: "target-char-1",
    });

    expect(worldService.getConnectedPlayerByCharacterId).toHaveBeenCalledWith("target-char-1");
    expect(worldService.teleportCharacter).toHaveBeenCalledWith("admin-char-1", 9000, 8000, expect.anything());
    expect(result.success).toBe(true);
  });

  it("cible hors ligne — fallback DB", async () => {
    const { gw, worldService, adminService } = makeTeleportGateway({
      targetPlayer: null,
      dbChar: { worldX: 3000, worldY: 4000, mapId: 1 },
    });

    const result = await (gw as any).onTeleport(ADMIN_CLIENT, {
      characterId: "admin-char-1",
      targetCharacterId: "target-char-1",
    });

    expect(worldService.getConnectedPlayerByCharacterId).toHaveBeenCalledWith("target-char-1");
    expect(adminService.findCharacterById).toHaveBeenCalledWith("target-char-1");
    expect(worldService.teleportCharacter).toHaveBeenCalledWith("admin-char-1", 3000, 4000, expect.anything());
    expect(result.success).toBe(true);
  });

  it("cible introuvable (ni live ni DB) — retourne erreur", async () => {
    const { gw, worldService } = makeTeleportGateway({
      targetPlayer: null,
      dbChar: null,
    });

    const result = await (gw as any).onTeleport(ADMIN_CLIENT, {
      characterId: "admin-char-1",
      targetCharacterId: "ghost-char",
    });

    expect(worldService.teleportCharacter).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/introuvable/i);
  });

  it("position live prioritaire sur worldX/worldY stale envoyés", async () => {
    const { gw, worldService } = makeTeleportGateway({
      targetPlayer: { worldX: 9999, worldY: 8888, mapId: 1 },
    });

    await (gw as any).onTeleport(ADMIN_CLIENT, {
      characterId: "admin-char-1",
      targetCharacterId: "target-char-1",
      worldX: 1,
      worldY: 1,
    });

    // worldX/worldY stale ignorés — position live utilisée
    expect(worldService.teleportCharacter).toHaveBeenCalledWith("admin-char-1", 9999, 8888, expect.anything());
  });
});

describe("admin:teleport — coordonnées explicites (TP vers point)", () => {
  it("TP vers point — utilise worldX/worldY fournis", async () => {
    const { gw, worldService } = makeTeleportGateway({});

    const result = await (gw as any).onTeleport(ADMIN_CLIENT, {
      characterId: "admin-char-1",
      worldX: 5000,
      worldY: 6000,
    });

    expect(worldService.getConnectedPlayerByCharacterId).not.toHaveBeenCalled();
    expect(worldService.teleportCharacter).toHaveBeenCalledWith("admin-char-1", 5000, 6000, expect.anything());
    expect(result.success).toBe(true);
  });

  it("TP vers point — manque worldX/worldY → erreur", async () => {
    const { gw, worldService } = makeTeleportGateway({});

    const result = await (gw as any).onTeleport(ADMIN_CLIENT, {
      characterId: "admin-char-1",
    });

    expect(worldService.teleportCharacter).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/worldX/i);
  });

  it("refuse si role != admin", async () => {
    const { gw, worldService } = makeTeleportGateway({});
    const userClient = makeClient({ role: "user" });

    const result = await (gw as any).onTeleport(userClient, {
      characterId: "admin-char-1",
      worldX: 0,
      worldY: 0,
    });

    expect(worldService.teleportCharacter).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
});
