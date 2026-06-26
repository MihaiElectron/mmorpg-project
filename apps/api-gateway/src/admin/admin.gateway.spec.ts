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
    wsAuth as WsAuthService,
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
      { authenticate: jest.fn() } as unknown as WsAuthService,
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
