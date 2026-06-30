import { describe, expect, it } from 'vitest';

import {
  PermissiveSupportResistanceEngine,
  resolveDescriptiveRangeContext,
} from '../src/index.js';
import type { ContextZone, StructureZone } from '../src/index.js';
import { makeCandle, makeLenientConfig, makeSupportZone } from './helpers.js';

function makeResistanceZone(overrides: Partial<StructureZone> = {}): StructureZone {
  const timestamp = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'zone-resistance-1',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    role: 'RESISTANCE',
    originalRole: 'RESISTANCE',
    lifecycle: 'FRESH',
    origin: 'SWING_HIGH',
    originIndex: 0,
    confirmedIndex: 0,
    availableFromIndex: 0,
    originAt: timestamp,
    low: 110,
    high: 111.5,
    mid: 110.75,
    createdAt: timestamp,
    touchCount: 0,
    rejectionCount: 0,
    breakCount: 0,
    noisyCrossCount: 0,
    quality: 'LOW',
    score: 0,
    widthPct: 1,
    evidence: [],
    warnings: [],
    ...overrides,
  };
}

function makeContextZone(overrides: Partial<ContextZone> = {}): ContextZone {
  return {
    id: 'ctx-zone-1',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    kind: 'RANGE_BOX',
    low: 108,
    high: 112,
    mid: 110,
    widthPct: 4,
    lifecycle: 'FRESH',
    quality: 'LOW',
    score: 0,
    sourceZoneId: 'source-1',
    actionable: false,
    usableAsS1R1: false,
    usableAsCleanStop: false,
    usableAs2RBlocker: false,
    warnings: [],
    evidence: [],
    ...overrides,
  };
}

