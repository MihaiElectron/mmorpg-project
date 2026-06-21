import {
  generateEntityReport,
  generateDryRunReport,
  formatReport,
  PositionedRecord,
  MapBounds,
  DEFAULT_MAP_BOUNDS,
} from './wu-backfill-report';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(
  id: string | number,
  opts: { worldX?: number | null; worldY?: number | null; mapId?: number | null } = {},
): PositionedRecord {
  return { id, worldX: opts.worldX ?? null, worldY: opts.worldY ?? null, mapId: opts.mapId ?? null };
}

// Extractor that treats record.id as a proxy for custom fields — tests pass
// explicit pixel coords via a closure instead
function noLegacy(_r: PositionedRecord): { x: number; y: number } | null {
  return null;
}

// ─── generateEntityReport — basic counts ─────────────────────────────────────

describe('generateEntityReport — counts', () => {
  it('empty records → all zeros', () => {
    const report = generateEntityReport('test', [], noLegacy);
    expect(report.total).toBe(0);
    expect(report.alreadyFilled).toBe(0);
    expect(report.toBackfill).toBe(0);
    expect(report.samples).toHaveLength(0);
    expect(report.anomalies).toHaveLength(0);
  });

  it('all records fully WU-filled → alreadyFilled = total, toBackfill = 0', () => {
    const records = [
      makeRecord('a', { worldX: 1024, worldY: 2048, mapId: 1 }),
      makeRecord('b', { worldX: 0,    worldY: 0,    mapId: 1 }),
    ];
    const report = generateEntityReport('test', records, noLegacy);
    expect(report.total).toBe(2);
    expect(report.alreadyFilled).toBe(2);
    expect(report.toBackfill).toBe(0);
    expect(report.anomalies).toHaveLength(0);
  });

  it('no WU fill → toBackfill = total', () => {
    const records = [makeRecord('a'), makeRecord('b'), makeRecord('c')];
    const pixelAt = (x: number, y: number) => (_r: PositionedRecord) => ({ x, y });
    const report = generateEntityReport('test', records, pixelAt(400, 300));
    expect(report.total).toBe(3);
    expect(report.alreadyFilled).toBe(0);
    expect(report.toBackfill).toBe(3);
  });

  it('mixed records', () => {
    const filled = makeRecord('filled', { worldX: 0, worldY: 9600, mapId: 1 });
    const empty  = makeRecord('empty');
    const report = generateEntityReport('test', [filled, empty], (_r) => ({ x: 400, y: 300 }));
    expect(report.alreadyFilled).toBe(1);
    expect(report.toBackfill).toBe(1);
  });
});

// ─── generateEntityReport — known audit values ────────────────────────────────

describe('generateEntityReport — audit samples', () => {
  const cases = [
    { label: 'character default',  x: 400, y: 300, worldX: 0,    worldY: 9600  },
    { label: 'turkey spawn',       x: 600, y: 580, worldX: 6080, worldY: 12480 },
    { label: 'respawn point',      x: 600, y: 300, worldX: 1600, worldY: 8000  },
  ];

  test.each(cases)('$label: pixel($x,$y) → WU($worldX,$worldY)', ({ x, y, worldX, worldY }) => {
    const records = [makeRecord('r1')];
    const report = generateEntityReport('test', records, () => ({ x, y }));
    expect(report.samples).toHaveLength(1);
    expect(report.samples[0].worldX).toBe(worldX);
    expect(report.samples[0].worldY).toBe(worldY);
    expect(report.samples[0].mapId).toBe(1);
    expect(report.samples[0].legacyX).toBe(x);
    expect(report.samples[0].legacyY).toBe(y);
  });
});

// ─── generateEntityReport — sample limits ────────────────────────────────────

describe('generateEntityReport — maxSamples', () => {
  const records = ['a', 'b', 'c', 'd', 'e'].map(id => makeRecord(id));

  it('default maxSamples = 3', () => {
    const report = generateEntityReport('test', records, () => ({ x: 400, y: 300 }));
    expect(report.samples).toHaveLength(3);
  });

  it('custom maxSamples = 1', () => {
    const report = generateEntityReport('test', records, () => ({ x: 400, y: 300 }), 1);
    expect(report.samples).toHaveLength(1);
  });

  it('maxSamples = 0 → no samples', () => {
    const report = generateEntityReport('test', records, () => ({ x: 400, y: 300 }), 0);
    expect(report.samples).toHaveLength(0);
  });
});

