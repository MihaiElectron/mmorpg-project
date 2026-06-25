// apps/api-gateway/src/player-runtime/player-runtime.controller.spec.ts

import { NotFoundException } from '@nestjs/common';
import { PlayerRuntimeController } from './player-runtime.controller';
import { PlayerRuntimeService } from './player-runtime.service';
import { CharacterService } from '../characters/character.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const mockCharacter = { id: 'char-1', name: 'Hero' };
const mockReq = { user: { userId: 'user-1' } };

type MockRuntimeService = jest.Mocked<Pick<
  PlayerRuntimeService,
  | 'getPlayerRuntime'
  | 'getRuntimeStats'
  | 'getRuntimeTrace'
  | 'getRuntimeSnapshot'
  | 'recalculateRuntime'
  | 'addDebugModifier'
  | 'clearDebugModifiers'
  | 'listDebugModifiers'
>>;

function makeController(): {
  controller: PlayerRuntimeController;
  characterService: jest.Mocked<Pick<CharacterService, 'findFirstByUser'>>;
  runtimeService: MockRuntimeService;
} {
  const characterService = {
    findFirstByUser: jest.fn().mockResolvedValue(mockCharacter),
  } as any;

  const runtimeService: MockRuntimeService = {
    getPlayerRuntime: jest.fn(),
    getRuntimeStats: jest.fn(),
    getRuntimeTrace: jest.fn(),
    getRuntimeSnapshot: jest.fn(),
    recalculateRuntime: jest.fn(),
    addDebugModifier: jest.fn(),
    clearDebugModifiers: jest.fn(),
    listDebugModifiers: jest.fn(),
  } as any;

  const controller = new PlayerRuntimeController(characterService, runtimeService as any);
  return { controller, characterService, runtimeService };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PlayerRuntimeController', () => {
  describe('getMyRuntime — GET /me', () => {
    it('délègue à playerRuntimeService.getPlayerRuntime avec le characterId', async () => {
      const { controller, runtimeService } = makeController();
      const runtime = { characterId: 'char-1', derivedStats: {} };
      runtimeService.getPlayerRuntime.mockResolvedValue(runtime as any);

      const result = await controller.getMyRuntime(mockReq);

      expect(runtimeService.getPlayerRuntime).toHaveBeenCalledWith('char-1');
      expect(result).toBe(runtime);
    });

    it('lève NotFoundException si runtime null', async () => {
      const { controller, runtimeService } = makeController();
      runtimeService.getPlayerRuntime.mockResolvedValue(null);

      await expect(controller.getMyRuntime(mockReq)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyStats — GET /me/stats', () => {
    it('délègue à getRuntimeStats', async () => {
      const { controller, runtimeService } = makeController();
      const stats = { base: {}, derived: {} };
      runtimeService.getRuntimeStats.mockResolvedValue(stats as any);

      const result = await controller.getMyStats(mockReq);

      expect(runtimeService.getRuntimeStats).toHaveBeenCalledWith('char-1');
      expect(result).toBe(stats);
    });

    it('lève NotFoundException si stats null', async () => {
      const { controller, runtimeService } = makeController();
      runtimeService.getRuntimeStats.mockResolvedValue(null);

      await expect(controller.getMyStats(mockReq)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyTrace — GET /me/trace', () => {
    it('délègue à getRuntimeTrace', async () => {
      const { controller, runtimeService } = makeController();
      const trace = { stats: {}, modifierCount: 0, computedAt: new Date() };
      runtimeService.getRuntimeTrace.mockResolvedValue(trace as any);

      const result = await controller.getMyTrace(mockReq);

      expect(runtimeService.getRuntimeTrace).toHaveBeenCalledWith('char-1');
      expect(result).toBe(trace);
    });

    it('lève NotFoundException si trace null', async () => {
      const { controller, runtimeService } = makeController();
      runtimeService.getRuntimeTrace.mockResolvedValue(null);

      await expect(controller.getMyTrace(mockReq)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMySnapshot — GET /me/snapshot', () => {
    it('délègue à getRuntimeSnapshot avec le characterId', async () => {
      const { controller, runtimeService } = makeController();
      const snapshot = {
        characterId: 'char-1',
        name: 'Hero',
        baseStats: {},
        derivedStats: {},
        sources: [],
        modifiers: [],
        trace: { stats: {}, modifierCount: 0, computedAt: new Date() },
        computedAt: new Date(),
      };
      runtimeService.getRuntimeSnapshot.mockResolvedValue(snapshot as any);

      const result = await controller.getMySnapshot(mockReq);

      expect(runtimeService.getRuntimeSnapshot).toHaveBeenCalledWith('char-1');
      expect(result).toBe(snapshot);
    });

    it('lève NotFoundException si snapshot null', async () => {
      const { controller, runtimeService } = makeController();
      runtimeService.getRuntimeSnapshot.mockResolvedValue(null);

      await expect(controller.getMySnapshot(mockReq)).rejects.toThrow(NotFoundException);
    });

    it('résout le characterId depuis findFirstByUser', async () => {
      const { controller, characterService, runtimeService } = makeController();
      runtimeService.getRuntimeSnapshot.mockResolvedValue({ characterId: 'char-1' } as any);

      await controller.getMySnapshot(mockReq);

      expect(characterService.findFirstByUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('recalculateMyRuntime — POST /me/recalculate', () => {
    it('délègue à recalculateRuntime', async () => {
      const { controller, runtimeService } = makeController();
      const runtime = { characterId: 'char-1' };
      runtimeService.recalculateRuntime.mockResolvedValue(runtime as any);

      const result = await controller.recalculateMyRuntime(mockReq);

      expect(runtimeService.recalculateRuntime).toHaveBeenCalledWith('char-1');
      expect(result).toBe(runtime);
    });

    it('lève NotFoundException si runtime null', async () => {
      const { controller, runtimeService } = makeController();
      runtimeService.recalculateRuntime.mockResolvedValue(null);

      await expect(controller.recalculateMyRuntime(mockReq)).rejects.toThrow(NotFoundException);
    });
  });

  describe('addDebugModifier — POST /debug/modifiers', () => {
    it('délègue à addDebugModifier avec characterId et input séparés', () => {
      const { controller, runtimeService } = makeController();
      const modifier = { id: 'debug:char-1:1', sourceType: 'debug', value: 10 };
      runtimeService.addDebugModifier.mockReturnValue(modifier as any);

      const body = { characterId: 'char-1', targetStat: 'attackPower', operation: 'flat', value: 10 };
      const result = controller.addDebugModifier(body as any);

      expect(runtimeService.addDebugModifier).toHaveBeenCalledWith('char-1', {
        targetStat: 'attackPower',
        operation: 'flat',
        value: 10,
      });
      expect(result).toEqual({ added: modifier });
    });

    it('transmet sourceLabel et reason optionnels', () => {
      const { controller, runtimeService } = makeController();
      runtimeService.addDebugModifier.mockReturnValue({ id: 'debug:char-1:2' } as any);

      controller.addDebugModifier({
        characterId: 'char-1',
        targetStat: 'maxHp',
        operation: 'flat',
        value: 50,
        sourceLabel: 'Test',
        reason: 'CI test',
      } as any);

      expect(runtimeService.addDebugModifier).toHaveBeenCalledWith('char-1', {
        targetStat: 'maxHp',
        operation: 'flat',
        value: 50,
        sourceLabel: 'Test',
        reason: 'CI test',
      });
    });
  });

  describe('clearDebugModifiers — DELETE /debug/modifiers/:characterId', () => {
    it('délègue à clearDebugModifiers et retourne { cleared: true, characterId }', () => {
      const { controller, runtimeService } = makeController();
      runtimeService.clearDebugModifiers.mockReturnValue(undefined);

      const result = controller.clearDebugModifiers('char-1');

      expect(runtimeService.clearDebugModifiers).toHaveBeenCalledWith('char-1');
      expect(result).toEqual({ cleared: true, characterId: 'char-1' });
    });
  });

  describe('listDebugModifiers — GET /debug/modifiers/:characterId', () => {
    it('délègue à listDebugModifiers et retourne { characterId, modifiers }', () => {
      const { controller, runtimeService } = makeController();
      const mods = [{ id: 'debug:char-1:1', value: 5 }];
      runtimeService.listDebugModifiers.mockReturnValue(mods as any);

      const result = controller.listDebugModifiers('char-1');

      expect(runtimeService.listDebugModifiers).toHaveBeenCalledWith('char-1');
      expect(result).toEqual({ characterId: 'char-1', modifiers: mods });
    });

    it('retourne { modifiers: [] } si aucun modifier', () => {
      const { controller, runtimeService } = makeController();
      runtimeService.listDebugModifiers.mockReturnValue([]);

      const result = controller.listDebugModifiers('char-99');
      expect(result).toEqual({ characterId: 'char-99', modifiers: [] });
    });
  });
});