describe('resolveDescriptiveRangeContext', () => {
  it('returns ACTIONABLE_PAIR with HIGH confidence when s1 + r1 both present', () => {
    const s1 = makeSupportZone({ id: 's1', low: 98, high: 100, mid: 99, tier: 'ACTIONABLE' });
    const r1 = makeResistanceZone({ id: 'r1', low: 110, high: 112, mid: 111, tier: 'ACTIONABLE' });

    const result = resolveDescriptiveRangeContext({
      price: 105,
      s1,
      r1,
      supportZones: [s1],
      resistanceZones: [r1],
      contextZones: [],
    });

    expect(result.source).toBe('ACTIONABLE_PAIR');
    expect(result.confidence).toBe('HIGH');
    expect(result.nearestSupport?.id).toBe('s1');
    expect(result.nearestSupport?.source).toBe('ACTIONABLE');
    expect(result.nearestResistance?.id).toBe('r1');
    expect(result.nearestResistance?.source).toBe('ACTIONABLE');
    expect(result.missingReason).toBeUndefined();
  });

  it('computes rangeLocation correctly from s1/r1 pair', () => {
    // price=105, s1.mid=99, r1.mid=111 → rangeSize=12, position=(105-99)/12=0.5 → MIDDLE
    const s1 = makeSupportZone({ low: 98, high: 100, mid: 99, tier: 'ACTIONABLE' });
    const r1 = makeResistanceZone({ low: 110, high: 112, mid: 111, tier: 'ACTIONABLE' });

    expect(
      resolveDescriptiveRangeContext({
        price: 105,
        s1,
        r1,
        supportZones: [s1],
        resistanceZones: [r1],
        contextZones: [],
      }).rangeLocation,
    ).toBe('MIDDLE');

    // price=100.5, position=(100.5-99)/12=0.125 → NEAR_SUPPORT
    expect(
      resolveDescriptiveRangeContext({
        price: 100.5,
        s1,
        r1,
        supportZones: [s1],
        resistanceZones: [r1],
        contextZones: [],
      }).rangeLocation,
    ).toBe('NEAR_SUPPORT');

    // price=109, position=(109-99)/12=0.833 → NEAR_RESISTANCE
    expect(
      resolveDescriptiveRangeContext({
        price: 109,
        s1,
        r1,
        supportZones: [s1],
        resistanceZones: [r1],
        contextZones: [],
      }).rangeLocation,
    ).toBe('NEAR_RESISTANCE');
  });

  it('returns CONTEXT_PAIR when only context zones present — s1/r1 stay undefined', () => {
    const ctxSupport = makeContextZone({
      id: 'ctx-sup',
      low: 97,
      high: 101,
      mid: 99,
      roleHint: 'SUPPORT_CONTEXT',
    });
    const ctxResistance = makeContextZone({
      id: 'ctx-res',
      low: 109,
      high: 113,
      mid: 111,
      roleHint: 'RESISTANCE_CONTEXT',
    });

    const result = resolveDescriptiveRangeContext({
      price: 105,
      supportZones: [],
      resistanceZones: [],
      contextZones: [ctxSupport, ctxResistance],
    });

    expect(result.source).toBe('CONTEXT_PAIR');
    expect(result.confidence).toBe('LOW');
    expect(result.nearestSupport?.id).toBe('ctx-sup');
    expect(result.nearestSupport?.source).toBe('CONTEXT');
    expect(result.nearestResistance?.id).toBe('ctx-res');
    expect(result.nearestResistance?.source).toBe('CONTEXT');
    expect(['NEAR_SUPPORT', 'MIDDLE', 'NEAR_RESISTANCE']).toContain(result.rangeLocation);
  });

  it('returns ONE_SIDED_RESISTANCE when only resistance/context above price', () => {
    const r1 = makeResistanceZone({ id: 'r1', low: 110, high: 112, mid: 111, tier: 'ACTIONABLE' });

    const result = resolveDescriptiveRangeContext({
      price: 105,
      r1,
      supportZones: [],
      resistanceZones: [r1],
      contextZones: [],
    });

    expect(result.rangeLocation).toBe('ONE_SIDED_RESISTANCE');
    expect(result.source).toBe('ONE_SIDED_RESISTANCE');
    expect(result.confidence).toBe('LOW');
    expect(result.nearestResistance?.id).toBe('r1');
    expect(result.nearestSupport).toBeUndefined();
    expect(result.missingReason).toBe('NO_VALID_SUPPORT_BOUNDARY');
  });

  it('returns ONE_SIDED_SUPPORT when only support/context below price', () => {
    const s1 = makeSupportZone({ id: 's1', low: 98, high: 100, mid: 99, tier: 'ACTIONABLE' });

    const result = resolveDescriptiveRangeContext({
      price: 105,
      s1,
      supportZones: [s1],
      resistanceZones: [],
      contextZones: [],
    });

    expect(result.rangeLocation).toBe('ONE_SIDED_SUPPORT');
    expect(result.source).toBe('ONE_SIDED_SUPPORT');
    expect(result.confidence).toBe('LOW');
    expect(result.nearestSupport?.id).toBe('s1');
    expect(result.nearestResistance).toBeUndefined();
    expect(result.missingReason).toBe('NO_VALID_RESISTANCE_BOUNDARY');
  });

  it('returns UNDEFINED / INSUFFICIENT_STRUCTURE when no zones at all', () => {
    const result = resolveDescriptiveRangeContext({
      price: 105,
      supportZones: [],
      resistanceZones: [],
      contextZones: [],
    });

    expect(result.rangeLocation).toBe('UNDEFINED');
    expect(result.source).toBe('INSUFFICIENT_STRUCTURE');
    expect(result.confidence).toBe('LOW');
    expect(result.missingReason).toBe('NO_VALID_BOUNDARIES');
  });

  it('returns WATCHABLE_PAIR when s1+r1 are both WATCHABLE tier', () => {
    const s1 = makeSupportZone({ id: 's1', low: 98, high: 100, mid: 99, tier: 'WATCHABLE' });
    const r1 = makeResistanceZone({ id: 'r1', low: 110, high: 112, mid: 111, tier: 'WATCHABLE' });

    const result = resolveDescriptiveRangeContext({
      price: 105,
      s1,
      r1,
      supportZones: [s1],
      resistanceZones: [r1],
      contextZones: [],
    });

    expect(result.source).toBe('WATCHABLE_PAIR');
    expect(result.confidence).toBe('HIGH');
    expect(result.nearestSupport?.source).toBe('WATCHABLE');
    expect(result.nearestResistance?.source).toBe('WATCHABLE');
  });

  it('returns MIXED_ACTIONABLE_CONTEXT_PAIR when one side is actionable and the other is context', () => {
    const s1 = makeSupportZone({ id: 's1', low: 98, high: 100, mid: 99, tier: 'ACTIONABLE' });
    const ctxResistance = makeContextZone({
      id: 'ctx-res',
      low: 109,
      high: 113,
      mid: 111,
      roleHint: 'RESISTANCE_CONTEXT',
    });

    const result = resolveDescriptiveRangeContext({
      price: 105,
      s1,
      supportZones: [s1],
      resistanceZones: [],
      contextZones: [ctxResistance],
    });

    expect(result.source).toBe('MIXED_ACTIONABLE_CONTEXT_PAIR');
    expect(result.confidence).toBe('MEDIUM');
    expect(result.nearestSupport?.source).toBe('ACTIONABLE');
    expect(result.nearestResistance?.source).toBe('CONTEXT');
  });

  it('detects COMPRESSED_OR_OVERLAPPING_RANGE when support.high >= resistance.low', () => {
    const s1 = makeSupportZone({ low: 98, high: 111, mid: 104.5, tier: 'ACTIONABLE' });
    const r1 = makeResistanceZone({ low: 110, high: 112, mid: 111, tier: 'ACTIONABLE' });

    const result = resolveDescriptiveRangeContext({
      price: 105,
      s1,
      r1,
      supportZones: [s1],
      resistanceZones: [r1],
      contextZones: [],
    });

    expect(result.rangeLocation).toBe('COMPRESSED_OR_OVERLAPPING_RANGE');
    expect(result.missingReason).toBe('COMPRESSED_OR_OVERLAPPING_RANGE');
  });
});

