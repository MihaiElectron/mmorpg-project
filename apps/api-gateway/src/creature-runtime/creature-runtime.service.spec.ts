// apps/api-gateway/src/creature-runtime/creature-runtime.service.spec.ts

import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Creature } from '../creatures/entities/creature.entity';
import { CreatureTemplate } from '../creatures/entities/creature-template.entity';
import { CreatureSpawn } from '../creatures/entities/creature-spawn.entity';
import { RuntimeDebugRegistry } from '../player-runtime/debug-modifier.registry';
import { EntityRuntimeService } from '../player-runtime/entity-runtime.types';
import { CreatureRuntimeService } from './creature-runtime.service';
import type { CreatureRuntimeSnapshot } from './creature-runtime.types';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeTemplate(overrides: Partial<CreatureTemplate> = {}): CreatureTemplate {
  return {
    id: 1,
    key: 'turkey',
    name: 'Turkey',
    textureKey: 'turkey',
    baseHealth: 80,
    baseArmor: 5,
    baseAttack: 12,
    patrolRadius: 3000,
    speedMin: 200,
    speedMax: 400,
    pauseMinMs: 500,
    pauseMaxMs: 3000,
    aggroRadius: 2000,
    fleeThresholdPct: 25,
    respawnDelayMs: 20000,
    ...overrides,
  };
}

function makeSpawn(template: CreatureTemplate, overrides: Partial<CreatureSpawn> = {}): CreatureSpawn {
  return {
    id: 'spawn-1',
    key: 'turkey-spawn-1',
    template,
    spawnX: 0,
    spawnY: 0,
    worldX: 1024,
    worldY: 2048,
    mapId: 1,
    respawnDelayMs: 20000,
    ...overrides,
  };
}

