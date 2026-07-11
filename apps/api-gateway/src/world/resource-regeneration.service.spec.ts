import {
  ResourceRegenerationService,
  computeResourceRegenStep,
  RESOURCE_REGEN_TICK_MS,
} from "./resource-regeneration.service";

// Définitions dérivées à valeurs CONSTANTES (baseValue seul, aucun coefficient)
// pour rendre le tick déterministe indépendamment des stats du personnage.
const DEFS = [
  { key: "maxHealth", enabled: true, rawStatSource: null, baseValue: 100, minValue: null, maxValue: null, primaryCoefficients: {} },
  { key: "maxMana", enabled: true, rawStatSource: null, baseValue: 50, minValue: null, maxValue: null, primaryCoefficients: {} },
  { key: "maxEnergy", enabled: true, rawStatSource: null, baseValue: 40, minValue: null, maxValue: null, primaryCoefficients: {} },
  { key: "manaRegen", enabled: true, rawStatSource: null, baseValue: 2, minValue: null, maxValue: null, primaryCoefficients: {} },
  { key: "energyRegen", enabled: true, rawStatSource: null, baseValue: 1, minValue: null, maxValue: null, primaryCoefficients: {} },
] as any;

function makeChar(overrides: Record<string, unknown> = {}) {
  return { id: "c1", health: 100, mana: 10, energy: 5, ...overrides };
}