// ─── generateEntityReport — anomaly: MISSING_PIXEL_COORDS ────────────────────

describe('anomaly: MISSING_PIXEL_COORDS', () => {
  it('getLegacy returns null → MISSING_PIXEL_COORDS anomaly', () => {
    const report = generateEntityReport('test', [makeRecord('x1')], () => null);
    expect(report.anomalies).toHaveLength(1);
    expect(report.anomalies[0].kind).toBe('MISSING_PIXEL_COORDS');
    expect(report.anomalies[0].id).toBe('x1');
    expect(report.toBackfill).toBe(1);
  });

  it('getLegacy returns undefined coords → MISSING_PIXEL_COORDS', () => {
    const report = generateEntityReport('test', [makeRecord('x2')], () => ({ x: undefined as any, y: 300 }));
    expect(report.anomalies[0].kind).toBe('MISSING_PIXEL_COORDS');
  });
});

// ─── generateEntityReport — anomaly: NON_FINITE_PIXEL ────────────────────────

describe('anomaly: NON_FINITE_PIXEL', () => {
  it('NaN x → NON_FINITE_PIXEL', () => {
    const report = generateEntityReport('test', [makeRecord('nf')], () => ({ x: NaN, y: 300 }));
    expect(report.anomalies[0].kind).toBe('NON_FINITE_PIXEL');
    expect(report.toBackfill).toBe(1);
  });

  it('Infinity y → NON_FINITE_PIXEL', () => {
    const report = generateEntityReport('test', [makeRecord('inf')], () => ({ x: 400, y: Infinity }));
    expect(report.anomalies[0].kind).toBe('NON_FINITE_PIXEL');
  });
});

// ─── generateEntityReport — anomaly: PARTIAL_WU_FILL ─────────────────────────

describe('anomaly: PARTIAL_WU_FILL', () => {
  it('worldX set but worldY/mapId null → PARTIAL_WU_FILL', () => {
    const rec = makeRecord('p1', { worldX: 1024 });
    const report = generateEntityReport('test', [rec], () => ({ x: 400, y: 300 }));
    const partial = report.anomalies.find(a => a.kind === 'PARTIAL_WU_FILL');
    expect(partial).toBeDefined();
    expect(partial!.id).toBe('p1');
  });

  it('worldY set but worldX/mapId null → PARTIAL_WU_FILL', () => {
    const rec = makeRecord('p2', { worldY: 2048 });
    const report = generateEntityReport('test', [rec], () => ({ x: 400, y: 300 }));
    expect(report.anomalies.find(a => a.kind === 'PARTIAL_WU_FILL')).toBeDefined();
  });

  it('partial record is still counted in toBackfill', () => {
    const rec = makeRecord('p3', { worldX: 1024 });
    const report = generateEntityReport('test', [rec], () => ({ x: 400, y: 300 }));
    expect(report.toBackfill).toBe(1);
    expect(report.alreadyFilled).toBe(0);
  });
});

// ─── generateEntityReport — anomaly: MAPID_MISSING_FOR_WU ────────────────────

describe('anomaly: MAPID_MISSING_FOR_WU', () => {
  it('worldX+worldY set but mapId null → MAPID_MISSING_FOR_WU', () => {
    const rec = makeRecord('m1', { worldX: 0, worldY: 9600 });
    const report = generateEntityReport('test', [rec], () => ({ x: 400, y: 300 }));
    const anomaly = report.anomalies.find(a => a.kind === 'MAPID_MISSING_FOR_WU');
    expect(anomaly).toBeDefined();
    expect(anomaly!.id).toBe('m1');
  });

  it('is distinct from PARTIAL_WU_FILL', () => {
    const rec = makeRecord('m2', { worldX: 0, worldY: 9600 });
    const report = generateEntityReport('test', [rec], () => ({ x: 400, y: 300 }));
    expect(report.anomalies.find(a => a.kind === 'PARTIAL_WU_FILL')).toBeUndefined();
    expect(report.anomalies.find(a => a.kind === 'MAPID_MISSING_FOR_WU')).toBeDefined();
  });
});

