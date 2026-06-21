import {
  TILE_SIZE_WU,
  TILE_SHIFT,
  TILE_MASK,
  CHUNK_SIZE_TILES,
  CHUNK_SHIFT,
  CHUNK_SIZE_WU,
  ISO_HALF_TILE_WIDTH_PX,
  ISO_HALF_TILE_HEIGHT_PX,
  WORLD_ORIGIN_X_PX,
  DEFAULT_MAP_ID,
  tileToWU,
  wuToTileIndex,
  wuToTileFloat,
  wuToSubTile,
  wuToChunkIndex,
  tileCenterToWU,
  wuToIsoScreenX,
  wuToIsoScreenY,
  isoScreenToWorldWU,
  chebyshevDistanceWU,
  euclideanDistanceWU,
  euclideanDistanceSquaredWU,
} from './world-coordinates';

// ─── Constants consistency ────────────────────────────────────────────────────

describe('constants', () => {
  it('TILE_SIZE_WU is 2^TILE_SHIFT', () => {
    expect(TILE_SIZE_WU).toBe(2 ** TILE_SHIFT);
  });

  it('TILE_MASK is TILE_SIZE_WU - 1', () => {
    expect(TILE_MASK).toBe(TILE_SIZE_WU - 1);
  });

  it('CHUNK_SIZE_WU is CHUNK_SIZE_TILES × TILE_SIZE_WU', () => {
    expect(CHUNK_SIZE_WU).toBe(CHUNK_SIZE_TILES * TILE_SIZE_WU);
  });

  it('2^CHUNK_SHIFT equals CHUNK_SIZE_WU', () => {
    expect(2 ** CHUNK_SHIFT).toBe(CHUNK_SIZE_WU);
  });

  it('WORLD_ORIGIN_X_PX derives from createLayer offset + ISO_HALF_TILE_WIDTH_PX', () => {
    // createLayer is called with offsetX=936; north vertex = 936 + 64 = 1000
    expect(WORLD_ORIGIN_X_PX).toBe(936 + ISO_HALF_TILE_WIDTH_PX);
  });

  it('projection coefficients are consistent with tile dimensions', () => {
    // screenX divisor = TILE_SIZE_WU / ISO_HALF_TILE_WIDTH_PX
    expect(TILE_SIZE_WU / ISO_HALF_TILE_WIDTH_PX).toBe(16);
    // screenY divisor = TILE_SIZE_WU / ISO_HALF_TILE_HEIGHT_PX
    expect(TILE_SIZE_WU / ISO_HALF_TILE_HEIGHT_PX).toBe(32);
  });

  it('DEFAULT_MAP_ID is 1', () => {
    expect(DEFAULT_MAP_ID).toBe(1);
  });
});

// ─── WU ↔ Tile ────────────────────────────────────────────────────────────────

describe('tileToWU', () => {
  it('tile 0 → 0', () => expect(tileToWU(0)).toBe(0));
  it('tile 1 → 1024', () => expect(tileToWU(1)).toBe(1024));
  it('tile 64 → 65536 (one chunk)', () => expect(tileToWU(64)).toBe(CHUNK_SIZE_WU));
  it('negative tile -1 → -1024', () => expect(tileToWU(-1)).toBe(-1024));
});

describe('wuToTileIndex', () => {
  it('0 → tile 0', () => expect(wuToTileIndex(0)).toBe(0));
  it('1023 → tile 0 (last sub-tile of tile 0)', () => expect(wuToTileIndex(1023)).toBe(0));
  it('1024 → tile 1', () => expect(wuToTileIndex(1024)).toBe(1));
  it('2047 → tile 1', () => expect(wuToTileIndex(2047)).toBe(1));
  it('2048 → tile 2', () => expect(wuToTileIndex(2048)).toBe(2));
  it('-1 → -1 (tile below 0)', () => expect(wuToTileIndex(-1)).toBe(-1));
  it('-1024 → -1', () => expect(wuToTileIndex(-1024)).toBe(-1));
  it('-1025 → -2', () => expect(wuToTileIndex(-1025)).toBe(-2));
});

describe('wuToTileFloat', () => {
  it('512 → 0.5 (mid-tile)', () => expect(wuToTileFloat(512)).toBeCloseTo(0.5));
  it('1024 → 1.0', () => expect(wuToTileFloat(1024)).toBe(1.0));
  it('0 → 0', () => expect(wuToTileFloat(0)).toBe(0));
});

