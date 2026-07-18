import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreaturesService } from './creatures.service';
import { Creature } from './entities/creature.entity';
import { CreatureTemplate } from './entities/creature-template.entity';
import { CreatureSpawn } from './entities/creature-spawn.entity';
import { CreatureTemplateSkill } from './entities/creature-template-skill.entity';
import { SkillDefinition } from '../active-skills/entities/skill-definition.entity';
import { Character } from '../characters/entities/character.entity';
import { ProgressionService } from '../progression/progression.service';
import { MasteriesService } from '../masteries/masteries.service';
import { MasteryEffectsService } from '../masteries/mastery-effects.service';
import { WorldService } from '../world/world.service';
import { LootService } from '../world/loot.service';
import { RuntimeDebugRegistry } from '../player-runtime/debug-modifier.registry';
import { DerivedStatsService } from '../derived-stats/derived-stats.service';
import { DEFAULT_CREATURE_SECONDARY_COEFFICIENTS as G } from '../creature-runtime/creature-runtime.calculator';
import { CreatureSecondaryCoefficientsService } from '../creature-config/creature-secondary-coefficients.service';
import { CreatureTemplateOverridesService } from '../creature-config/creature-template-overrides.service';
import {
  CreatureTemplateOverrides,
  EMPTY_TEMPLATE_OVERRIDES,
} from '../creature-config/creature-template-overrides.constants';

const CATALOG = [
  { key: "physicalAttack", label: "Attaque physique", category: "offensive", baseValue: 0, primaryCoefficients: { strength: 2 } },
  { key: "defense", label: "Défense", category: "defensive", baseValue: 0, primaryCoefficients: { endurance: 1 } },
  { key: "maxHealth", label: "PV max", category: "resources", baseValue: 0, primaryCoefficients: { vitality: 10 } },
  { key: "magicResistanceFire", label: "Résistance feu", category: "elemental_resistance", baseValue: 0, primaryCoefficients: { spirit: 0.5, wisdom: 0.2 } },
  { key: "magicResistanceGlobal", label: "Résistance globale", category: "elemental_resistance", baseValue: 0, primaryCoefficients: {} },
];

function makeTemplate(overrides: Partial<CreatureTemplate> = {}): CreatureTemplate {
  return {
    id: 1, key: "turkey", name: "Turkey", baseHealth: 80, baseArmor: 5, baseAttack: 12,
    accuracy: 0, strength: 10, vitality: 8, endurance: 6, agility: 4, dexterity: 5,
    intelligence: 3, wisdom: 5, spirit: 20, willpower: 0, charisma: 0,
    ...overrides,
  } as CreatureTemplate;
}

function overrides(partial: Partial<CreatureTemplateOverrides>): CreatureTemplateOverrides {
  return { derivedCoefficients: partial.derivedCoefficients ?? {}, scalarParams: partial.scalarParams ?? {} };
}

