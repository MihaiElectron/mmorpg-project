import {
  hasCompleteWorldPosition,
  hasPartialWorldPosition,
  readWorldPosition,
  WorldPositionError,
  WUPositionRecord,
} from './world-position.adapter';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rec(
  worldX: number | null | undefined,
  worldY: number | null | undefined,
  mapId: number | null | undefined,
): WUPositionRecord {
  return { worldX, worldY, mapId };
}

function throwsWithKind(fn: () => unknown, kind: WorldPositionError['kind']): void {
  let err: WorldPositionError | undefined;
  try { fn(); } catch (e) { err = e as WorldPositionError; }
  expect(err).toBeInstanceOf(WorldPositionError);
  expect(err?.kind).toBe(kind);
}

// ─── hasCompleteWorldPosition ─────────────────────────────────────────────────

describe('hasCompleteWorldPosition', () => {
  it('all three non-null → true', () => {
    expect(hasCompleteWorldPosition(rec(1024, 2048, 1))).toBe(true);
  });

  it('worldX=0, worldY=0, mapId=1 → true (zero est valide, pas null)', () => {
    expect(hasCompleteWorldPosition(rec(0, 0, 1))).toBe(true);
  });

  it('worldX null → false', () => {
    expect(hasCompleteWorldPosition(rec(null, 2048, 1))).toBe(false);
  });

  it('worldY null → false', () => {
    expect(hasCompleteWorldPosition(rec(1024, null, 1))).toBe(false);
  });

  it('mapId null → false', () => {
    expect(hasCompleteWorldPosition(rec(1024, 2048, null))).toBe(false);
  });

  it('all null → false', () => {
    expect(hasCompleteWorldPosition(rec(null, null, null))).toBe(false);
  });

  it('all undefined → false', () => {
    expect(hasCompleteWorldPosition({})).toBe(false);
  });
});

// ─── hasPartialWorldPosition ──────────────────────────────────────────────────

describe('hasPartialWorldPosition', () => {
  it('only worldX → true', () => {
    expect(hasPartialWorldPosition(rec(1024, null, null))).toBe(true);
  });

  it('worldX + worldY without mapId → true', () => {
    expect(hasPartialWorldPosition(rec(1024, 2048, null))).toBe(true);
  });

  it('only mapId → true', () => {
    expect(hasPartialWorldPosition(rec(null, null, 1))).toBe(true);
  });

  it('all null → false (aucun set)', () => {
    expect(hasPartialWorldPosition(rec(null, null, null))).toBe(false);
  });

  it('empty record → false', () => {
    expect(hasPartialWorldPosition({})).toBe(false);
  });

  it('all complete → false (pas partiel)', () => {
    expect(hasPartialWorldPosition(rec(1024, 2048, 1))).toBe(false);
  });
});

// ─── readWorldPosition — position WU complète ─────────────────────────────────

describe('readWorldPosition — position WU complète', () => {
  it('retourne worldX/worldY/mapId directement', () => {
    const result = readWorldPosition(rec(1024, 2048, 1), () => { throw new Error('ne doit pas être appelé'); });
    expect(result).toEqual({ worldX: 1024, worldY: 2048, mapId: 1 });
  });

  it('n\'appelle pas legacyGetter si WU est complet', () => {
    const getter = jest.fn().mockReturnValue({ x: 400, y: 300 });
    readWorldPosition(rec(512, 512, 1), getter);
    expect(getter).not.toHaveBeenCalled();
  });

  it('worldX=0, worldY=0, mapId=1 → valeur zéro préservée', () => {
    const result = readWorldPosition(rec(0, 0, 1), () => null);
    expect(result).toEqual({ worldX: 0, worldY: 0, mapId: 1 });
  });

  it('worldX négatif (valeur WU négative possible) → retourné tel quel', () => {
    const result = readWorldPosition(rec(-1040, 12720, 1), () => null);
    expect(result).toEqual({ worldX: -1040, worldY: 12720, mapId: 1 });
  });
});

