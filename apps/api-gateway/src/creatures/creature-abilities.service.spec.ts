import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CreatureAbilitiesService } from "./creature-abilities.service";

// ---------------------------------------------------------------------------
// Mocks repos + dataSource
// ---------------------------------------------------------------------------
function makeService() {
  const templateRepo = { findOne: jest.fn() };
  const abilityRepo = { find: jest.fn().mockResolvedValue([]) };
  const skillRepo = { find: jest.fn().mockResolvedValue([]) };
  const managerOps = { delete: jest.fn(), create: jest.fn((_e, v) => v), save: jest.fn() };
  const dataSource = {
    transaction: jest.fn(async (cb: any) => cb(managerOps)),
  };
  const service = new CreatureAbilitiesService(
    templateRepo as any,
    abilityRepo as any,
    skillRepo as any,
    dataSource as any,
  );
  return { service, templateRepo, abilityRepo, skillRepo, dataSource, managerOps };
}

describe("CreatureAbilitiesService (V5-A)", () => {
  describe("listForTemplate", () => {
    it("404 si le template n'existe pas", async () => {
      const { service, templateRepo } = makeService();
      templateRepo.findOne.mockResolvedValue(null);
      await expect(service.listForTemplate("ghost")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("enrichit chaque association avec le catalogue skill (nom/kind/enabled)", async () => {
      const { service, templateRepo, abilityRepo, skillRepo } = makeService();
      templateRepo.findOne.mockResolvedValue({ id: 1, key: "goblin" });
      abilityRepo.find.mockResolvedValue([
        { skillKey: "fireball", enabled: true, displayOrder: 0 },
        { skillKey: "ghost_skill", enabled: false, displayOrder: 1 },
      ]);
      skillRepo.find.mockResolvedValue([
        {
          key: "fireball",
          name: "Boule de feu",
          skillKind: "active",
          enabled: true,
          effectType: "damage",
          damageType: "raw",
          rangeWU: 5000,
          cooldownMs: 3000,
        },
      ]);
      const out = await service.listForTemplate("goblin");
      expect(out).toEqual([
        {
          skillKey: "fireball",
          enabled: true,
          displayOrder: 0,
          skillName: "Boule de feu",
          skillKind: "active",
          skillEnabled: true,
          effectType: "damage",
          damageType: "raw",
          rangeWU: 5000,
          cooldownMs: 3000,
          missing: false,
        },
        {
          skillKey: "ghost_skill",
          enabled: false,
          displayOrder: 1,
          skillName: null,
          skillKind: null,
          skillEnabled: null,
          effectType: null,
          damageType: null,
          rangeWU: null,
          cooldownMs: null,
          missing: true, // clé absente du catalogue
        },
      ]);
    });

    it("les métadonnées read-only proviennent du SkillDefinition (V5-C3-A)", async () => {
      const { service, templateRepo, abilityRepo, skillRepo } = makeService();
      templateRepo.findOne.mockResolvedValue({ id: 1, key: "goblin" });
      abilityRepo.find.mockResolvedValue([{ skillKey: "heal", enabled: true, displayOrder: 0 }]);
      skillRepo.find.mockResolvedValue([
        { key: "heal", name: "Soin", skillKind: "active", enabled: false, effectType: "heal", damageType: "physical", rangeWU: 200, cooldownMs: 1500 },
      ]);
      const [ability] = await service.listForTemplate("goblin");
      expect(ability).toMatchObject({
        skillKey: "heal",
        enabled: true, // association
        skillEnabled: false, // catalogue
        effectType: "heal",
        damageType: "physical",
        rangeWU: 200,
        cooldownMs: 1500,
      });
    });
  });

  describe("replaceForTemplate", () => {
    it("404 si le template n'existe pas", async () => {
      const { service, templateRepo } = makeService();
      templateRepo.findOne.mockResolvedValue(null);
      await expect(service.replaceForTemplate("ghost", [])).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("rejette les doublons de skillKey", async () => {
      const { service, templateRepo } = makeService();
      templateRepo.findOne.mockResolvedValue({ id: 1, key: "goblin" });
      await expect(
        service.replaceForTemplate("goblin", [{ skillKey: "a" }, { skillKey: "a" }]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejette une skillKey inconnue au catalogue", async () => {
      const { service, templateRepo, skillRepo } = makeService();
      templateRepo.findOne.mockResolvedValue({ id: 1, key: "goblin" });
      skillRepo.find.mockResolvedValue([]); // aucune clé connue
      await expect(
        service.replaceForTemplate("goblin", [{ skillKey: "unknown" }]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("remplace la liste dans une transaction (delete + insert) puis relit", async () => {
      const { service, templateRepo, abilityRepo, skillRepo, managerOps } = makeService();
      templateRepo.findOne.mockResolvedValue({ id: 7, key: "goblin" });
      skillRepo.find
        .mockResolvedValueOnce([{ key: "fireball" }]) // validation existence
        .mockResolvedValueOnce([{ key: "fireball", name: "Boule de feu", skillKind: "active", enabled: true }]); // enrich (relecture)
      abilityRepo.find.mockResolvedValue([
        { skillKey: "fireball", enabled: true, displayOrder: 0 },
      ]);

      const out = await service.replaceForTemplate("goblin", [{ skillKey: "fireball" }]);

      expect(managerOps.delete).toHaveBeenCalledWith(expect.anything(), {
        creatureTemplateId: 7,
      });
      expect(managerOps.save).toHaveBeenCalled();
      expect(out).toHaveLength(1);
      expect(out[0].skillKey).toBe("fireball");
      expect(out[0].missing).toBe(false);
    });

    it("liste vide → delete seul, aucun insert", async () => {
      const { service, templateRepo, abilityRepo, managerOps } = makeService();
      templateRepo.findOne.mockResolvedValue({ id: 7, key: "goblin" });
      abilityRepo.find.mockResolvedValue([]);
      await service.replaceForTemplate("goblin", []);
      expect(managerOps.delete).toHaveBeenCalled();
      expect(managerOps.save).not.toHaveBeenCalled();
    });

    it("PUT compatible : champs read-only envoyés par erreur ignorés (pas de mutation SkillDefinition)", async () => {
      const { service, templateRepo, abilityRepo, skillRepo, managerOps } = makeService();
      templateRepo.findOne.mockResolvedValue({ id: 7, key: "goblin" });
      skillRepo.find
        .mockResolvedValueOnce([{ key: "fireball" }])
        .mockResolvedValueOnce([{ key: "fireball", name: "Boule de feu", enabled: true }]);
      abilityRepo.find.mockResolvedValue([{ skillKey: "fireball", enabled: true, displayOrder: 0 }]);
      // Le frontend renvoie par erreur des métadonnées read-only.
      await service.replaceForTemplate("goblin", [
        { skillKey: "fireball", enabled: true, displayOrder: 0, effectType: "heal", rangeWU: 999, cooldownMs: 42 } as any,
      ]);
      // Seuls les champs mutables sont persistés (pas d'effectType/rangeWU/cooldownMs).
      const created = managerOps.create.mock.calls[0][1];
      expect(created).toEqual({ creatureTemplateId: 7, skillKey: "fireball", enabled: true, displayOrder: 0 });
      // skillRepo n'est utilisé qu'en lecture (find) — aucune écriture SkillDefinition.
      expect((skillRepo as any).save).toBeUndefined();
    });
  });
});