// ─── generateEntityReport — anomaly: OUT_OF_INT32 ────────────────────────────

describe('anomaly: OUT_OF_INT32', () => {
  it('values within int32 range → no OUT_OF_INT32 anomaly', () => {
    const report = generateEntityReport('test', [makeRecord('ok')], () => ({ x: 400, y: 300 }));
    expect(report.anomalies.find(a => a.kind === 'OUT_OF_INT32')).toBeUndefined();
  });

  it('enormous pixel values producing WU beyond int32 → OUT_OF_INT32', () => {
    // x = INT32_MAX / 8 + 1000 approx would overflow worldX
    // worldX = 8*(x-1000) + 16*y;  to overflow: 8*x > INT32_MAX → x > 268_435_455
    const report = generateEntityReport('test', [makeRecord('big')], () => ({
      x: 300_000_000,
      y: 0,
    }));
    expect(report.anomalies.find(a => a.kind === 'OUT_OF_INT32')).toBeDefined();
    // Still counted in toBackfill (conversion was attempted)
    expect(report.toBackfill).toBe(1);
  });
});

// ─── generateEntityReport — anomaly: OUT_OF_MAP_BOUNDS ───────────────────────

describe('anomaly: OUT_OF_MAP_BOUNDS', () => {
  // DEFAULT_MAP_BOUNDS : 64×64 tiles → [0, 65536) × [0, 65536)
  const bounds: MapBounds = DEFAULT_MAP_BOUNDS;

  it('pixel(140, 365) → WU(-1040, 12720): worldX négatif → OUT_OF_MAP_BOUNDS', () => {
    // worldX = 8*(-860) + 16*365 = -6880 + 5840 = -1040  (hors bornes)
    // worldY = -8*(-860) + 16*365 = 6880 + 5840 = 12720  (dans bornes)
    const report = generateEntityReport('test', [makeRecord('a1')], () => ({ x: 140, y: 365 }), 3, bounds);
    const oob = report.anomalies.find(a => a.kind === 'OUT_OF_MAP_BOUNDS');
    expect(oob).toBeDefined();
    expect(oob!.id).toBe('a1');
    expect(oob!.detail).toContain('worldX=-1040');
    expect(oob!.detail).toContain('pixel(140, 365)');
    expect(oob!.detail).toContain('WU(-1040, 12720)');
  });

  it('worldX hors bornes → seul worldX mentionné dans le détail', () => {
    const report = generateEntityReport('test', [makeRecord('a2')], () => ({ x: 140, y: 365 }), 3, bounds);
    const oob = report.anomalies.find(a => a.kind === 'OUT_OF_MAP_BOUNDS');
    expect(oob!.detail).toContain('[0, 65536)');
    expect(oob!.detail).not.toContain('worldY=');
  });

  it('pixel(600, 300) → WU(1600, 8000) : dans les bornes → pas d\'OUT_OF_MAP_BOUNDS', () => {
    const report = generateEntityReport('test', [makeRecord('b1')], () => ({ x: 600, y: 300 }), 3, bounds);
    expect(report.anomalies.find(a => a.kind === 'OUT_OF_MAP_BOUNDS')).toBeUndefined();
    expect(report.anomalies).toHaveLength(0);
  });

  it('worldX = maxWorldX (65536) est exclu → OUT_OF_MAP_BOUNDS', () => {
    // pixel(5096, 2048) → worldX = 8*4096 + 16*2048 = 32768 + 32768 = 65536, worldY = -32768 + 32768 = 0
    const report = generateEntityReport('test', [makeRecord('c1')], () => ({ x: 5096, y: 2048 }), 3, bounds);
    const oob = report.anomalies.find(a => a.kind === 'OUT_OF_MAP_BOUNDS');
    expect(oob).toBeDefined();
    expect(oob!.detail).toContain('worldX=65536');
  });

  it('worldY hors bornes (> 65535) → OUT_OF_MAP_BOUNDS avec worldY dans le détail', () => {
    // pixel(600, 4096) → worldX = 8*(-400) + 16*4096 = -3200 + 65536 = 62336 (ok)
    //                     worldY = -8*(-400) + 16*4096 = 3200 + 65536 = 68736  (hors bornes)
    const report = generateEntityReport('test', [makeRecord('d1')], () => ({ x: 600, y: 4096 }), 3, bounds);
    const oob = report.anomalies.find(a => a.kind === 'OUT_OF_MAP_BOUNDS');
    expect(oob).toBeDefined();
    expect(oob!.detail).toContain('worldY=68736');
    expect(oob!.detail).toContain('pixel(600, 4096)');
  });

  it('sans bounds → pas d\'OUT_OF_MAP_BOUNDS même pour pixel(140, 365)', () => {
    const report = generateEntityReport('test', [makeRecord('e1')], () => ({ x: 140, y: 365 }));
    expect(report.anomalies.find(a => a.kind === 'OUT_OF_MAP_BOUNDS')).toBeUndefined();
  });

  it('OUT_OF_MAP_BOUNDS est compté dans toBackfill', () => {
    const report = generateEntityReport('test', [makeRecord('f1')], () => ({ x: 140, y: 365 }), 3, bounds);
    expect(report.toBackfill).toBe(1);
    expect(report.alreadyFilled).toBe(0);
  });

  it('DEFAULT_MAP_BOUNDS : bornes = [0, 65536) × [0, 65536)', () => {
    expect(DEFAULT_MAP_BOUNDS.minWorldX).toBe(0);
    expect(DEFAULT_MAP_BOUNDS.maxWorldX).toBe(65536);
    expect(DEFAULT_MAP_BOUNDS.minWorldY).toBe(0);
    expect(DEFAULT_MAP_BOUNDS.maxWorldY).toBe(65536);
  });
});

