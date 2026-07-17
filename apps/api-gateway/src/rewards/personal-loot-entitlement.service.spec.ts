import { EntityManager } from 'typeorm';
import { PersonalLootEntitlement } from './entities/personal-loot-entitlement.entity';
import { PersonalLootEntitlementStatus as S } from './enums/personal-loot-entitlement-status.enum';
import {
  PersonalLootEntitlementConflictError,
  PersonalLootEntitlementNotFoundError,
  PersonalLootInvalidQuantityError,
  PersonalLootInvalidTransitionError,
} from './personal-loot-entitlement.errors';
import {
  CreateGroundEntitlementInput,
  PersonalLootEntitlementService,
} from './personal-loot-entitlement.service';

/** Violation d'unicité simulée (comme le driver PostgreSQL). */
class FakeUniqueViolation extends Error {
  code = "23505";
}

const BASE_INPUT: CreateGroundEntitlementInput = {
  killId: "kill-1",
  characterId: "char-1",
  rewardRollId: "roll-1",
  itemId: "item-1",
  quantity: 2,
  sourceCreatureId: "creature-1",
  sourceEncounterId: null,
};

function buildRow(
  overrides: Partial<PersonalLootEntitlement> = {},
): PersonalLootEntitlement {
  return {
    id: "ent-1",
    killId: "kill-1",
    characterId: "char-1",
    rewardRollId: "roll-1",
    itemId: "item-1",
    quantity: 2,
    status: S.GROUND,
    groundExpiresAt: null,
    mailExpiresAt: null,
    claimedAt: null,
    expiredAt: null,
    cancelledAt: null,
    sourceCreatureId: "creature-1",
    sourceEncounterId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as PersonalLootEntitlement;
}

describe("PersonalLootEntitlementService", () => {
  let service: PersonalLootEntitlementService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let qb: {
    // Chaîne SELECT ... FOR UPDATE (findByIdForUpdate / transition)
    setLock: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
    // Chaîne INSERT ... ON CONFLICT DO NOTHING (createGround)
    insert: jest.Mock;
    into: jest.Mock;
    values: jest.Mock;
    orIgnore: jest.Mock;
    returning: jest.Mock;
    execute: jest.Mock;
  };
  let manager: EntityManager;

  beforeEach(() => {
    qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      // Défaut : insertion réussie (une ligne retournée).
      execute: jest.fn().mockResolvedValue({ raw: [{ id: "ent-1" }] }),
    };
    repo = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    };
    manager = {
      getRepository: jest.fn(() => repo),
    } as unknown as EntityManager;

    service = new PersonalLootEntitlementService();
  });

  // ── Création idempotente (INSERT ... ON CONFLICT DO NOTHING) ─────────────────
  describe("createGroundEntitlementWithinManager", () => {
    it("insère via ON CONFLICT DO NOTHING et retourne l'état persistant relu", async () => {
      const persisted = buildRow();
      qb.execute.mockResolvedValueOnce({ raw: [{ id: "ent-1" }] }); // insertion
      repo.findOne.mockResolvedValueOnce(persisted);

      const result = await service.createGroundEntitlementWithinManager(
        manager,
        BASE_INPUT,
      );

      expect(qb.insert).toHaveBeenCalledTimes(1);
      expect(qb.orIgnore).toHaveBeenCalledTimes(1);
      expect(qb.execute).toHaveBeenCalledTimes(1);
      // Le résultat provient de la relecture de l'état persistant, pas du raw.
      expect(result).toBe(persisted);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { killId: "kill-1", characterId: "char-1", rewardRollId: "roll-1" },
      });
    });

    it("ne repose jamais sur un catch 23505 pour le flux idempotent", async () => {
      // orIgnore() absorbe le conflit côté SQL : execute NE REJETTE PAS,
      // il retourne simplement 0 ligne. Aucune détection de 23505 en amont.
      const existing = buildRow();
      qb.execute.mockResolvedValueOnce({ raw: [] }); // conflit ignoré
      repo.findOne.mockResolvedValueOnce(existing);

      const result = await service.createGroundEntitlementWithinManager(
        manager,
        BASE_INPUT,
      );

      expect(qb.orIgnore).toHaveBeenCalledTimes(1);
      expect(result).toBe(existing);
    });

    it("retry identique : conflit ignoré → relit et retourne l'existant", async () => {
      const existing = buildRow();
      qb.execute.mockResolvedValueOnce({ raw: [] }); // aucune ligne insérée
      repo.findOne.mockResolvedValueOnce(existing);

      const result = await service.createGroundEntitlementWithinManager(
        manager,
        BASE_INPUT,
      );

      expect(result).toBe(existing);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { killId: "kill-1", characterId: "char-1", rewardRollId: "roll-1" },
      });
    });

    it("transaction réutilisable : le flux continue après un conflit ignoré", async () => {
      qb.execute.mockResolvedValueOnce({ raw: [] }); // conflit
      repo.findOne.mockResolvedValueOnce(buildRow());

      await service.createGroundEntitlementWithinManager(manager, BASE_INPUT);

      // La relecture s'exécute avec le MÊME manager, sans rollback ni nouvelle
      // transaction (le mock manager n'expose que getRepository).
      expect(manager.getRepository).toHaveBeenCalledWith(PersonalLootEntitlement);
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it("lève un conflit si la clé existe avec un itemId différent", async () => {
      qb.execute.mockResolvedValueOnce({ raw: [] });
      repo.findOne.mockResolvedValueOnce(buildRow({ itemId: "item-OTHER" }));

      await expect(
        service.createGroundEntitlementWithinManager(manager, BASE_INPUT),
      ).rejects.toBeInstanceOf(PersonalLootEntitlementConflictError);
    });

    it("lève un conflit si la clé existe avec une quantité différente", async () => {
      qb.execute.mockResolvedValueOnce({ raw: [] });
      repo.findOne.mockResolvedValueOnce(buildRow({ quantity: 99 }));

      await expect(
        service.createGroundEntitlementWithinManager(manager, BASE_INPUT),
      ).rejects.toBeInstanceOf(PersonalLootEntitlementConflictError);
    });

    it("lève un conflit si la source diffère", async () => {
      qb.execute.mockResolvedValueOnce({ raw: [] });
      repo.findOne.mockResolvedValueOnce(buildRow({ sourceCreatureId: "creature-X" }));

      await expect(
        service.createGroundEntitlementWithinManager(manager, BASE_INPUT),
      ).rejects.toBeInstanceOf(PersonalLootEntitlementConflictError);
    });

    it("insertion réussie : aucune comparaison de conflit n'est appliquée", async () => {
      // Même si la ligne relue diffère (cas théorique), une insertion réussie
      // ne déclenche pas la comparaison immuable — la ligne est la nôtre.
      qb.execute.mockResolvedValueOnce({ raw: [{ id: "ent-1" }] });
      repo.findOne.mockResolvedValueOnce(buildRow({ itemId: "item-OTHER" }));

      await expect(
        service.createGroundEntitlementWithinManager(manager, BASE_INPUT),
      ).resolves.toBeDefined();
    });

    it("course concurrente : l'insertion perdante relit et retourne le gagnant", async () => {
      const winner = buildRow();
      qb.execute.mockResolvedValueOnce({ raw: [] }); // l'autre transaction a gagné
      repo.findOne.mockResolvedValueOnce(winner);

      const result = await service.createGroundEntitlementWithinManager(
        manager,
        BASE_INPUT,
      );

      expect(result).toBe(winner);
    });

    it("rejette une quantité nulle avant toute insertion", async () => {
      await expect(
        service.createGroundEntitlementWithinManager(manager, {
          ...BASE_INPUT,
          quantity: 0,
        }),
      ).rejects.toBeInstanceOf(PersonalLootInvalidQuantityError);
      expect(qb.execute).not.toHaveBeenCalled();
    });

    it("rejette une quantité négative", async () => {
      await expect(
        service.createGroundEntitlementWithinManager(manager, {
          ...BASE_INPUT,
          quantity: -3,
        }),
      ).rejects.toBeInstanceOf(PersonalLootInvalidQuantityError);
    });

    it("rejette une quantité non entière", async () => {
      await expect(
        service.createGroundEntitlementWithinManager(manager, {
          ...BASE_INPUT,
          quantity: 1.5,
        }),
      ).rejects.toBeInstanceOf(PersonalLootInvalidQuantityError);
    });

    it("propage une erreur d'insertion inattendue sans la traiter comme idempotente", async () => {
      // Une erreur imprévue (ex : contrainte DIFFÉRENTE, panne) ne doit pas être
      // silencieusement convertie en retour idempotent.
      qb.execute.mockRejectedValueOnce(new FakeUniqueViolation());

      await expect(
        service.createGroundEntitlementWithinManager(manager, BASE_INPUT),
      ).rejects.toBeInstanceOf(FakeUniqueViolation);
      expect(repo.findOne).not.toHaveBeenCalled();
    });
  });

  // ── Chargement sous verrou ──────────────────────────────────────────────────
  describe("findByIdForUpdateWithinManager", () => {
    it("charge avec un verrou pessimiste d'écriture, sans join", async () => {
      const row = buildRow();
      qb.getOne.mockResolvedValueOnce(row);

      const result = await service.findByIdForUpdateWithinManager(manager, "ent-1");

      expect(qb.setLock).toHaveBeenCalledWith("pessimistic_write");
      expect(qb.where).toHaveBeenCalledWith("entitlement.id = :id", { id: "ent-1" });
      expect(result).toBe(row);
    });
  });

  // ── Transition transactionnelle ─────────────────────────────────────────────
  describe("transitionWithinManager", () => {
    it("applique ground -> claimed et estampille claimedAt", async () => {
      const row = buildRow({ status: S.GROUND });
      qb.getOne.mockResolvedValueOnce(row);

      const result = await service.transitionWithinManager(manager, "ent-1", S.CLAIMED);

      expect(result.status).toBe(S.CLAIMED);
      expect(result.claimedAt).toBeInstanceOf(Date);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it("applique mailed -> expired et estampille expiredAt", async () => {
      const row = buildRow({ status: S.MAILED });
      qb.getOne.mockResolvedValueOnce(row);

      const result = await service.transitionWithinManager(manager, "ent-1", S.EXPIRED);

      expect(result.status).toBe(S.EXPIRED);
      expect(result.expiredAt).toBeInstanceOf(Date);
    });

    it("applique ground -> cancelled et estampille cancelledAt", async () => {
      const row = buildRow({ status: S.GROUND });
      qb.getOne.mockResolvedValueOnce(row);

      const result = await service.transitionWithinManager(manager, "ent-1", S.CANCELLED);

      expect(result.status).toBe(S.CANCELLED);
      expect(result.cancelledAt).toBeInstanceOf(Date);
    });

    it("retry idempotent : même état demandé, aucune écriture", async () => {
      const row = buildRow({ status: S.CLAIMED });
      qb.getOne.mockResolvedValueOnce(row);

      const result = await service.transitionWithinManager(manager, "ent-1", S.CLAIMED);

      expect(result).toBe(row);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("refuse une transition interdite (mailed -> ground) sans écriture", async () => {
      const row = buildRow({ status: S.MAILED });
      qb.getOne.mockResolvedValueOnce(row);

      await expect(
        service.transitionWithinManager(manager, "ent-1", S.GROUND),
      ).rejects.toBeInstanceOf(PersonalLootInvalidTransitionError);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("refuse une transition depuis un état terminal (claimed -> mailed)", async () => {
      const row = buildRow({ status: S.CLAIMED });
      qb.getOne.mockResolvedValueOnce(row);

      await expect(
        service.transitionWithinManager(manager, "ent-1", S.MAILED),
      ).rejects.toBeInstanceOf(PersonalLootInvalidTransitionError);
    });

    it("lève NotFound si la ligne est absente", async () => {
      qb.getOne.mockResolvedValueOnce(null);

      await expect(
        service.transitionWithinManager(manager, "missing", S.CLAIMED),
      ).rejects.toBeInstanceOf(PersonalLootEntitlementNotFoundError);
    });
  });
});
