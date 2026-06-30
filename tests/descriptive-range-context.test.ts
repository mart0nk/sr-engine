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
  it('returns ACTIONABLE_PAIR translating engineRangeLocation when s1+r1 present', () => {
    const s1 = makeSupportZone({ id: 's1', low: 98, high: 100, mid: 99, tier: 'ACTIONABLE' });
    const r1 = makeResistanceZone({ id: 'r1', low: 110, high: 112, mid: 111, tier: 'ACTIONABLE' });

    const result = resolveDescriptiveRangeContext({
      price: 105,
      s1,
      r1,
      engineRangeLocation: 'MIDDLE',
      supportZones: [s1],
      resistanceZones: [r1],
      contextZones: [],
    });

    expect(result.source).toBe('ACTIONABLE_PAIR');
    expect(result.confidence).toBe('HIGH');
    expect(result.rangeLocation).toBe('MIDDLE');
    expect(result.nearestSupport?.id).toBe('s1');
    expect(result.nearestSupport?.source).toBe('ACTIONABLE');
    expect(result.nearestResistance?.id).toBe('r1');
    expect(result.nearestResistance?.source).toBe('ACTIONABLE');
    expect(result.missingReason).toBeUndefined();
  });

  it('translates all valid engineRangeLocation values for s1+r1 pair', () => {
    const s1 = makeSupportZone({ low: 98, high: 100, mid: 99, tier: 'ACTIONABLE' });
    const r1 = makeResistanceZone({ low: 110, high: 112, mid: 111, tier: 'ACTIONABLE' });
    const base = { s1, r1, supportZones: [s1], resistanceZones: [r1], contextZones: [], price: 105 };

    expect(resolveDescriptiveRangeContext({ ...base, engineRangeLocation: 'NEAR_SUPPORT' }).rangeLocation).toBe('NEAR_SUPPORT');
    expect(resolveDescriptiveRangeContext({ ...base, engineRangeLocation: 'NEAR_RESISTANCE' }).rangeLocation).toBe('NEAR_RESISTANCE');
    expect(resolveDescriptiveRangeContext({ ...base, engineRangeLocation: 'OUTSIDE_RANGE' }).rangeLocation).toBe('OUTSIDE_RANGE');
    expect(resolveDescriptiveRangeContext({ ...base, engineRangeLocation: 'UNDEFINED' }).rangeLocation).toBe('UNDEFINED');
  });

  it('reflects COMPRESSED_OR_OVERLAPPING_RANGE from engineRangeLocation with missingReason', () => {
    // Engine ran classifyS1R1Conflict with minCleanGap — even a positive-but-tiny gap triggers this.
    // The resolver must not re-derive; it trusts the engine's verdict.
    const s1 = makeSupportZone({ low: 98, high: 99.95, mid: 98.975, tier: 'ACTIONABLE' });
    const r1 = makeResistanceZone({ low: 100.02, high: 101, mid: 100.51, tier: 'ACTIONABLE' });

    const result = resolveDescriptiveRangeContext({
      price: 100,
      s1,
      r1,
      engineRangeLocation: 'COMPRESSED_OR_OVERLAPPING_RANGE',
      supportZones: [s1],
      resistanceZones: [r1],
      contextZones: [],
    });

    expect(result.rangeLocation).toBe('COMPRESSED_OR_OVERLAPPING_RANGE');
    expect(result.missingReason).toBe('COMPRESSED_OR_OVERLAPPING_RANGE');
    expect(result.confidence).toBe('LOW');
    // s1+r1 still present in nearestSupport/nearestResistance for diagnostics
    expect(result.nearestSupport).toBeDefined();
    expect(result.nearestResistance).toBeDefined();
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

  it('returns ONE_SIDED_RESISTANCE when only resistance present', () => {
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

  it('returns ONE_SIDED_SUPPORT when only support present', () => {
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

  it('falls back to transitionZones as CONTEXT source when no other structure available', () => {
    const transitionSupport = makeSupportZone({
      id: 'ts1',
      low: 98,
      high: 100,
      mid: 99,
      lifecycle: 'BROKEN',
      tier: 'ACTIONABLE',
    });
    const transitionResistance = makeResistanceZone({
      id: 'tr1',
      low: 110,
      high: 112,
      mid: 111,
      lifecycle: 'BROKEN',
      tier: 'ACTIONABLE',
    });

    const result = resolveDescriptiveRangeContext({
      price: 105,
      supportZones: [],
      resistanceZones: [],
      contextZones: [],
      transitionZones: [transitionSupport, transitionResistance],
    });

    // Transition zones used as last resort, reported as CONTEXT source
    expect(result.nearestSupport?.id).toBe('ts1');
    expect(result.nearestSupport?.source).toBe('CONTEXT');
    expect(result.nearestResistance?.id).toBe('tr1');
    expect(result.nearestResistance?.source).toBe('CONTEXT');
    expect(result.source).toBe('CONTEXT_PAIR');
  });

  it('rejects structural zones that fail canResolveAsClosest in the fallback path', () => {
    // A BROKEN lifecycle zone would be filtered by canResolveAsClosest — should NOT appear
    // as a structural candidate even if its mid is below price.
    const brokenSupport = makeSupportZone({
      id: 'broken',
      low: 97,
      high: 100,
      mid: 98.5,
      lifecycle: 'BROKEN',
      tier: 'ACTIONABLE',
    });
    // No valid structural or context zones — should fall to INSUFFICIENT_STRUCTURE
    // (no transitionZones either in this test)
    const result = resolveDescriptiveRangeContext({
      price: 105,
      supportZones: [brokenSupport],
      resistanceZones: [],
      contextZones: [],
    });

    // brokenSupport fails canResolveAsClosest (BROKEN lifecycle) → no support candidate
    expect(result.nearestSupport).toBeUndefined();
  });

  it('returns WATCHABLE_PAIR when s1+r1 are both WATCHABLE tier', () => {
    const s1 = makeSupportZone({ id: 's1', low: 98, high: 100, mid: 99, tier: 'WATCHABLE' });
    const r1 = makeResistanceZone({ id: 'r1', low: 110, high: 112, mid: 111, tier: 'WATCHABLE' });

    const result = resolveDescriptiveRangeContext({
      price: 105,
      s1,
      r1,
      engineRangeLocation: 'MIDDLE',
      supportZones: [s1],
      resistanceZones: [r1],
      contextZones: [],
    });

    expect(result.source).toBe('WATCHABLE_PAIR');
    expect(result.confidence).toBe('HIGH');
    expect(result.nearestSupport?.source).toBe('WATCHABLE');
    expect(result.nearestResistance?.source).toBe('WATCHABLE');
  });

  it('returns MIXED_ACTIONABLE_CONTEXT_PAIR when s1 is actionable and resistance is a context zone', () => {
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

  it('detects COMPRESSED_OR_OVERLAPPING_RANGE for context/mixed pair with literal overlap', () => {
    // This path (context pair) does its own overlap check since there is no engine srConflict for context zones
    const ctxSupport = makeContextZone({ id: 'cs', low: 97, high: 111, mid: 104, roleHint: 'SUPPORT_CONTEXT' });
    const ctxResistance = makeContextZone({ id: 'cr', low: 110, high: 114, mid: 112, roleHint: 'RESISTANCE_CONTEXT' });

    const result = resolveDescriptiveRangeContext({
      price: 105,
      supportZones: [],
      resistanceZones: [],
      contextZones: [ctxSupport, ctxResistance],
    });

    expect(result.rangeLocation).toBe('COMPRESSED_OR_OVERLAPPING_RANGE');
    expect(result.missingReason).toBe('COMPRESSED_OR_OVERLAPPING_RANGE');
  });

  it('nearestSupport.kind is typed correctly — ZoneKind for structural, ContextZoneKind for context', () => {
    const s1 = makeSupportZone({ id: 's1', low: 98, high: 100, mid: 99, tier: 'ACTIONABLE', kind: 'LEVEL_ZONE' });
    const ctxResistance = makeContextZone({
      id: 'ctx-res',
      low: 109,
      high: 113,
      mid: 111,
      kind: 'RANGE_BOX',
      roleHint: 'RESISTANCE_CONTEXT',
    });

    const result = resolveDescriptiveRangeContext({
      price: 105,
      s1,
      supportZones: [s1],
      resistanceZones: [],
      contextZones: [ctxResistance],
    });

    expect(result.nearestSupport?.kind).toBe('LEVEL_ZONE');
    expect(result.nearestResistance?.kind).toBe('RANGE_BOX');
  });
});

describe('PermissiveSupportResistanceEngine — descriptiveRangeContext integration', () => {
  it('attaches descriptiveRangeContext to snapshot when structure resolves', () => {
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

    expect(snapshot.descriptiveRangeContext).toBeDefined();
    expect(snapshot.descriptiveRangeContext?.rangeLocation).toBeDefined();
    expect(snapshot.descriptiveRangeContext?.source).toBeDefined();
    expect(snapshot.descriptiveRangeContext?.confidence).toBeDefined();
  });

  it('when s1+r1 both present, descriptiveRangeContext.rangeLocation matches structureState.rangeLocation', () => {
    // The resolver must translate engineRangeLocation directly — no divergence allowed.
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

    if (snapshot.s1 !== undefined && snapshot.r1 !== undefined) {
      const engineLocation = snapshot.structureState.rangeLocation;
      const descriptiveLocation = snapshot.descriptiveRangeContext?.rangeLocation;
      expect(descriptiveLocation).toBe(engineLocation);
    }
  });

  it('descriptiveRangeContext zones are only from already-available snapshot zones (no lookahead)', () => {
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
    if (ctx === undefined) return;

    const allZoneIds = new Set<string>([
      ...snapshot.supportZones.map(z => z.id),
      ...snapshot.resistanceZones.map(z => z.id),
      ...(snapshot.contextZones ?? []).map(z => z.id),
      ...(snapshot.transitionZones ?? []).map(z => z.id),
    ]);

    if (ctx.nearestSupport !== undefined) {
      expect(allZoneIds.has(ctx.nearestSupport.id)).toBe(true);
    }
    if (ctx.nearestResistance !== undefined) {
      expect(allZoneIds.has(ctx.nearestResistance.id)).toBe(true);
    }
  });

  it('s1/r1 actionable flags unchanged — descriptive layer does not raise boundedRangeReady', () => {
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

    if (snapshot.s1 !== undefined) {
      expect(snapshot.s1.tier).not.toBe('CONTEXT');
    }
    if (snapshot.r1 !== undefined) {
      expect(snapshot.r1.tier).not.toBe('CONTEXT');
    }

    const hasBothS1R1 = snapshot.s1 !== undefined && snapshot.r1 !== undefined;
    expect(snapshot.boundedRangeReady).toBe(
      hasBothS1R1 && snapshot.srConflict === undefined,
    );
  });
});