// ─── generateDryRunReport ─────────────────────────────────────────────────────

describe('generateDryRunReport', () => {
  it('aggregates totals across entity reports', () => {
    const r1 = generateEntityReport('entity_a', [makeRecord('a')], () => ({ x: 400, y: 300 }));
    const r2 = generateEntityReport('entity_b', [makeRecord('b'), makeRecord('c')], () => ({ x: 600, y: 300 }));
    const combined = generateDryRunReport([r1, r2]);
    expect(combined.totalRows).toBe(3);
    expect(combined.totalToBackfill).toBe(3);
    expect(combined.entities).toHaveLength(2);
  });

  it('counts anomalies across entities', () => {
    const r1 = generateEntityReport('e', [makeRecord('x')], () => null);  // MISSING anomaly
    const combined = generateDryRunReport([r1]);
    expect(combined.totalAnomalies).toBe(1);
  });

  it('empty entities list', () => {
    const report = generateDryRunReport([]);
    expect(report.totalRows).toBe(0);
    expect(report.totalToBackfill).toBe(0);
    expect(report.totalAnomalies).toBe(0);
  });
});

// ─── formatReport ─────────────────────────────────────────────────────────────

describe('formatReport', () => {
  it('output contains header and entity name', () => {
    const r = generateEntityReport('character', [makeRecord('id1')], () => ({ x: 400, y: 300 }));
    const out = formatReport(generateDryRunReport([r]));
    expect(out).toContain('WU BACKFILL DRY-RUN REPORT');
    expect(out).toContain('character');
    expect(out).toContain('id1');
  });

  it('output contains before/after sample line', () => {
    const r = generateEntityReport('test', [makeRecord('r1')], () => ({ x: 400, y: 300 }));
    const out = formatReport(generateDryRunReport([r]));
    expect(out).toContain('pixel(400, 300)');
    expect(out).toContain('WU(0, 9600)');
    expect(out).toContain('mapId=1');
  });

  it('output contains anomaly line', () => {
    const r = generateEntityReport('test', [makeRecord('bad')], () => null);
    const out = formatReport(generateDryRunReport([r]));
    expect(out).toContain('MISSING_PIXEL_COORDS');
    expect(out).toContain('bad');
  });

  it('returns a non-empty string even for empty report', () => {
    const out = formatReport(generateDryRunReport([]));
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('WU BACKFILL DRY-RUN REPORT');
  });
});