describe('wuToSubTile', () => {
  it('0 → 0', () => expect(wuToSubTile(0)).toBe(0));
  it('512 → 512', () => expect(wuToSubTile(512)).toBe(512));
  it('1023 → 1023 (last position in tile 0)', () => expect(wuToSubTile(1023)).toBe(1023));
  it('1024 → 0 (first position of tile 1)', () => expect(wuToSubTile(1024)).toBe(0));
  it('1536 → 512 (mid-tile 1)', () => expect(wuToSubTile(1536)).toBe(512));
});

describe('tileCenterToWU', () => {
  it('tile 0 center → 512', () => expect(tileCenterToWU(0)).toBe(512));
  it('tile 1 center → 1536', () => expect(tileCenterToWU(1)).toBe(1536));
  it('tile -1 center → -512', () => expect(tileCenterToWU(-1)).toBe(-512));
  it('center is always mid-point of tile range', () => {
    for (const t of [0, 1, 5, 100]) {
      const center = tileCenterToWU(t);
      expect(center).toBe(tileToWU(t) + TILE_SIZE_WU / 2);
    }
  });
});

// ─── WU ↔ Chunk ───────────────────────────────────────────────────────────────

describe('wuToChunkIndex', () => {
  it('0 → chunk 0', () => expect(wuToChunkIndex(0)).toBe(0));
  it('65535 → chunk 0 (last WU of chunk 0)', () => expect(wuToChunkIndex(65535)).toBe(0));
  it('65536 → chunk 1', () => expect(wuToChunkIndex(65536)).toBe(1));
  it('-1 → -1', () => expect(wuToChunkIndex(-1)).toBe(-1));
});

// ─── Round-trip consistency ────────────────────────────────────────────────────

describe('tile ↔ WU round-trip', () => {
  it('tileToWU then wuToTileIndex recovers original tile', () => {
    for (const t of [0, 1, 5, 63, 64, 1000]) {
      expect(wuToTileIndex(tileToWU(t))).toBe(t);
    }
  });

  it('wuToTileIndex of tileCenterToWU returns the same tile', () => {
    for (const t of [0, 1, 10, 63]) {
      expect(wuToTileIndex(tileCenterToWU(t))).toBe(t);
    }
  });
});

// ─── Isometric projection ──────────────────────────────────────────────────────

describe('wuToIsoScreenX', () => {
  it('WU (0, 0) → originX', () => {
    expect(wuToIsoScreenX(0, 0)).toBe(1000);
  });

  it('tile (1, 0) → originX + ISO_HALF_TILE_WIDTH_PX', () => {
    expect(wuToIsoScreenX(1024, 0)).toBe(1000 + 64);
  });

  it('tile (0, 1) → originX − ISO_HALF_TILE_WIDTH_PX', () => {
    expect(wuToIsoScreenX(0, 1024)).toBe(1000 - 64);
  });

  it('tile (1, 1) → originX (on the vertical axis)', () => {
    expect(wuToIsoScreenX(1024, 1024)).toBe(1000);
  });

  it('accepts custom origin', () => {
    expect(wuToIsoScreenX(0, 0, 500)).toBe(500);
  });
});

describe('wuToIsoScreenY', () => {
  it('WU (0, 0) → originY', () => {
    expect(wuToIsoScreenY(0, 0)).toBe(0);
  });

  it('tile (1, 0) → originY + ISO_HALF_TILE_HEIGHT_PX', () => {
    expect(wuToIsoScreenY(1024, 0)).toBe(32);
  });

  it('tile (0, 1) → originY + ISO_HALF_TILE_HEIGHT_PX', () => {
    expect(wuToIsoScreenY(0, 1024)).toBe(32);
  });

  it('tile (1, 1) → originY + 2 × ISO_HALF_TILE_HEIGHT_PX', () => {
    expect(wuToIsoScreenY(1024, 1024)).toBe(64);
  });
});

// ─── Inverse projection ────────────────────────────────────────────────────────