function makeService(opts: {
  players?: { characterId: string; socketId: string }[];
  characters?: Record<string, unknown>[];
  defs?: unknown;
}) {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  const server = { to } as any;

  const charRepo = {
    find: jest.fn().mockResolvedValue(opts.characters ?? []),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const derivedStats = { getDefinitions: jest.fn().mockResolvedValue(opts.defs ?? DEFS) };
  const worldService = {
    getAllConnectedPlayers: jest.fn().mockReturnValue(opts.players ?? []),
  };

  const masteryEffects = { getPermanentStatModifiers: jest.fn().mockResolvedValue({ percent: {}, flat: {} }) };
  const service = new ResourceRegenerationService(
    charRepo as any,
    derivedStats as any,
    masteryEffects as any,
    worldService as any,
  );
  // Injecte le server SANS démarrer d'interval réel (tests appellent tick()).
  (service as any).server = server;
  return { service, charRepo, derivedStats, worldService, server, to, emit };
}

// ─── Fonction pure ────────────────────────────────────────────────────────────

describe("computeResourceRegenStep", () => {
  it("régénère la partie entière et reporte la fraction", () => {
    const r = computeResourceRegenStep({ current: 10, max: 50, regenPerSecond: 2, elapsedSeconds: 1, accumulator: 0 });
    expect(r).toEqual({ next: 12, accumulator: 0, changed: true });
  });

  it("regen fractionnaire 0.4/s : pas de gain avant accumulation suffisante", () => {
    // t1: 0.4 → 0 gain ; t2: 0.8 → 0 ; t3: 1.2 → +1, reste 0.2
    let acc = 0;
    let cur = 10;
    const s1 = computeResourceRegenStep({ current: cur, max: 50, regenPerSecond: 0.4, elapsedSeconds: 1, accumulator: acc });
    expect(s1.changed).toBe(false);
    expect(s1.next).toBe(10);
    acc = s1.accumulator;
    const s2 = computeResourceRegenStep({ current: cur, max: 50, regenPerSecond: 0.4, elapsedSeconds: 1, accumulator: acc });
    expect(s2.changed).toBe(false);
    acc = s2.accumulator;
    const s3 = computeResourceRegenStep({ current: cur, max: 50, regenPerSecond: 0.4, elapsedSeconds: 1, accumulator: acc });
    expect(s3.changed).toBe(true);
    expect(s3.next).toBe(11);
    expect(s3.accumulator).toBeCloseTo(0.2, 5);
  });

  it("régénère jusqu'au max sans jamais le dépasser", () => {
    const r = computeResourceRegenStep({ current: 49, max: 50, regenPerSecond: 10, elapsedSeconds: 1, accumulator: 0 });
    expect(r.next).toBe(50);
    expect(r.changed).toBe(true);
  });

  it("ne régénère pas si déjà plein (accumulateur remis à 0)", () => {
    const r = computeResourceRegenStep({ current: 50, max: 50, regenPerSecond: 5, elapsedSeconds: 1, accumulator: 0.7 });
    expect(r).toEqual({ next: 50, accumulator: 0, changed: false });
  });

  it("ne régénère pas si max <= 0", () => {
    const r = computeResourceRegenStep({ current: 0, max: 0, regenPerSecond: 5, elapsedSeconds: 1, accumulator: 0 });
    expect(r.changed).toBe(false);
    expect(r.next).toBe(0);
  });

  it("ne régénère pas si regenPerSecond <= 0", () => {
    const r = computeResourceRegenStep({ current: 10, max: 50, regenPerSecond: 0, elapsedSeconds: 5, accumulator: 0 });
    expect(r.changed).toBe(false);
    expect(r.next).toBe(10);
  });
});

// ─── Tick global ──────────────────────────────────────────────────────────────

describe("ResourceRegenerationService.tick", () => {
  afterEach(() => jest.restoreAllMocks());

  it("utilise les max dérivés AVEC équipement (Équipement V1) et n'écrase pas l'UI", async () => {
    // maxMana = intelligence × 10. Perso base int 0 mais item équipé +5 int.
    const defsEquip = [
      { key: "maxMana", enabled: true, rawStatSource: null, baseValue: 0, minValue: null, maxValue: null, primaryCoefficients: { intelligence: 10 } },
      { key: "maxEnergy", enabled: true, rawStatSource: null, baseValue: 40, minValue: null, maxValue: null, primaryCoefficients: {} },
      { key: "manaRegen", enabled: true, rawStatSource: null, baseValue: 100, minValue: null, maxValue: null, primaryCoefficients: {} },
      { key: "energyRegen", enabled: true, rawStatSource: null, baseValue: 0, minValue: null, maxValue: null, primaryCoefficients: {} },
      { key: "maxHealth", enabled: true, rawStatSource: null, baseValue: 100, minValue: null, maxValue: null, primaryCoefficients: {} },
    ] as any;
    const equippedChar = makeChar({
      mana: 0, energy: 40, baseIntelligence: 0,
      equipment: [{ item: { statBonuses: { intelligence: 5 } } }],
    });
    const { service, charRepo, emit } = makeService({
      players: [{ characterId: "c1", socketId: "sock-1" }],
      characters: [equippedChar],
      defs: defsEquip,
    });
    await service.tick();
    // Sans équipement maxMana serait 0 → aucune regen. Avec équipement = 50.
    expect(charRepo.update).toHaveBeenCalledWith("c1", { mana: 50 });
    expect(emit).toHaveBeenCalledWith(
      "character_resource_update",
      expect.objectContaining({ mana: 50, maxMana: 50 }),
    );
    service.stop();
  });

  it("régénère les PV (healthRegen) plafonnés à maxHealth, gère les fractions", async () => {
    const defsHp = [
      { key: "maxHealth", enabled: true, rawStatSource: null, baseValue: 100, minValue: null, maxValue: null, primaryCoefficients: {} },
      { key: "healthRegen", enabled: true, rawStatSource: null, baseValue: 2.2, minValue: null, maxValue: null, primaryCoefficients: {} },
      { key: "maxMana", enabled: true, rawStatSource: null, baseValue: 0, minValue: null, maxValue: null, primaryCoefficients: {} },
      { key: "maxEnergy", enabled: true, rawStatSource: null, baseValue: 0, minValue: null, maxValue: null, primaryCoefficients: {} },
    ] as any;
    // healthRegen 2.2/s, dt 1s → +2 (0.2 reporté). health 50 → 52.
    const { service, charRepo, emit } = makeService({
      players: [{ characterId: "c1", socketId: "sock-1" }],
      characters: [makeChar({ health: 50, mana: 0, energy: 0 })],
      defs: defsHp,
    });
    await service.tick();
    expect(charRepo.update).toHaveBeenCalledWith("c1", { health: 52 });
    expect(emit).toHaveBeenCalledWith(
      "character_resource_update",
      expect.objectContaining({ health: 52, maxHealth: 100 }),
    );
    service.stop();
  });

  it("ne régénère jamais les PV au-dessus de maxHealth", async () => {
    const defsHp = [
      { key: "maxHealth", enabled: true, rawStatSource: null, baseValue: 100, minValue: null, maxValue: null, primaryCoefficients: {} },
      { key: "healthRegen", enabled: true, rawStatSource: null, baseValue: 50, minValue: null, maxValue: null, primaryCoefficients: {} },
      { key: "maxMana", enabled: true, rawStatSource: null, baseValue: 0, minValue: null, maxValue: null, primaryCoefficients: {} },
      { key: "maxEnergy", enabled: true, rawStatSource: null, baseValue: 0, minValue: null, maxValue: null, primaryCoefficients: {} },
    ] as any;
    const { service, charRepo } = makeService({
      players: [{ characterId: "c1", socketId: "sock-1" }],
      characters: [makeChar({ health: 90, mana: 0, energy: 0 })],
      defs: defsHp,
    });
    await service.tick();
    expect(charRepo.update).toHaveBeenCalledWith("c1", { health: 100 });
    service.stop();
  });

  it("régénère mana et énergie et persiste + émet au seul socket concerné", async () => {
    const { service, charRepo, emit, to } = makeService({
      players: [{ characterId: "c1", socketId: "sock-1" }],
      characters: [makeChar({ mana: 10, energy: 5 })],
    });
    await service.tick();
    // manaRegen 2/s, energyRegen 1/s, dt 1s → mana 12, energy 6.
    expect(charRepo.update).toHaveBeenCalledWith("c1", { mana: 12, energy: 6 });
    expect(to).toHaveBeenCalledWith("sock-1");
    expect(emit).toHaveBeenCalledWith(
      "character_resource_update",
      expect.objectContaining({ characterId: "c1", mana: 12, energy: 6, maxMana: 50, maxEnergy: 40 }),
    );
    service.stop();
  });

  it("n'update pas la DB ni n'émet si aucune ressource ne change (déjà full)", async () => {
    const { service, charRepo, emit } = makeService({
      players: [{ characterId: "c1", socketId: "sock-1" }],
      characters: [makeChar({ mana: 50, energy: 40 })],
    });
    await service.tick();
    expect(charRepo.update).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    service.stop();
  });

  it("ignore un personnage mort (health <= 0)", async () => {
    const { service, charRepo, emit } = makeService({
      players: [{ characterId: "c1", socketId: "sock-1" }],
      characters: [makeChar({ health: 0, mana: 10, energy: 5 })],
    });
    await service.tick();
    expect(charRepo.update).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    service.stop();
  });

  it("ne charge rien et n'émet pas si aucun joueur connecté", async () => {
    const { service, charRepo, emit, worldService } = makeService({ players: [] });
    await service.tick();
    expect(worldService.getAllConnectedPlayers).toHaveBeenCalled();
    expect(charRepo.find).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    service.stop();
  });

  it("n'émet qu'au socket du joueur concerné, jamais en broadcast global", async () => {
    const { service, server, to } = makeService({
      players: [{ characterId: "c1", socketId: "sock-1" }],
      characters: [makeChar({ mana: 0, energy: 0 })],
    });
    await service.tick();
    // Émission ciblée via server.to(socketId) ; aucun emit direct sur le server.
    expect(to).toHaveBeenCalledWith("sock-1");
    expect((server as any).emit).toBeUndefined();
    service.stop();
  });
});

// ─── start / stop ─────────────────────────────────────────────────────────────

describe("ResourceRegenerationService start/stop", () => {
  it("start() n'installe jamais un second interval (idempotent)", () => {
    const spy = jest.spyOn(global, "setInterval");
    const before = spy.mock.calls.length;
    const worldService = { getAllConnectedPlayers: jest.fn().mockReturnValue([]) };
    const service = new ResourceRegenerationService(
      { find: jest.fn(), update: jest.fn() } as any,
      { getDefinitions: jest.fn() } as any,
      { getPermanentStatModifiers: jest.fn().mockResolvedValue({ percent: {}, flat: {} }) } as any,
      worldService as any,
    );
    const server = { to: jest.fn() } as any;
    service.start(server);
    service.start(server);
    service.start(server);
    expect(spy.mock.calls.length - before).toBe(1);
    service.stop();
    spy.mockRestore();
  });

  it("stop() nettoie l'interval", () => {
    const clearSpy = jest.spyOn(global, "clearInterval");
    const service = new ResourceRegenerationService(
      { find: jest.fn(), update: jest.fn() } as any,
      { getDefinitions: jest.fn() } as any,
      { getPermanentStatModifiers: jest.fn().mockResolvedValue({ percent: {}, flat: {} }) } as any,
      { getAllConnectedPlayers: jest.fn().mockReturnValue([]) } as any,
    );
    service.start({ to: jest.fn() } as any);
    service.stop();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("la cadence par défaut est 1000 ms (points/seconde)", () => {
    expect(RESOURCE_REGEN_TICK_MS).toBe(1000);
  });
});
