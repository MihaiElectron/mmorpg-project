// apps/api-gateway/src/player-runtime/entity-runtime.types.spec.ts

import {
  ENTITY_RUNTIME_KINDS,
  type EntityRuntimeKind,
  type EntityRuntimeSnapshot,
  type EntityRuntimeEventBase,
  type EntityRuntimeService,
} from './entity-runtime.types';
import type { PlayerRuntimeSnapshot } from './runtime-source';
import type { BaseStats, DerivedStats } from './player-runtime.types';

// ─── Helpers de test ──────────────────────────────────────────────────────────

function makeBaseStats(): BaseStats {
  return { level: 1, health: 100, maxHealth: 100, attack: 10, defense: 5, experience: 0 };
}

function makeDerivedStats(): DerivedStats {
  return { maxHp: 100, attackPower: 10, defenseTotal: 5, speed: 0, gatheringRange: 0, attackRange: 0 };
}

function makePlayerSnapshot(): PlayerRuntimeSnapshot {
  return {
    entityId: 'char-1',
    entityKind: 'player',
    characterId: 'char-1',
    name: 'Hero',
    mapId: 1,
    baseStats: makeBaseStats(),
    derivedStats: makeDerivedStats(),
    sources: [],
    modifiers: [],
    trace: { stats: {}, modifierCount: 0, computedAt: new Date() },
    computedAt: new Date(),
  };
}

// ─── EntityRuntimeKind ────────────────────────────────────────────────────────

describe('ENTITY_RUNTIME_KINDS', () => {
  it('contient exactement 5 kinds', () => {
    expect(ENTITY_RUNTIME_KINDS).toHaveLength(5);
  });

  it("inclut 'player'", () => {
    expect(ENTITY_RUNTIME_KINDS).toContain('player');
  });

  it("inclut 'creature'", () => {
    expect(ENTITY_RUNTIME_KINDS).toContain('creature');
  });

  it("inclut 'npc'", () => {
    expect(ENTITY_RUNTIME_KINDS).toContain('npc');
  });

  it("inclut 'resource'", () => {
    expect(ENTITY_RUNTIME_KINDS).toContain('resource');
  });

  it("inclut 'building'", () => {
    expect(ENTITY_RUNTIME_KINDS).toContain('building');
  });

  it('tous les kinds sont des strings', () => {
    expect(ENTITY_RUNTIME_KINDS.every((k) => typeof k === 'string')).toBe(true);
  });
});

// ─── EntityRuntimeSnapshot — compatibilité PlayerRuntimeSnapshot ──────────────

/**
 * Vérification de compatibilité structurelle (compile-time).
 *
 * Si ce type s'assigne sans erreur TypeScript, PlayerRuntimeSnapshot
 * satisfait EntityRuntimeSnapshot<BaseStats, DerivedStats>.
 */
type AssertPlayerSnapshotCompatible = PlayerRuntimeSnapshot extends
  EntityRuntimeSnapshot<BaseStats, DerivedStats>
  ? true
  : false;

