import { BadRequestException } from '@nestjs/common';
import { CreatureTemplateOverridesService } from './creature-template-overrides.service';
import { CreatureTemplateDerivedStatOverride } from './entities/creature-template-derived-stat-override.entity';
import { CreatureTemplateDerivedCoefficient } from './entities/creature-template-derived-coefficient.entity';
import { CreatureTemplateScalarOverride } from './entities/creature-template-scalar-override.entity';

/** Repo en mémoire minimal (find/findOne/save/delete/create) sur un tableau. */
function makeRepo<T extends { id?: string }>() {
  const rows: T[] = [];
  let seq = 0;
  const matches = (row: any, where?: any) =>
    !where || Object.entries(where).every(([k, v]) => row[k] === v);
  return {
    rows,
    find: jest.fn(async (opts?: { where?: any }) => rows.filter((r) => matches(r, opts?.where))),
    findOne: jest.fn(async (opts: { where?: any }) => rows.find((r) => matches(r, opts?.where)) ?? null),
    create: jest.fn((v: Partial<T>) => ({ ...v }) as T),
    save: jest.fn(async (v: any) => {
      const arr = Array.isArray(v) ? v : [v];
      for (const item of arr) {
        if (!item.id) item.id = `id-${++seq}`;
        const idx = rows.findIndex((r) => r.id === item.id);
        if (idx >= 0) rows[idx] = item;
        else rows.push(item);
      }
      return v;
    }),
    delete: jest.fn(async (where: any) => {
      for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) rows.splice(i, 1);
      return { affected: 1 };
    }),
  };
}