function makeCreature(spawn: CreatureSpawn, overrides: Partial<Creature> = {}): Creature {
  return {
    id: 'creature-1',
    spawn,
    x: 100,
    y: 200,
    worldX: 1024,
    worldY: 2048,
    mapId: 1,
    health: 60,
    state: 'alive',
    respawnAt: null,
    respawnDelayMs: null,
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

type MockRepo = {
  findOne: jest.MockedFn<() => Promise<Creature | null>>;
};

function makeRepo(): MockRepo {
  return { findOne: jest.fn() };
}

async function makeService(creature: Creature | null = null): Promise<CreatureRuntimeService> {
  const repo = makeRepo();
  repo.findOne.mockResolvedValue(creature);

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CreatureRuntimeService,
      RuntimeDebugRegistry,
      { provide: getRepositoryToken(Creature), useValue: repo },
    ],
  }).compile();

  return module.get(CreatureRuntimeService);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CreatureRuntimeService', () => {

  // ─── EntityRuntimeService compatibility ─────────────────────────────────────

  describe('EntityRuntimeService compatibility', () => {
    it("implémente EntityRuntimeService<CreatureRuntimeSnapshot>", async () => {
      const service = await makeService();
      // Vérification structurelle — si ce cast compile, le contrat est respecté.
      const _typed: EntityRuntimeService<CreatureRuntimeSnapshot> = service;
      expect(typeof _typed.getRuntimeSnapshot).toBe('function');
    });

    it("retourne null si la créature est introuvable", async () => {
      const service = await makeService(null);
      expect(await service.getRuntimeSnapshot('unknown-id')).toBeNull();
    });

    it("retourne null si le spawn est absent", async () => {
      const template = makeTemplate();
      const creature = makeCreature(null as unknown as CreatureSpawn);
      creature.spawn = null as unknown as CreatureSpawn;
      const service = await makeService(creature);
      expect(await service.getRuntimeSnapshot('creature-1')).toBeNull();
    });
  });

  // ─── CreatureRuntimeSnapshot — identité ───────────────────────────────────

  describe('getRuntimeSnapshot — identité', () => {
    async function getSnap() {
      const template = makeTemplate();
      const spawn = makeSpawn(template);
      const creature = makeCreature(spawn);
      const service = await makeService(creature);
      return service.getRuntimeSnapshot('creature-1');
    }

    it("entityId = creature.id", async () => {
      const snap = await getSnap();
      expect(snap!.entityId).toBe('creature-1');
    });

    it("entityKind = 'creature'", async () => {
      const snap = await getSnap();
      expect(snap!.entityKind).toBe('creature');
    });

    it("name = template.name", async () => {
      const snap = await getSnap();
      expect(snap!.name).toBe('Turkey');
    });

    it("templateKey = template.key", async () => {
      const snap = await getSnap();
      expect(snap!.templateKey).toBe('turkey');
    });

    it("creatureState = creature.state", async () => {
      const snap = await getSnap();
      expect(snap!.creatureState).toBe('alive');
    });

    it("position WU exposée", async () => {
      const snap = await getSnap();
      expect(snap!.worldX).toBe(1024);
      expect(snap!.worldY).toBe(2048);
      expect(snap!.mapId).toBe(1);
    });

    it("mapId / worldX / worldY undefined si creature.mapId null", async () => {
      const template = makeTemplate();
      const spawn = makeSpawn(template);
      const creature = makeCreature(spawn, { worldX: null, worldY: null, mapId: null });
      const service = await makeService(creature);
      const snap = await service.getRuntimeSnapshot('creature-1');
      expect(snap!.worldX).toBeUndefined();
      expect(snap!.worldY).toBeUndefined();
      expect(snap!.mapId).toBeUndefined();
    });
  });

  // ─── CreatureRuntimeSnapshot — baseStats ──────────────────────────────────

  describe('getRuntimeSnapshot — baseStats', () => {
    it("baseHealth = template.baseHealth", async () => {
      const template = makeTemplate({ baseHealth: 100 });
      const snap = await makeService(makeCreature(makeSpawn(template))).then(
        (s) => s.getRuntimeSnapshot('creature-1'),
      );
      expect(snap!.baseStats.baseHealth).toBe(100);
    });

    it("baseArmor = template.baseArmor", async () => {
      const template = makeTemplate({ baseArmor: 15 });
      const snap = await makeService(makeCreature(makeSpawn(template))).then(
        (s) => s.getRuntimeSnapshot('creature-1'),
      );
      expect(snap!.baseStats.baseArmor).toBe(15);
    });

    it("baseAttack = template.baseAttack", async () => {
      const template = makeTemplate({ baseAttack: 20 });
      const snap = await makeService(makeCreature(makeSpawn(template))).then(
        (s) => s.getRuntimeSnapshot('creature-1'),
      );
      expect(snap!.baseStats.baseAttack).toBe(20);
    });

    it("currentHealth = creature.health (pas template.baseHealth)", async () => {
      const template = makeTemplate({ baseHealth: 80 });
      const creature = makeCreature(makeSpawn(template), { health: 30 });
      const service = await makeService(creature);
      const snap = await service.getRuntimeSnapshot('creature-1');
      expect(snap!.baseStats.currentHealth).toBe(30);
    });

    it("speedMin = template.speedMin", async () => {
      const template = makeTemplate({ speedMin: 150 });
      const snap = await makeService(makeCreature(makeSpawn(template))).then(
        (s) => s.getRuntimeSnapshot('creature-1'),
      );
      expect(snap!.baseStats.speedMin).toBe(150);
    });

    it("speedMax = template.speedMax", async () => {
      const template = makeTemplate({ speedMax: 500 });
      const snap = await makeService(makeCreature(makeSpawn(template))).then(
        (s) => s.getRuntimeSnapshot('creature-1'),
      );
      expect(snap!.baseStats.speedMax).toBe(500);
    });
  });

  // ─── CreatureRuntimeSnapshot — derivedStats ───────────────────────────────

  describe('getRuntimeSnapshot — derivedStats (sans modifiers)', () => {
    async function getSnap(templateOverrides: Partial<CreatureTemplate> = {}) {
      const template = makeTemplate(templateOverrides);
      const service = await makeService(makeCreature(makeSpawn(template)));
      return service.getRuntimeSnapshot('creature-1');
    }

    it("maxHp = template.baseHealth sans modifiers", async () => {
      const snap = await getSnap({ baseHealth: 80 });
      expect(snap!.derivedStats.maxHp).toBe(80);
    });

    it("attackPower = template.baseAttack sans modifiers", async () => {
      const snap = await getSnap({ baseAttack: 12 });
      expect(snap!.derivedStats.attackPower).toBe(12);
    });

    it("defenseTotal = template.baseArmor sans modifiers", async () => {
      const snap = await getSnap({ baseArmor: 5 });
      expect(snap!.derivedStats.defenseTotal).toBe(5);
    });

    it("speed = template.speedMax sans modifiers", async () => {
      const snap = await getSnap({ speedMax: 400 });
      expect(snap!.derivedStats.speed).toBe(400);
    });

    it("attackRange = 0 en Phase 1 (pas de champ template)", async () => {
      const snap = await getSnap();
      expect(snap!.derivedStats.attackRange).toBe(0);
    });
  });

  // ─── CreatureRuntimeSnapshot — derivedStats avec debug modifiers ──────────

  describe('getRuntimeSnapshot — derivedStats avec debug modifier', () => {
    it("debug modifier flat sur maxHp est appliqué", async () => {
      const template = makeTemplate({ baseHealth: 80 });
      const creature = makeCreature(makeSpawn(template));

      const module = await Test.createTestingModule({
        providers: [
          CreatureRuntimeService,
          RuntimeDebugRegistry,
          { provide: getRepositoryToken(Creature), useValue: { findOne: jest.fn().mockResolvedValue(creature) } },
        ],
      }).compile();

      const service = module.get(CreatureRuntimeService);
      const registry = module.get(RuntimeDebugRegistry);

      // Injection directe du modifier debug
      registry.addModifier('creature-1', {
        targetStat: 'maxHp',
        operation: 'flat',
        value: 20,
        sourceLabel: 'Debug Test',
      });

      const snap = await service.getRuntimeSnapshot('creature-1');
      expect(snap!.derivedStats.maxHp).toBe(100); // 80 + 20
    });

    it("debug modifier percent_add sur speed est appliqué", async () => {
      const template = makeTemplate({ speedMax: 400 });
      const creature = makeCreature(makeSpawn(template));

      const module = await Test.createTestingModule({
        providers: [
          CreatureRuntimeService,
          RuntimeDebugRegistry,
          { provide: getRepositoryToken(Creature), useValue: { findOne: jest.fn().mockResolvedValue(creature) } },
        ],
      }).compile();

      const service = module.get(CreatureRuntimeService);
      const registry = module.get(RuntimeDebugRegistry);

      registry.addModifier('creature-1', {
        targetStat: 'speed',
        operation: 'percent_add',
        value: 50,
        sourceLabel: 'Zone Speed Boost',
      });

      const snap = await service.getRuntimeSnapshot('creature-1');
      expect(snap!.derivedStats.speed).toBe(600); // 400 × 1.5
    });
  });

  // ─── CreatureRuntimeSnapshot — sources et trace ───────────────────────────

  describe('getRuntimeSnapshot — sources', () => {
    async function getSnap() {
      const template = makeTemplate();
      const service = await makeService(makeCreature(makeSpawn(template)));
      return service.getRuntimeSnapshot('creature-1');
    }

    it("sources contient exactement 1 source (debug)", async () => {
      const snap = await getSnap();
      expect(snap!.sources).toHaveLength(1);
      expect(snap!.sources[0].kind).toBe('debug');
    });

    it("modifiers vide sans debug injectés", async () => {
      const snap = await getSnap();
      expect(snap!.modifiers).toHaveLength(0);
    });

    it("trace a un modifierCount de 0 sans modifiers", async () => {
      const snap = await getSnap();
      expect(snap!.trace.modifierCount).toBe(0);
    });

    it("computedAt est une Date récente", async () => {
      const before = Date.now();
      const snap = await getSnap();
      expect(snap!.computedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it("trace.stats contient les 5 stats créature", async () => {
      const snap = await getSnap();
      const keys = Object.keys(snap!.trace.stats);
      expect(keys).toContain('maxHp');
      expect(keys).toContain('attackPower');
      expect(keys).toContain('defenseTotal');
      expect(keys).toContain('speed');
      expect(keys).toContain('attackRange');
      expect(keys).not.toContain('gatheringRange');
    });
  });

  // ─── EntityRuntimeSnapshot compatibility (type-level) ───────────────────

  describe('CreatureRuntimeSnapshot — compatibilité EntityRuntimeSnapshot', () => {
    it("snap est assignable à EntityRuntimeSnapshot générique", async () => {
      const template = makeTemplate();
      const service = await makeService(makeCreature(makeSpawn(template)));
      const snap = await service.getRuntimeSnapshot('creature-1');

      // Vérification runtime — si le cast compile, la compatibilité est garantie.
      const generic: { entityId: string; entityKind: string } = snap!;
      expect(generic.entityId).toBe('creature-1');
      expect(generic.entityKind).toBe('creature');
    });

    it("snap.sources est un tableau readonly", async () => {
      const template = makeTemplate();
      const service = await makeService(makeCreature(makeSpawn(template)));
      const snap = await service.getRuntimeSnapshot('creature-1');
      expect(Array.isArray(snap!.sources)).toBe(true);
    });
  });

  // ─── creatureState ───────────────────────────────────────────────────────

  describe('creatureState', () => {
    const states: Creature['state'][] = ['alive', 'fighting', 'escaping', 'dead'];

    for (const state of states) {
      it(`reflète state='${state}'`, async () => {
        const template = makeTemplate();
        const creature = makeCreature(makeSpawn(template), { state });
        const service = await makeService(creature);
        const snap = await service.getRuntimeSnapshot('creature-1');
        expect(snap!.creatureState).toBe(state);
      });
    }
  });
});