describe('isoScreenToWorldWU', () => {
  it('origin → WU (0, 0)', () => {
    expect(isoScreenToWorldWU(1000, 0)).toEqual({ worldX: 0, worldY: 0 });
  });

  it('tile (1, 0) screen position → WU (1024, 0)', () => {
    expect(isoScreenToWorldWU(1064, 32)).toEqual({ worldX: 1024, worldY: 0 });
  });

  it('tile (0, 1) screen position → WU (0, 1024)', () => {
    expect(isoScreenToWorldWU(936, 32)).toEqual({ worldX: 0, worldY: 1024 });
  });

  it('tile (1, 1) screen position → WU (1024, 1024)', () => {
    expect(isoScreenToWorldWU(1000, 64)).toEqual({ worldX: 1024, worldY: 1024 });
  });

  it('throws on NaN input', () => {
    expect(() => isoScreenToWorldWU(NaN, 0)).toThrow(RangeError);
    expect(() => isoScreenToWorldWU(0, NaN)).toThrow(RangeError);
  });

  it('throws on Infinity input', () => {
    expect(() => isoScreenToWorldWU(Infinity, 0)).toThrow(RangeError);
    expect(() => isoScreenToWorldWU(0, -Infinity)).toThrow(RangeError);
  });

  it('accepts custom origin', () => {
    expect(isoScreenToWorldWU(500, 0, 500, 0)).toEqual({ worldX: 0, worldY: 0 });
  });
});

// ─── Projection round-trip ────────────────────────────────────────────────────

describe('WU → screen → WU round-trip', () => {
  const cases: Array<{ wx: number; wy: number }> = [
    { wx: 0, wy: 0 },
    { wx: 1024, wy: 0 },
    { wx: 0, wy: 1024 },
    { wx: 1024, wy: 1024 },
    { wx: 5 * 1024, wy: 3 * 1024 },
    { wx: -1024, wy: 2048 },
  ];

  test.each(cases)('round-trip WU (%o)', ({ wx, wy }) => {
    const sx = wuToIsoScreenX(wx, wy);
    const sy = wuToIsoScreenY(wx, wy);
    const result = isoScreenToWorldWU(sx, sy);
    expect(result.worldX).toBe(wx);
    expect(result.worldY).toBe(wy);
  });
});

// ─── Distance functions ────────────────────────────────────────────────────────

describe('chebyshevDistanceWU', () => {
  const origin = { worldX: 0, worldY: 0 };

  it('same point → 0', () => {
    expect(chebyshevDistanceWU(origin, origin)).toBe(0);
  });

  it('point on X axis', () => {
    expect(chebyshevDistanceWU(origin, { worldX: 1024, worldY: 0 })).toBe(1024);
  });

  it('point on Y axis', () => {
    expect(chebyshevDistanceWU(origin, { worldX: 0, worldY: 512 })).toBe(512);
  });

  it('diagonal returns max of both axes', () => {
    expect(chebyshevDistanceWU(origin, { worldX: 1024, worldY: 512 })).toBe(1024);
    expect(chebyshevDistanceWU(origin, { worldX: 200, worldY: 800 })).toBe(800);
  });

  it('is symmetric', () => {
    const a = { worldX: 100, worldY: 200 };
    const b = { worldX: 500, worldY: 300 };
    expect(chebyshevDistanceWU(a, b)).toBe(chebyshevDistanceWU(b, a));
  });

  it('works with negative coordinates', () => {
    const a = { worldX: -1024, worldY: 0 };
    expect(chebyshevDistanceWU(origin, a)).toBe(1024);
  });
});

describe('euclideanDistanceWU', () => {
  const origin = { worldX: 0, worldY: 0 };

  it('same point → 0', () => {
    expect(euclideanDistanceWU(origin, origin)).toBe(0);
  });

  it('3-4-5 Pythagorean triple', () => {
    expect(euclideanDistanceWU(origin, { worldX: 3, worldY: 4 })).toBeCloseTo(5);
  });

  it('is symmetric', () => {
    const a = { worldX: 300, worldY: 400 };
    const b = { worldX: 0, worldY: 0 };
    expect(euclideanDistanceWU(a, b)).toBeCloseTo(euclideanDistanceWU(b, a));
  });
});

describe('euclideanDistanceSquaredWU', () => {
  const origin = { worldX: 0, worldY: 0 };

  it('same point → 0', () => {
    expect(euclideanDistanceSquaredWU(origin, origin)).toBe(0);
  });

  it('3-4 → 25', () => {
    expect(euclideanDistanceSquaredWU(origin, { worldX: 3, worldY: 4 })).toBe(25);
  });

  it('equals euclideanDistanceWU squared', () => {
    const a = { worldX: 1024, worldY: 768 };
    const b = { worldX: 512, worldY: 256 };
    const d = euclideanDistanceWU(a, b);
    expect(euclideanDistanceSquaredWU(a, b)).toBeCloseTo(d * d);
  });
});