describe("CreatureTemplateOverridesService", () => {
  let overrideRepo: ReturnType<typeof makeRepo<any>>;
  let coefficientRepo: ReturnType<typeof makeRepo<any>>;
  let scalarRepo: ReturnType<typeof makeRepo<any>>;
  let service: CreatureTemplateOverridesService;

  const derivedStats = {
    getDefinitions: jest.fn().mockResolvedValue([
      { key: "physicalAttack" },
      { key: "defense" },
      { key: "maxHealth" },
      { key: "magicResistanceFire" },
    ]),
  };

  beforeEach(() => {
    overrideRepo = makeRepo();
    coefficientRepo = makeRepo();
    scalarRepo = makeRepo();
    // DataSource.transaction : exécute fn avec un manager délégant aux repos.
    const manager = {
      getRepository: (entity: any) => {
        if (entity === CreatureTemplateDerivedStatOverride) return overrideRepo;
        if (entity === CreatureTemplateDerivedCoefficient) return coefficientRepo;
        if (entity === CreatureTemplateScalarOverride) return scalarRepo;
        throw new Error("unexpected entity");
      },
    };
    const dataSource = { transaction: async (fn: any) => fn(manager) };
    service = new CreatureTemplateOverridesService(
      overrideRepo as any,
      coefficientRepo as any,
      scalarRepo as any,
      derivedStats as any,
      dataSource as any,
    );
  });

  // ── Validation ────────────────────────────────────────────────────────────
  describe("validation", () => {
    it("rejette un derivedStatKey absent du catalogue", async () => {
      await expect(
        service.setDerivedStatOverride(1, "notAStat", [{ primaryStatKey: "strength", coefficient: 1 }]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejette une clé primaire inconnue", async () => {
      await expect(
        service.setDerivedStatOverride(1, "physicalAttack", [{ primaryStatKey: "luck", coefficient: 1 }]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejette un primaire dupliqué", async () => {
      await expect(
        service.setDerivedStatOverride(1, "physicalAttack", [
          { primaryStatKey: "strength", coefficient: 1 },
          { primaryStatKey: "strength", coefficient: 2 },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([NaN, Infinity, -Infinity])("rejette un coefficient non fini (%p)", async (bad) => {
      await expect(
        service.setDerivedStatOverride(1, "physicalAttack", [{ primaryStatKey: "strength", coefficient: bad }]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejette un scalarParamKey inconnu", async () => {
      await expect(service.setScalarOverride(1, "notAParam", 10)).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([NaN, Infinity])("rejette une value scalaire non finie (%p)", async (bad) => {
      await expect(service.setScalarOverride(1, "secondaryChanceCap", bad)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("accepte un coefficient négatif et zéro coefficient (map vide)", async () => {
      await expect(
        service.setDerivedStatOverride(1, "defense", [{ primaryStatKey: "endurance", coefficient: -0.5 }]),
      ).resolves.toBeUndefined();
      await expect(service.setDerivedStatOverride(1, "physicalAttack", [])).resolves.toBeUndefined();
    });
  });

  // ── Persistance + cache ─────────────────────────────────────────────────────
  describe("persistance et cache", () => {
    it("écrit puis relit : getOverrides reflète l'override persisté", async () => {
      await service.setDerivedStatOverride(1, "physicalAttack", [
        { primaryStatKey: "strength", coefficient: 3.5 },
      ]);
      const ov = service.getOverrides(1);
      expect(ov.derivedCoefficients.physicalAttack).toEqual({ strength: 3.5 });
    });

    it("map vide volontaire distinguable d'un cache absent", async () => {
      await service.setDerivedStatOverride(1, "physicalAttack", []); // header, zéro enfant
      const withOverride = service.getOverrides(1);
      expect("physicalAttack" in withOverride.derivedCoefficients).toBe(true);
      expect(withOverride.derivedCoefficients.physicalAttack).toEqual({});
      // Template 2 : aucun override → clé absente (pas une map vide).
      const noOverride = service.getOverrides(2);
      expect("physicalAttack" in noOverride.derivedCoefficients).toBe(false);
    });

    it("rechargement (redémarrage) retrouve les overrides PostgreSQL", async () => {
      await service.setScalarOverride(1, "blockReductionPercent", 60);
      await service.setDerivedStatOverride(1, "maxHealth", [{ primaryStatKey: "vitality", coefficient: 25 }]);
      // Simule un redémarrage : nouveau service sur les MÊMES repos.
      const fresh = new CreatureTemplateOverridesService(
        overrideRepo as any,
        coefficientRepo as any,
        scalarRepo as any,
        derivedStats as any,
        { transaction: async (fn: any) => fn({}) } as any,
      );
      await fresh.reloadAll();
      const ov = fresh.getOverrides(1);
      expect(ov.scalarParams.blockReductionPercent).toBe(60);
      expect(ov.derivedCoefficients.maxHealth).toEqual({ vitality: 25 });
    });

    it("isolation : modifier le template 1 n'affecte pas le template 2", async () => {
      await service.setDerivedStatOverride(1, "physicalAttack", [{ primaryStatKey: "strength", coefficient: 2 }]);
      await service.setDerivedStatOverride(2, "physicalAttack", [{ primaryStatKey: "strength", coefficient: 3.5 }]);
      expect(service.getOverrides(1).derivedCoefficients.physicalAttack).toEqual({ strength: 2 });
      expect(service.getOverrides(2).derivedCoefficients.physicalAttack).toEqual({ strength: 3.5 });
      // Nouvelle écriture sur 1 → 2 inchangé.
      await service.setDerivedStatOverride(1, "physicalAttack", [{ primaryStatKey: "strength", coefficient: 9 }]);
      expect(service.getOverrides(2).derivedCoefficients.physicalAttack).toEqual({ strength: 3.5 });
    });

    it("notifie les abonnés (invalidation) avec le templateId concerné uniquement", async () => {
      const listener = jest.fn();
      service.onChange(listener);
      await service.setScalarOverride(7, "secondaryChanceCap", 75);
      expect(listener).toHaveBeenCalledWith(7);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("remplace intégralement la map d'une dérivée à la ré-écriture", async () => {
      await service.setDerivedStatOverride(1, "physicalAttack", [
        { primaryStatKey: "strength", coefficient: 2 },
        { primaryStatKey: "agility", coefficient: 1 },
      ]);
      await service.setDerivedStatOverride(1, "physicalAttack", [{ primaryStatKey: "dexterity", coefficient: 4 }]);
      expect(service.getOverrides(1).derivedCoefficients.physicalAttack).toEqual({ dexterity: 4 });
    });
  });
});
