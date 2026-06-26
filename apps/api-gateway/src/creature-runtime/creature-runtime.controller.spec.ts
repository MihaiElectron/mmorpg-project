// apps/api-gateway/src/creature-runtime/creature-runtime.controller.spec.ts

import { NotFoundException } from '@nestjs/common';
import { CreatureRuntimeController } from './creature-runtime.controller';
import { CreatureRuntimeService } from './creature-runtime.service';
import { CreatureRuntimeSnapshot } from './creature-runtime.types';
import { RuntimeModifier } from '../player-runtime/player-runtime.types';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<CreatureRuntimeSnapshot> = {}): CreatureRuntimeSnapshot {
  return {
    entityId: 'creature-1',
    entityKind: 'creature',
    name: 'Turkey',
    templateKey: 'turkey',
    creatureState: 'alive',
    baseStats: {
      baseHealth: 30, baseArmor: 2, baseAttack: 5,
      currentHealth: 30, speedMin: 25, speedMax: 60,
    },
    derivedStats: {
      maxHp: 30, attackPower: 5, defenseTotal: 2, speed: 60, attackRange: 0,
    },
    sources: [{ kind: 'debug', modifiers: [] }],
    modifiers: [],
    trace: { stats: {}, modifierCount: 0, computedAt: new Date() },
    computedAt: new Date(),
    ...overrides,
  };
}

function makeModifier(overrides: Partial<RuntimeModifier> = {}): RuntimeModifier {
  return {
    id: 'debug:creature-1:1',
    sourceType: 'debug',
    sourceId: 'debug-registry',
    sourceLabel: 'Debug',
    targetStat: 'maxHp',
    operation: 'flat',
    value: 10,
    priority: 99,
    enabled: true,
    ...overrides,
  };
}

type MockService = jest.Mocked<Pick<
  CreatureRuntimeService,
  'getRuntimeSnapshot' | 'addDebugModifier' | 'clearDebugModifiers' | 'listDebugModifiers'
>>;

function makeController(): { controller: CreatureRuntimeController; service: MockService } {
  const service: MockService = {
    getRuntimeSnapshot: jest.fn(),
    addDebugModifier: jest.fn(),
    clearDebugModifiers: jest.fn(),
    listDebugModifiers: jest.fn(),
  };
  const controller = new CreatureRuntimeController(service as any);
  return { controller, service };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CreatureRuntimeController', () => {
  describe('getSnapshot — GET /:id/snapshot', () => {
    it('délègue à getRuntimeSnapshot avec le creatureId', async () => {
      const { controller, service } = makeController();
      const snap = makeSnapshot();
      service.getRuntimeSnapshot.mockResolvedValue(snap);

      const result = await controller.getSnapshot('creature-1');

      expect(service.getRuntimeSnapshot).toHaveBeenCalledWith('creature-1');
      expect(result).toBe(snap);
    });

    it('lève NotFoundException si snapshot null', async () => {
      const { controller, service } = makeController();
      service.getRuntimeSnapshot.mockResolvedValue(null);

      await expect(controller.getSnapshot('unknown')).rejects.toThrow(NotFoundException);
    });

    it('retourne un snapshot avec entityKind creature', async () => {
      const { controller, service } = makeController();
      const snap = makeSnapshot({ entityKind: 'creature', name: 'Goblin' });
      service.getRuntimeSnapshot.mockResolvedValue(snap);

      const result = await controller.getSnapshot('creature-1');

      expect((result as CreatureRuntimeSnapshot).entityKind).toBe('creature');
      expect((result as CreatureRuntimeSnapshot).name).toBe('Goblin');
    });
  });

  describe('addDebugModifier — POST /debug/modifiers', () => {
    it('délègue à addDebugModifier avec creatureId et input séparés', () => {
      const { controller, service } = makeController();
      const modifier = makeModifier();
      service.addDebugModifier.mockReturnValue(modifier);

      const body = { creatureId: 'creature-1', targetStat: 'maxHp' as const, operation: 'flat' as const, value: 10 };
      const result = controller.addDebugModifier(body);

      expect(service.addDebugModifier).toHaveBeenCalledWith('creature-1', {
        targetStat: 'maxHp',
        operation: 'flat',
        value: 10,
      });
      expect(result).toEqual({ added: modifier });
    });

    it('transmet sourceLabel et reason optionnels', () => {
      const { controller, service } = makeController();
      service.addDebugModifier.mockReturnValue(makeModifier());

      controller.addDebugModifier({
        creatureId: 'creature-1',
        targetStat: 'attackPower',
        operation: 'percent_add',
        value: 20,
        sourceLabel: 'Boss Buff',
        reason: 'test',
      } as any);

      expect(service.addDebugModifier).toHaveBeenCalledWith('creature-1', {
        targetStat: 'attackPower',
        operation: 'percent_add',
        value: 20,
        sourceLabel: 'Boss Buff',
        reason: 'test',
      });
    });
  });

  describe('clearDebugModifiers — DELETE /debug/modifiers/:creatureId', () => {
    it('délègue à clearDebugModifiers et retourne { cleared: true, creatureId }', () => {
      const { controller, service } = makeController();
      service.clearDebugModifiers.mockReturnValue(undefined);

      const result = controller.clearDebugModifiers('creature-1');

      expect(service.clearDebugModifiers).toHaveBeenCalledWith('creature-1');
      expect(result).toEqual({ cleared: true, creatureId: 'creature-1' });
    });
  });

  describe('listDebugModifiers — GET /debug/modifiers/:creatureId', () => {
    it('délègue à listDebugModifiers et retourne { creatureId, modifiers }', () => {
      const { controller, service } = makeController();
      const mods = [makeModifier({ id: 'debug:creature-1:1', value: 5 })];
      service.listDebugModifiers.mockReturnValue(mods);

      const result = controller.listDebugModifiers('creature-1');

      expect(service.listDebugModifiers).toHaveBeenCalledWith('creature-1');
      expect(result).toEqual({ creatureId: 'creature-1', modifiers: mods });
    });

    it('retourne { modifiers: [] } si aucun modifier', () => {
      const { controller, service } = makeController();
      service.listDebugModifiers.mockReturnValue([]);

      const result = controller.listDebugModifiers('creature-99');

      expect(result).toEqual({ creatureId: 'creature-99', modifiers: [] });
    });
  });
});