// ─── readWorldPosition — fallback legacy pixels ───────────────────────────────

describe('readWorldPosition — fallback legacy pixels', () => {
  it('pixel(400, 300) → WU(0, 9600) mapId=1', () => {
    const result = readWorldPosition({}, () => ({ x: 400, y: 300 }));
    expect(result).toEqual({ worldX: 0, worldY: 9600, mapId: 1 });
  });

  it('pixel(600, 580) → WU(6080, 12480) mapId=1', () => {
    const result = readWorldPosition(rec(null, null, null), () => ({ x: 600, y: 580 }));
    expect(result).toEqual({ worldX: 6080, worldY: 12480, mapId: 1 });
  });

  it('pixel(600, 300) → WU(1600, 8000) mapId=1', () => {
    const result = readWorldPosition(rec(null, null, null), () => ({ x: 600, y: 300 }));
    expect(result).toEqual({ worldX: 1600, worldY: 8000, mapId: 1 });
  });

  it('mapId par défaut en fallback = 1 (DEFAULT_MAP_ID)', () => {
    const result = readWorldPosition({}, () => ({ x: 400, y: 300 }));
    expect(result.mapId).toBe(1);
  });

  it('legacyGetter appelé avec l\'entité originale', () => {
    const entity: WUPositionRecord = {};
    const getter = jest.fn().mockReturnValue({ x: 400, y: 300 });
    readWorldPosition(entity, getter);
    expect(getter).toHaveBeenCalledWith(entity);
  });
});

// ─── readWorldPosition — position WU partielle → PARTIAL_WU ──────────────────

describe('readWorldPosition — position WU partielle', () => {
  it('worldX seul → WorldPositionError PARTIAL_WU', () => {
    throwsWithKind(() => readWorldPosition(rec(1024, null, null), () => null), 'PARTIAL_WU');
  });

  it('worldX + worldY sans mapId → PARTIAL_WU', () => {
    throwsWithKind(() => readWorldPosition(rec(1024, 2048, null), () => null), 'PARTIAL_WU');
  });

  it('mapId seul → PARTIAL_WU', () => {
    throwsWithKind(() => readWorldPosition(rec(null, null, 1), () => null), 'PARTIAL_WU');
  });

  it('message contient les valeurs partielles', () => {
    let err!: WorldPositionError;
    try { readWorldPosition(rec(1024, null, null), () => null); } catch (e) { err = e as WorldPositionError; }
    expect(err.message).toContain('worldX=1024');
    expect(err.message).toContain('worldY=null');
  });
});

// ─── readWorldPosition — legacy pixels invalides ──────────────────────────────

describe('readWorldPosition — legacy pixels invalides', () => {
  it('legacyGetter retourne null → MISSING_LEGACY', () => {
    throwsWithKind(() => readWorldPosition({}, () => null), 'MISSING_LEGACY');
  });

  it('legacyGetter retourne x=undefined → MISSING_LEGACY', () => {
    throwsWithKind(() => readWorldPosition({}, () => ({ x: undefined as any, y: 300 })), 'MISSING_LEGACY');
  });

  it('x=NaN → INVALID_LEGACY', () => {
    throwsWithKind(() => readWorldPosition({}, () => ({ x: NaN, y: 300 })), 'INVALID_LEGACY');
  });

  it('y=Infinity → INVALID_LEGACY', () => {
    throwsWithKind(() => readWorldPosition({}, () => ({ x: 400, y: Infinity })), 'INVALID_LEGACY');
  });

  it('x=-Infinity → INVALID_LEGACY', () => {
    throwsWithKind(() => readWorldPosition({}, () => ({ x: -Infinity, y: 300 })), 'INVALID_LEGACY');
  });

  it('WorldPositionError est une instance d\'Error', () => {
    let err!: WorldPositionError;
    try { readWorldPosition({}, () => null); } catch (e) { err = e as WorldPositionError; }
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('WorldPositionError');
  });
});