describe('PermissiveSupportResistanceEngine — descriptiveRangeContext integration', () => {
  it('attaches descriptiveRangeContext to snapshot when structure resolves', () => {
    // Build a candle series with a clear swing high and swing low so the engine
    // can form S1/R1 zones and attach a descriptive context.
    const candles = [
      makeCandle('2026-01-01T00:00:00.000Z', { open: 100, high: 100, low: 95, close: 97 }),
      makeCandle('2026-01-01T01:00:00.000Z', { open: 97, high: 98, low: 90, close: 91 }), // swing low pivot candidate
      makeCandle('2026-01-01T02:00:00.000Z', { open: 91, high: 105, low: 91, close: 103 }),
      makeCandle('2026-01-01T03:00:00.000Z', { open: 103, high: 112, low: 102, close: 111 }), // swing high pivot candidate
      makeCandle('2026-01-01T04:00:00.000Z', { open: 111, high: 112, low: 105, close: 107 }),
      makeCandle('2026-01-01T05:00:00.000Z', { open: 107, high: 108, low: 102, close: 104 }),
    ];

    const engine = new PermissiveSupportResistanceEngine();
    const snapshot = engine.evaluate({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles,
      currentPrice: 104,
      priceSource: 'MARKET_SNAPSHOT',
      timestamp: new Date('2026-01-01T05:30:00.000Z'),
      atr: 5,
      tickSize: 0.01,
      config: makeLenientConfig({ pivotLeftBars: 1, pivotRightBars: 1 }),
    });

    // descriptiveRangeContext must be present when the engine resolves zones
    expect(snapshot.descriptiveRangeContext).toBeDefined();
    expect(snapshot.descriptiveRangeContext?.rangeLocation).toBeDefined();
    expect(snapshot.descriptiveRangeContext?.source).toBeDefined();
    expect(snapshot.descriptiveRangeContext?.confidence).toBeDefined();
  });

  it('descriptiveRangeContext uses only already-available zones (no lookahead)', () => {
    // All zones in nearestSupport/nearestResistance must derive from zones
    // that were visible at snapshot time — not future pivots.
    // The engine's availableFromIndex filter already guarantees this for publicActiveZones;
    // this test verifies that descriptiveRangeContext does not introduce any new
    // candle-based computation and is safe for replay.
    const candles = [
      makeCandle('2026-01-01T00:00:00.000Z', { open: 100, high: 100, low: 95, close: 97 }),
      makeCandle('2026-01-01T01:00:00.000Z', { open: 97, high: 98, low: 90, close: 91 }),
      makeCandle('2026-01-01T02:00:00.000Z', { open: 91, high: 105, low: 91, close: 103 }),
      makeCandle('2026-01-01T03:00:00.000Z', { open: 103, high: 112, low: 102, close: 111 }),
      makeCandle('2026-01-01T04:00:00.000Z', { open: 111, high: 112, low: 105, close: 107 }),
      makeCandle('2026-01-01T05:00:00.000Z', { open: 107, high: 108, low: 102, close: 104 }),
    ];

    const engine = new PermissiveSupportResistanceEngine();
    const snapshot = engine.evaluate({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles,
      currentPrice: 104,
      priceSource: 'MARKET_SNAPSHOT',
      timestamp: new Date('2026-01-01T05:30:00.000Z'),
      atr: 5,
      tickSize: 0.01,
      config: makeLenientConfig({ pivotLeftBars: 1, pivotRightBars: 1 }),
    });

    const ctx = snapshot.descriptiveRangeContext;
    if (ctx === undefined) return; // engine didn't resolve zones — skip

    // Zone IDs in descriptiveRangeContext must exist in the snapshot's zone collections
    const allZoneIds = new Set<string>([
      ...snapshot.supportZones.map(z => z.id),
      ...snapshot.resistanceZones.map(z => z.id),
      ...(snapshot.contextZones ?? []).map(z => z.id),
    ]);

    if (ctx.nearestSupport !== undefined) {
      expect(allZoneIds.has(ctx.nearestSupport.id)).toBe(true);
    }
    if (ctx.nearestResistance !== undefined) {
      expect(allZoneIds.has(ctx.nearestResistance.id)).toBe(true);
    }
  });

  it('s1/r1 behavior unchanged — actionable zones are not altered by descriptive layer', () => {
    const candles = [
      makeCandle('2026-01-01T00:00:00.000Z', { open: 100, high: 100, low: 95, close: 97 }),
      makeCandle('2026-01-01T01:00:00.000Z', { open: 97, high: 98, low: 90, close: 91 }),
      makeCandle('2026-01-01T02:00:00.000Z', { open: 91, high: 105, low: 91, close: 103 }),
      makeCandle('2026-01-01T03:00:00.000Z', { open: 103, high: 112, low: 102, close: 111 }),
      makeCandle('2026-01-01T04:00:00.000Z', { open: 111, high: 112, low: 105, close: 107 }),
      makeCandle('2026-01-01T05:00:00.000Z', { open: 107, high: 108, low: 102, close: 104 }),
    ];

    const engine = new PermissiveSupportResistanceEngine();
    const snapshot = engine.evaluate({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles,
      currentPrice: 104,
      priceSource: 'MARKET_SNAPSHOT',
      timestamp: new Date('2026-01-01T05:30:00.000Z'),
      atr: 5,
      tickSize: 0.01,
      config: makeLenientConfig({ pivotLeftBars: 1, pivotRightBars: 1 }),
    });

    // descriptiveRangeContext must not promote context zones into s1/r1
    if (snapshot.s1 !== undefined) {
      expect(snapshot.s1.tier).not.toBe('CONTEXT');
    }
    if (snapshot.r1 !== undefined) {
      expect(snapshot.r1.tier).not.toBe('CONTEXT');
    }

    // boundedRangeReady must not be influenced by descriptiveRangeContext
    // — it must still reflect only strict s1+r1 pair availability
    const hasBothS1R1 = snapshot.s1 !== undefined && snapshot.r1 !== undefined;
    expect(snapshot.boundedRangeReady).toBe(
      hasBothS1R1 && snapshot.srConflict === undefined,
    );
  });
});
