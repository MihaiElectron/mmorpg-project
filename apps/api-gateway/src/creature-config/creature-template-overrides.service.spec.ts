import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreatureTemplateOverridesService } from './creature-template-overrides.service';
import { CreatureTemplateDerivedStatOverride } from './entities/creature-template-derived-stat-override.entity';
import { CreatureTemplateDerivedCoefficient } from './entities/creature-template-derived-coefficient.entity';
import { CreatureTemplateScalarOverride } from './entities/creature-template-scalar-override.entity';
import { CreatureTemplate } from '../creatures/entities/creature-template.entity';

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

  // ── Instrumentation du verrou / de la transaction ─────────────────────────
  /** Ordre des opérations transactionnelles (verrou, deletes, saves). */
  let callOrder: string[];
  /** Vrai pendant l'exécution du callback de transaction. */
  let insideTransaction: boolean;
  /** Contexte transactionnel capturé à CHAQUE écriture (delete/save). */
  let writeContexts: boolean[];
  /** Résultat du SELECT … FOR UPDATE sur le template (présent par défaut). */
  let lockGetOne: jest.Mock;
  /** Injecté dans un delete pour simuler une erreur APRÈS le verrou. */
  let failNextHeaderDelete: boolean;

  const derivedStats = {
    getDefinitions: jest.fn().mockResolvedValue([
      { key: "physicalAttack" },
      { key: "defense" },
      { key: "maxHealth" },
      { key: "magicResistanceFire" },
    ]),
  };

  /** Enrobe delete/save d'un repo pour tracer l'ordre et exiger le contexte transactionnel. */
  function instrument(repo: ReturnType<typeof makeRepo<any>>, label: string) {
    const origDelete = repo.delete;
    const origSave = repo.save;
    repo.delete = jest.fn(async (w: any) => {
      callOrder.push(`${label}.delete`);
      writeContexts.push(insideTransaction);
      if (label === "override" && failNextHeaderDelete) {
        throw new Error("boom (erreur après le verrou)");
      }
      return origDelete(w);
    }) as any;
    repo.save = jest.fn(async (v: any) => {
      callOrder.push(`${label}.save`);
      writeContexts.push(insideTransaction);
      return origSave(v);
    }) as any;
  }

  beforeEach(() => {
    callOrder = [];
    writeContexts = [];
    insideTransaction = false;
    failNextHeaderDelete = false;
    overrideRepo = makeRepo();
    coefficientRepo = makeRepo();
    scalarRepo = makeRepo();
    instrument(overrideRepo, "override");
    instrument(coefficientRepo, "coef");
    instrument(scalarRepo, "scalar");

    // Repo `creature_template` : verrou pessimiste (SELECT … FOR UPDATE) via QB.
    lockGetOne = jest.fn().mockResolvedValue({ id: 1, key: "turkey" });
    const templateRepo = {
      createQueryBuilder: jest.fn(() => {
        const qb: any = {
          setLock: jest.fn(() => qb),
          where: jest.fn(() => qb),
          getOne: jest.fn(async () => {
            callOrder.push("lock");
            expect(insideTransaction).toBe(true);
            return lockGetOne();
          }),
        };
        return qb;
      }),
    };

    const manager = {
      getRepository: (entity: any) => {
        if (entity === CreatureTemplate) return templateRepo;
        if (entity === CreatureTemplateDerivedStatOverride) return overrideRepo;
        if (entity === CreatureTemplateDerivedCoefficient) return coefficientRepo;
        if (entity === CreatureTemplateScalarOverride) return scalarRepo;
        throw new Error("unexpected entity");
      },
    };
    const dataSource = {
      transaction: async (fn: any) => {
        insideTransaction = true;
        try {
          return await fn(manager);
        } finally {
          insideTransaction = false;
        }
      },
    };
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

  // ── replaceTemplateConfiguration (PUT atomique) ─────────────────────────────
  describe("replaceTemplateConfiguration", () => {
    it("crée des overrides (dérivés + scalaires)", async () => {
      await service.replaceTemplateConfiguration(1, {
        derivedOverrides: [{ derivedStatKey: "physicalAttack", coefficients: [{ primaryStatKey: "strength", coefficient: 3.5 }] }],
        scalarOverrides: [{ scalarParamKey: "secondaryChanceCap", value: 45 }],
      });
      const ov = service.getOverrides(1);
      expect(ov.derivedCoefficients.physicalAttack).toEqual({ strength: 3.5 });
      expect(ov.scalarParams.secondaryChanceCap).toBe(45);
    });

    it("remplacement complet : dérivée OMISE → supprimée (fallback)", async () => {
      await service.setDerivedStatOverride(1, "physicalAttack", [{ primaryStatKey: "strength", coefficient: 2 }]);
      await service.setDerivedStatOverride(1, "defense", [{ primaryStatKey: "endurance", coefficient: 1 }]);
      // Sauvegarde ne contenant QUE defense → physicalAttack supprimé.
      await service.replaceTemplateConfiguration(1, {
        derivedOverrides: [{ derivedStatKey: "defense", coefficients: [{ primaryStatKey: "endurance", coefficient: 5 }] }],
        scalarOverrides: [],
      });
      const ov = service.getOverrides(1);
      expect("physicalAttack" in ov.derivedCoefficients).toBe(false);
      expect(ov.derivedCoefficients.defense).toEqual({ endurance: 5 });
    });

    it("map vide volontaire conservée dans un remplacement complet", async () => {
      await service.replaceTemplateConfiguration(1, {
        derivedOverrides: [{ derivedStatKey: "physicalAttack", coefficients: [] }],
        scalarOverrides: [],
      });
      const ov = service.getOverrides(1);
      expect("physicalAttack" in ov.derivedCoefficients).toBe(true);
      expect(ov.derivedCoefficients.physicalAttack).toEqual({});
    });

    it("suppression de TOUS les overrides (listes vides)", async () => {
      await service.setDerivedStatOverride(1, "physicalAttack", [{ primaryStatKey: "strength", coefficient: 2 }]);
      await service.setScalarOverride(1, "secondaryChanceCap", 75);
      await service.replaceTemplateConfiguration(1, { derivedOverrides: [], scalarOverrides: [] });
      const ov = service.getOverrides(1);
      expect(Object.keys(ov.derivedCoefficients)).toHaveLength(0);
      expect(Object.keys(ov.scalarParams)).toHaveLength(0);
    });

    it("scalaire omis → supprimé, présent → remplacé", async () => {
      await service.setScalarOverride(1, "blockReductionPercent", 30);
      await service.setScalarOverride(1, "secondaryChanceCap", 50);
      await service.replaceTemplateConfiguration(1, {
        derivedOverrides: [],
        scalarOverrides: [{ scalarParamKey: "secondaryChanceCap", value: 90 }],
      });
      const ov = service.getOverrides(1);
      expect("blockReductionPercent" in ov.scalarParams).toBe(false);
      expect(ov.scalarParams.secondaryChanceCap).toBe(90);
    });

    it("une seule notification par sauvegarde complète", async () => {
      const listener = jest.fn();
      service.onChange(listener);
      await service.replaceTemplateConfiguration(1, {
        derivedOverrides: [
          { derivedStatKey: "physicalAttack", coefficients: [{ primaryStatKey: "strength", coefficient: 2 }] },
          { derivedStatKey: "defense", coefficients: [{ primaryStatKey: "endurance", coefficient: 1 }] },
        ],
        scalarOverrides: [{ scalarParamKey: "secondaryChanceCap", value: 45 }],
      });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(1);
    });

    it("isolation : sauvegarde du template 1 n'affecte pas le template 2", async () => {
      await service.setDerivedStatOverride(2, "physicalAttack", [{ primaryStatKey: "strength", coefficient: 9 }]);
      await service.replaceTemplateConfiguration(1, {
        derivedOverrides: [{ derivedStatKey: "physicalAttack", coefficients: [{ primaryStatKey: "strength", coefficient: 2 }] }],
        scalarOverrides: [],
      });
      expect(service.getOverrides(2).derivedCoefficients.physicalAttack).toEqual({ strength: 9 });
    });

    describe("validation AVANT écriture (rollback / aucune écriture partielle)", () => {
      it("clé dérivée inconnue → rejet, repos et cache intacts, aucune notification", async () => {
        const listener = jest.fn();
        service.onChange(listener);
        await service.setDerivedStatOverride(1, "physicalAttack", [{ primaryStatKey: "strength", coefficient: 2 }]);
        listener.mockClear();
        await expect(
          service.replaceTemplateConfiguration(1, {
            derivedOverrides: [{ derivedStatKey: "notAStat", coefficients: [] }],
            scalarOverrides: [],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        // Aucune écriture partielle : l'override initial reste, pas de notification.
        expect(service.getOverrides(1).derivedCoefficients.physicalAttack).toEqual({ strength: 2 });
        expect(listener).not.toHaveBeenCalled();
      });

      it("doublon de derivedStatKey dans le DTO → rejet", async () => {
        await expect(
          service.replaceTemplateConfiguration(1, {
            derivedOverrides: [
              { derivedStatKey: "physicalAttack", coefficients: [] },
              { derivedStatKey: "physicalAttack", coefficients: [] },
            ],
            scalarOverrides: [],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it("doublon de scalarParamKey → rejet", async () => {
        await expect(
          service.replaceTemplateConfiguration(1, {
            derivedOverrides: [],
            scalarOverrides: [
              { scalarParamKey: "secondaryChanceCap", value: 1 },
              { scalarParamKey: "secondaryChanceCap", value: 2 },
            ],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it.each([NaN, Infinity])("coefficient non fini (%p) → rejet", async (bad) => {
        await expect(
          service.replaceTemplateConfiguration(1, {
            derivedOverrides: [{ derivedStatKey: "physicalAttack", coefficients: [{ primaryStatKey: "strength", coefficient: bad }] }],
            scalarOverrides: [],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    // ── Verrou pessimiste du template (sérialisation des PUT concurrents) ──────
    describe("verrouillage pessimiste", () => {
      it("verrouille le template AVANT toute mutation ; écritures dans la transaction", async () => {
        await service.replaceTemplateConfiguration(1, {
          derivedOverrides: [{ derivedStatKey: "physicalAttack", coefficients: [{ primaryStatKey: "strength", coefficient: 2 }] }],
          scalarOverrides: [{ scalarParamKey: "secondaryChanceCap", value: 45 }],
        });
        // Le verrou (SELECT … FOR UPDATE) précède la 1re écriture.
        expect(callOrder[0]).toBe("lock");
        const firstWrite = callOrder.findIndex((e) => e.endsWith(".delete") || e.endsWith(".save"));
        expect(callOrder.indexOf("lock")).toBeLessThan(firstWrite);
        // Toutes les écritures ont eu lieu DANS la transaction (jamais hors-tx).
        expect(writeContexts.length).toBeGreaterThan(0);
        expect(writeContexts.every((inside) => inside === true)).toBe(true);
      });

      it("template inexistant (verrou → null) → 404, aucune suppression, aucune notification", async () => {
        const listener = jest.fn();
        service.onChange(listener);
        await service.setDerivedStatOverride(1, "physicalAttack", [{ primaryStatKey: "strength", coefficient: 2 }]);
        listener.mockClear();
        callOrder.length = 0;
        writeContexts.length = 0;
        lockGetOne.mockResolvedValue(null); // template absent au verrou

        await expect(
          service.replaceTemplateConfiguration(1, {
            derivedOverrides: [{ derivedStatKey: "defense", coefficients: [] }],
            scalarOverrides: [],
          }),
        ).rejects.toBeInstanceOf(NotFoundException);

        // Aucune écriture après le verrou nul, aucune notification, cache intact.
        expect(callOrder).toEqual(["lock"]);
        expect(writeContexts).toHaveLength(0);
        expect(listener).not.toHaveBeenCalled();
        expect(service.getOverrides(1).derivedCoefficients.physicalAttack).toEqual({ strength: 2 });
      });

      it("erreur APRÈS le verrou → rollback, aucun rafraîchissement de cache ni notification", async () => {
        const listener = jest.fn();
        service.onChange(listener);
        await service.setScalarOverride(1, "secondaryChanceCap", 55);
        listener.mockClear();
        const reloadSpy = jest.spyOn(service, "reloadTemplate");
        failNextHeaderDelete = true; // échec pendant la transaction (après le verrou)

        await expect(
          service.replaceTemplateConfiguration(1, {
            derivedOverrides: [{ derivedStatKey: "physicalAttack", coefficients: [{ primaryStatKey: "strength", coefficient: 2 }] }],
            scalarOverrides: [],
          }),
        ).rejects.toThrow(/boom/);

        // Le verrou a bien été pris avant l'échec, puis rollback : pas de reload,
        // pas de notification.
        expect(callOrder).toContain("lock");
        expect(reloadSpy).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
      });
    });
  });
});
