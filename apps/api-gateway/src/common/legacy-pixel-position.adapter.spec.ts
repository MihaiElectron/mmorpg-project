import { DEFAULT_MAP_ID } from './world-coordinates';
import {
  pixelToWU,
  pixelToWUWithMap,
  legacyRadiusToWU,
} from './legacy-pixel-position.adapter';

// ─── Known values from database-wu-compatibility-audit.md ─────────────────────

describe('pixelToWU — known audit values', () => {
  it('character default (400, 300) → worldX=0, worldY=9600', () => {
    expect(pixelToWU({ x: 400, y: 300 })).toEqual({ worldX: 0, worldY: 9600 });
  });

  it('turkey spawn (600, 580) → worldX=6080, worldY=12480', () => {
    expect(pixelToWU({ x: 600, y: 580 })).toEqual({ worldX: 6080, worldY: 12480 });
  });

  it('respawn point (600, 300) → worldX=1600, worldY=8000', () => {
    expect(pixelToWU({ x: 600, y: 300 })).toEqual({ worldX: 1600, worldY: 8000 });
  });
});

// ─── pixelToWU — general behaviour ───────────────────────────────────────────

describe('pixelToWU', () => {
  it('origin (1000, 0) → WU (0, 0)', () => {
    expect(pixelToWU({ x: 1000, y: 0 })).toEqual({ worldX: 0, worldY: 0 });
  });

  it('one tile right on screen (1064, 32) → WU (1024, 0)', () => {
    expect(pixelToWU({ x: 1064, y: 32 })).toEqual({ worldX: 1024, worldY: 0 });
  });

  it('one tile down-left on screen (936, 32) → WU (0, 1024)', () => {
    expect(pixelToWU({ x: 936, y: 32 })).toEqual({ worldX: 0, worldY: 1024 });
  });

  it('returns integer worldX and worldY', () => {
    const result = pixelToWU({ x: 400, y: 300 });
    expect(Number.isInteger(result.worldX)).toBe(true);
    expect(Number.isInteger(result.worldY)).toBe(true);
  });

  it('throws on NaN x', () => {
    expect(() => pixelToWU({ x: NaN, y: 0 })).toThrow(RangeError);
  });

  it('throws on Infinity y', () => {
    expect(() => pixelToWU({ x: 0, y: Infinity })).toThrow(RangeError);
  });
});

// ─── pixelToWUWithMap ─────────────────────────────────────────────────────────

describe('pixelToWUWithMap', () => {
  it('character default → correct WU + DEFAULT_MAP_ID', () => {
    expect(pixelToWUWithMap({ x: 400, y: 300 })).toEqual({
      worldX: 0,
      worldY: 9600,
      mapId: DEFAULT_MAP_ID,
    });
  });

  it('mapId is always DEFAULT_MAP_ID (1)', () => {
    const result = pixelToWUWithMap({ x: 600, y: 580 });
    expect(result.mapId).toBe(1);
  });

  it('worldX and worldY match pixelToWU', () => {
    const pos = { x: 600, y: 300 };
    const withMap = pixelToWUWithMap(pos);
    const withoutMap = pixelToWU(pos);
    expect(withMap.worldX).toBe(withoutMap.worldX);
    expect(withMap.worldY).toBe(withoutMap.worldY);
  });
});

// ─── legacyRadiusToWU ────────────────────────────────────────────────────────

describe('legacyRadiusToWU', () => {
  it('radius 0 → 0 WU', () => {
    expect(legacyRadiusToWU(0)).toBe(0);
  });

  it('respawn_point default radius (20 px) → 320 WU', () => {
    // 20 × 16 (TILE_SIZE_WU / ISO_HALF_TILE_WIDTH_PX) = 320
    expect(legacyRadiusToWU(20)).toBe(320);
  });

  it('RESOURCE_INTERACT_RANGE (100 px) → 1600 WU', () => {
    expect(legacyRadiusToWU(100)).toBe(1600);
  });

  it('MELEE_RANGE (60 px) → 960 WU', () => {
    expect(legacyRadiusToWU(60)).toBe(960);
  });

  it('aggroRadius turkey (50 px) → 800 WU', () => {
    expect(legacyRadiusToWU(50)).toBe(800);
  });

  it('returns an integer', () => {
    expect(Number.isInteger(legacyRadiusToWU(33))).toBe(true);
  });
});
