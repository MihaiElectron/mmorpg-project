import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminController } from './admin.controller';
import { STANDARD_TARGETS } from '../masteries/mastery-effect-targets.spec';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { ROLES_KEY } from '../common/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

describe('AdminController — movement metrics', () => {
  function makeController() {
    const adminService = {
      getMovementMetrics: jest.fn().mockReturnValue({
        totalMoves: 12,
        suspectTeleports: 1,
        suspectSpeed: 2,
        invalidCoordinates: 3,
        mapMismatch: 4,
      }),
      resetMovementMetrics: jest.fn().mockReturnValue({
        totalMoves: 0,
        suspectTeleports: 0,
        suspectSpeed: 0,
        invalidCoordinates: 0,
        mapMismatch: 0,
      }),
      getCreatureSecondaryCoefficients: jest.fn().mockReturnValue({ attackPowerPerStrength: 2 }),
      updateCreatureSecondaryCoefficients: jest.fn().mockResolvedValue({ attackPowerPerStrength: 4 }),
    };

    return {
      adminService,
      masteriesService: {
        getMasteryEffectTargets: jest.fn().mockResolvedValue(STANDARD_TARGETS),
      },
      controller: new AdminController(
        adminService as any,
        {} as any, // creaturesService
        {} as any, // creatureAbilitiesService (V5-A)
        {} as any, // resourcesService
        {} as any, // buildingsService
        {} as any, // derivedStatsService
        {} as any, // activeSkillsService
        { getMasteryEffectTargets: jest.fn().mockResolvedValue(STANDARD_TARGETS) } as any,
      ),
    };
  }

  it('retourne les métriques movement', () => {
    const { adminService, controller } = makeController();

    const result = controller.getMovementMetrics();

    expect(adminService.getMovementMetrics).toHaveBeenCalled();
    expect(result).toEqual({
      totalMoves: 12,
      suspectTeleports: 1,
      suspectSpeed: 2,
      invalidCoordinates: 3,
      mapMismatch: 4,
    });
  });

  it('reset les métriques movement en mémoire', () => {
    const { adminService, controller } = makeController();

    const result = controller.resetMovementMetrics();

    expect(adminService.resetMovementMetrics).toHaveBeenCalled();
    expect(result).toEqual({
      message: 'Movement metrics reset.',
      metrics: {
        totalMoves: 0,
        suspectTeleports: 0,
        suspectSpeed: 0,
        invalidCoordinates: 0,
        mapMismatch: 0,
      },
    });
  });

  it('GET mastery-effect-targets expose les targets dynamiques (V3-B)', async () => {
    const { controller } = makeController();

    const result = await controller.getMasteryEffectTargets();

    expect(result.targets).toHaveLength(10);
    expect(result.targets.map((t) => t.key)).toContain('physicalAttack');
    expect(result.modes.map((m) => m.key)).toEqual(['percentPerLevel', 'flatPerLevel']);
    expect(result.contextualStats).toEqual(['physicalAttack']);
    const first = result.targets[0];
    expect(first).toMatchObject({
      key: expect.any(String),
      label: expect.any(String),
      category: expect.any(String),
      runtimeStatus: 'implemented',
      description: expect.any(String),
    });
  });

  it('GET creatures/secondary-coefficients délègue à AdminService', () => {
    const { adminService, controller } = makeController();

    const result = controller.getCreatureSecondaryCoefficients();

    expect(adminService.getCreatureSecondaryCoefficients).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ attackPowerPerStrength: 2 });
  });

  it('PATCH creatures/secondary-coefficients délègue le DTO et renvoie la config effective', async () => {
    const { adminService, controller } = makeController();
    const dto = { attackPowerPerStrength: 4 };

    const result = await controller.updateCreatureSecondaryCoefficients(dto as any);

    expect(adminService.updateCreatureSecondaryCoefficients).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ attackPowerPerStrength: 4 });
  });

  it('reste protégé par les guards et le rôle admin', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminController) ?? [];
    const roles = Reflect.getMetadata(ROLES_KEY, AdminController);

    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(RolesGuard);
    expect(roles).toContain(UserRole.ADMIN);
  });
});