describe("CreaturesService — configuration dérivée + snapshot (Studio)", () => {
  let service: CreaturesService;
  let templateRepo: { findOne: jest.Mock };
  let overridesMock: { getOverrides: jest.Mock; onChange: jest.Mock; replaceTemplateConfiguration: jest.Mock };

  beforeEach(async () => {
    templateRepo = { findOne: jest.fn().mockResolvedValue(makeTemplate()) };
    overridesMock = {
      getOverrides: jest.fn().mockReturnValue(EMPTY_TEMPLATE_OVERRIDES),
      onChange: jest.fn(),
      replaceTemplateConfiguration: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreaturesService,
        { provide: DerivedStatsService, useValue: { getDefinitions: jest.fn().mockResolvedValue(CATALOG) } },
        { provide: getRepositoryToken(Creature), useValue: { find: jest.fn(), findOne: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(CreatureTemplate), useValue: templateRepo },
        { provide: getRepositoryToken(CreatureSpawn), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(CreatureTemplateSkill), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(SkillDefinition), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Character), useValue: { findOne: jest.fn(), update: jest.fn() } },
        { provide: WorldService, useValue: { getAllConnectedPlayers: jest.fn().mockReturnValue([]) } },
        { provide: ProgressionService, useValue: { applyCharacterXpInTx: jest.fn() } },
        { provide: MasteriesService, useValue: { applyMasteryXpInTx: jest.fn() } },
        { provide: MasteryEffectsService, useValue: {} },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: CreatureSecondaryCoefficientsService, useValue: { getCoefficients: jest.fn().mockReturnValue({ ...G }) } },
        { provide: CreatureTemplateOverridesService, useValue: overridesMock },
        RuntimeDebugRegistry,
        LootService,
      ],
    }).compile();
    service = module.get(CreaturesService);
  });

  // ── GET configuration ───────────────────────────────────────────────────────
  describe("getTemplateDerivedConfiguration", () => {
    it("template inconnu → null", async () => {
      templateRepo.findOne.mockResolvedValue(null);
      expect(await service.getTemplateDerivedConfiguration("ghost")).toBeNull();
    });

    it("sans override : provenance fallback + effectifs du global/catalogue + aucun explicite", async () => {
      const cfg = (await service.getTemplateDerivedConfiguration("turkey"))!;
      const atk = cfg.derivedStats.find((d) => d.derivedStatKey === "physicalAttack")!;
      expect(atk.overrideState).toBe("none");
      expect(atk.explicitCoefficients).toBeNull();
      expect(atk.effectiveCoefficients).toEqual([{ primaryStatKey: "strength", coefficient: G.attackPowerPerStrength }]);
      expect(atk.source).toBe("global");
      expect(atk.baseSource).toBe("baseAttack");
      const fire = cfg.derivedStats.find((d) => d.derivedStatKey === "magicResistanceFire")!;
      expect(fire.source).toBe("catalog");
      expect(fire.effectiveCoefficients).toEqual([
        { primaryStatKey: "spirit", coefficient: 0.5 },
        { primaryStatKey: "wisdom", coefficient: 0.2 },
      ]);
    });

    it("override présent : coefficients explicites + provenance template", async () => {
      overridesMock.getOverrides.mockReturnValue(
        overrides({ derivedCoefficients: { physicalAttack: { strength: 3.5 } } }),
      );
      const cfg = (await service.getTemplateDerivedConfiguration("turkey"))!;
      const atk = cfg.derivedStats.find((d) => d.derivedStatKey === "physicalAttack")!;
      expect(atk.overrideState).toBe("coefficients");
      expect(atk.explicitCoefficients).toEqual([{ primaryStatKey: "strength", coefficient: 3.5 }]);
      expect(atk.source).toBe("template");
    });

    it("override VIDE distinct de l'absence d'override", async () => {
      overridesMock.getOverrides.mockReturnValue(overrides({ derivedCoefficients: { physicalAttack: {} } }));
      const cfg = (await service.getTemplateDerivedConfiguration("turkey"))!;
      const atk = cfg.derivedStats.find((d) => d.derivedStatKey === "physicalAttack")!;
      expect(atk.overrideState).toBe("empty");
      expect(atk.explicitCoefficients).toEqual([]);
      expect(atk.effectiveCoefficients).toEqual([]);
      expect(atk.source).toBe("template");
    });

    it("scalaires : fallback global vs override template", async () => {
      overridesMock.getOverrides.mockReturnValue(overrides({ scalarParams: { secondaryChanceCap: 75 } }));
      const cfg = (await service.getTemplateDerivedConfiguration("turkey"))!;
      const cap = cfg.scalarParams.find((s) => s.scalarParamKey === "secondaryChanceCap")!;
      expect(cap).toEqual({ scalarParamKey: "secondaryChanceCap", explicitValue: 75, effectiveValue: 75, source: "template" });
      const block = cfg.scalarParams.find((s) => s.scalarParamKey === "blockReductionPercent")!;
      expect(block).toEqual({ scalarParamKey: "blockReductionPercent", explicitValue: null, effectiveValue: G.blockReductionPercent, source: "global" });
    });

    it("catalogue serveur exposé (aucune liste frontend en dur)", async () => {
      const cfg = (await service.getTemplateDerivedConfiguration("turkey"))!;
      expect(cfg.catalog.primaryStatKeys).toContain("strength");
      expect(cfg.catalog.scalarParamKeys).toEqual(["blockReductionPercent", "secondaryChanceCap"]);
      expect(cfg.catalog.derivedStatKeys).toContain("physicalAttack");
      expect(cfg.catalog.derivedStatKeys).toContain("magicResistanceFire");
    });
  });

  // ── PUT (délégation + restriction clés configurables) ───────────────────────
  describe("saveTemplateDerivedConfiguration", () => {
    it("template inconnu → null (aucune écriture)", async () => {
      templateRepo.findOne.mockResolvedValue(null);
      const r = await service.saveTemplateDerivedConfiguration("ghost", { derivedOverrides: [], scalarOverrides: [] });
      expect(r).toBeNull();
      expect(overridesMock.replaceTemplateConfiguration).not.toHaveBeenCalled();
    });

    it("délègue le remplacement atomique au service d'overrides", async () => {
      await service.saveTemplateDerivedConfiguration("turkey", {
        derivedOverrides: [{ derivedStatKey: "physicalAttack", coefficients: [{ primaryStatKey: "strength", coefficient: 3.5 }] }],
        scalarOverrides: [],
      });
      expect(overridesMock.replaceTemplateConfiguration).toHaveBeenCalledWith(1, expect.any(Object));
    });

    it("rejette une clé dérivée non configurable pour une créature (ex: magicPower)", async () => {
      await expect(
        service.saveTemplateDerivedConfiguration("turkey", {
          derivedOverrides: [{ derivedStatKey: "magicPower", coefficients: [] }],
          scalarOverrides: [],
        }),
      ).rejects.toThrow();
      expect(overridesMock.replaceTemplateConfiguration).not.toHaveBeenCalled();
    });
  });

  // ── Snapshot runtime ────────────────────────────────────────────────────────
  describe("getInstanceRuntimeSnapshot", () => {
    function addInstance(instanceId: string, template: CreatureTemplate, health = 80) {
      (service as any).liveCreatures.set(instanceId, {
        id: instanceId,
        health,
        state: "idle",
        spawn: { template },
      });
    }

    it("instance inconnue → null", async () => {
      expect(await service.getInstanceRuntimeSnapshot("nope")).toBeNull();
    });

    it("sans override : dérivées finales + traces + provenance fallback", async () => {
      addInstance("i1", makeTemplate());
      const snap = (await service.getInstanceRuntimeSnapshot("i1"))!;
      expect(snap.templateKey).toBe("turkey");
      expect(snap.primaryStats.strength).toBe(10);
      // attackPower = baseAttack 12 + strength 10 × 2 = 32.
      expect(snap.derivedStats.physicalAttack).toBe(12 + 10 * G.attackPowerPerStrength);
      // résistance feu = spirit 20 × 0.5 + wisdom 5 × 0.2 = 11.
      expect(snap.derivedStats.magicResistanceFire).toBe(11);
      const atkTrace = snap.traces.find((t) => t.derivedStatKey === "physicalAttack")!;
      expect(atkTrace.baseValue).toBe(12);
      expect(atkTrace.baseSource).toBe("baseAttack");
      expect(atkTrace.contributions).toEqual([
        { primaryStatKey: "strength", primaryValue: 10, coefficient: G.attackPowerPerStrength, contribution: 20 },
      ]);
      expect(atkTrace.finalValue).toBe(32);
      expect(atkTrace.source).toBe("global");
      expect(atkTrace.overrideState).toBe("none");
    });

    it("instances de deux templates utilisent chacune leurs overrides", async () => {
      const turkey = makeTemplate({ id: 1, key: "turkey" });
      const wolf = makeTemplate({ id: 2, key: "wolf" });
      overridesMock.getOverrides.mockImplementation((id: number) =>
        id === 2
          ? overrides({ derivedCoefficients: { physicalAttack: { strength: 3.5 } } })
          : EMPTY_TEMPLATE_OVERRIDES,
      );
      addInstance("t1", turkey);
      addInstance("w1", wolf);
      const st = (await service.getInstanceRuntimeSnapshot("t1"))!;
      const sw = (await service.getInstanceRuntimeSnapshot("w1"))!;
      expect(st.derivedStats.physicalAttack).toBe(12 + 10 * 2); // 32
      expect(sw.derivedStats.physicalAttack).toBe(12 + 10 * 3.5); // 47
      const trW = sw.traces.find((t) => t.derivedStatKey === "physicalAttack")!;
      expect(trW.source).toBe("template");
    });

    it("expose les paramètres scalaires + résistances + maxHealth", async () => {
      addInstance("i1", makeTemplate({ vitality: 8 }));
      const snap = (await service.getInstanceRuntimeSnapshot("i1"))!;
      expect(snap.maxHealth).toBe(80 + 8 * G.maxHealthPerVitality);
      expect(snap.derivedStats.blockReductionPercent).toBe(G.blockReductionPercent);
      expect(snap.derivedStats.secondaryChanceCap).toBe(G.secondaryChanceCap);
      expect(snap.derivedStats).toHaveProperty("magicResistanceGlobal");
    });
  });
});