describe('EntityRuntimeSnapshot — compatibilité Player', () => {
  it('PlayerRuntimeSnapshot satisfait EntityRuntimeSnapshot<BaseStats, DerivedStats>', () => {
    // La variable ci-dessous forcerait une erreur de compilation si
    // PlayerRuntimeSnapshot n'implémentait pas EntityRuntimeSnapshot.
    const _check: AssertPlayerSnapshotCompatible = true;
    expect(_check).toBe(true);
  });

  it('entityId est un string non vide', () => {
    const snap = makePlayerSnapshot();
    expect(typeof snap.entityId).toBe('string');
    expect(snap.entityId.length).toBeGreaterThan(0);
  });

  it("entityKind vaut 'player'", () => {
    const snap = makePlayerSnapshot();
    expect(snap.entityKind).toBe('player');
  });

  it('entityId === characterId pour Player', () => {
    const snap = makePlayerSnapshot();
    expect(snap.entityId).toBe(snap.characterId);
  });

  it('contient name', () => {
    const snap = makePlayerSnapshot();
    expect(typeof snap.name).toBe('string');
  });

  it('contient baseStats', () => {
    const snap = makePlayerSnapshot();
    expect(snap.baseStats).toBeDefined();
    expect(typeof snap.baseStats.level).toBe('number');
  });

  it('contient derivedStats', () => {
    const snap = makePlayerSnapshot();
    expect(snap.derivedStats).toBeDefined();
    expect(typeof snap.derivedStats.maxHp).toBe('number');
  });

  it('contient sources, modifiers, trace, computedAt', () => {
    const snap = makePlayerSnapshot();
    expect(Array.isArray(snap.sources)).toBe(true);
    expect(Array.isArray(snap.modifiers)).toBe(true);
    expect(snap.trace).toBeDefined();
    expect(snap.computedAt).toBeInstanceOf(Date);
  });

  it("un EntityRuntimeSnapshot générique peut recevoir un PlayerRuntimeSnapshot", () => {
    const snap = makePlayerSnapshot();
    // Affectation vers le type générique — vérifie la compatibilité structurelle
    const generic: EntityRuntimeSnapshot<BaseStats, DerivedStats> = snap;
    expect(generic.entityId).toBe('char-1');
    expect(generic.entityKind).toBe('player');
  });
});

// ─── EntityRuntimeEventBase ───────────────────────────────────────────────────

describe('EntityRuntimeEventBase', () => {
  it('structure correcte avec entityId, entityKind, computedAt', () => {
    const event: EntityRuntimeEventBase = {
      entityId: 'char-1',
      entityKind: 'player',
      computedAt: new Date(),
    };
    expect(event.entityId).toBe('char-1');
    expect(event.entityKind).toBe('player');
    expect(event.computedAt).toBeInstanceOf(Date);
  });

  it("entityKind peut être 'creature'", () => {
    const event: EntityRuntimeEventBase = {
      entityId: 'creature-1',
      entityKind: 'creature',
      computedAt: new Date(),
    };
    expect(event.entityKind).toBe('creature');
  });
});

// ─── EntityRuntimeService — contrat ──────────────────────────────────────────

describe('EntityRuntimeService — contrat', () => {
  it('une implémentation minimale satisfait le contrat', async () => {
    const snap: EntityRuntimeSnapshot<BaseStats, DerivedStats> = makePlayerSnapshot();

    const mockService: EntityRuntimeService<typeof snap> = {
      getRuntimeSnapshot: async (entityId: string) => {
        return entityId === 'char-1' ? snap : null;
      },
    };

    const result = await mockService.getRuntimeSnapshot('char-1');
    expect(result).toBe(snap);
    expect(result?.entityId).toBe('char-1');
  });

  it('retourne null si entityId inconnu', async () => {
    const mockService: EntityRuntimeService = {
      getRuntimeSnapshot: async () => null,
    };
    expect(await mockService.getRuntimeSnapshot('unknown')).toBeNull();
  });
});

// ─── EntityRuntimeKind — typage discriminant ──────────────────────────────────

describe('EntityRuntimeKind — discrimination', () => {
  it('permet de discriminer sur entityKind dans un snapshot', () => {
    const snap = makePlayerSnapshot();

    let handled = false;
    if (snap.entityKind === 'player') {
      // Dans ce bloc, TypeScript sait que snap est PlayerRuntimeSnapshot
      handled = true;
      expect(snap.characterId).toBeDefined();
    }
    expect(handled).toBe(true);
  });

  it('EntityRuntimeKind reconnaît les 5 valeurs à runtime', () => {
    const knownKinds: EntityRuntimeKind[] = ['player', 'creature', 'npc', 'resource', 'building'];
    for (const kind of knownKinds) {
      expect(ENTITY_RUNTIME_KINDS).toContain(kind);
    }
  });
});
