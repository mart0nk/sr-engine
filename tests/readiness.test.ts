import { describe, expect, it } from 'vitest';

import { PermissiveSupportResistanceEngine } from '../src/index.js';
import { makeCandle, makeLenientConfig } from './helpers.js';

describe('readiness semantics', () => {
  it('marks insufficient candles as not engine-ready', () => {
    const engine = new PermissiveSupportResistanceEngine();
    const result = engine.evaluate({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: [makeCandle('2026-01-01T00:00:00.000Z')],
      currentPrice: 100,
      priceSource: 'MARKET_SNAPSHOT',
      timestamp: new Date('2026-01-01T00:30:00.000Z'),
      config: makeLenientConfig({ minCandlesForReady: 2 }),
    });

    expect(result.ready).toBe(false);
    expect(result.engineReady).toBe(false);
    expect(result.structureReady).toBe(false);
    expect(result.readinessReasons.engine).toContain('INSUFFICIENT_CANDLES');
  });

  it('marks no-valid-pivots as engine-ready but structure-not-ready', () => {
    const engine = new PermissiveSupportResistanceEngine();
    const candles = [
      makeCandle('2026-01-01T00:00:00.000Z', { open: 100, high: 101, low: 99.5, close: 100.5 }),
      makeCandle('2026-01-01T01:00:00.000Z', { open: 100.5, high: 102, low: 100, close: 101.5 }),
      makeCandle('2026-01-01T02:00:00.000Z', { open: 101.5, high: 103, low: 101, close: 102.5 }),
      makeCandle('2026-01-01T03:00:00.000Z', { open: 102.5, high: 104, low: 102, close: 103.5 }),
      makeCandle('2026-01-01T04:00:00.000Z', { open: 103.5, high: 105, low: 103, close: 104.5 }),
    ];

    const result = engine.evaluate({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles,
      currentPrice: 104.5,
      priceSource: 'MARKET_SNAPSHOT',
      timestamp: new Date('2026-01-01T04:30:00.000Z'),
      config: makeLenientConfig({
        minCandlesForReady: 5,
        pivotLeftBars: 2,
        pivotRightBars: 2,
      }),
    });

    expect(result.notReadyReason).toBe('NO_VALID_PIVOTS');
    expect(result.ready).toBe(false);
    expect(result.engineReady).toBe(true);
    expect(result.structureReady).toBe(false);
    expect(result.actionableStructureReady).toBe(false);
    expect(result.boundedRangeReady).toBe(false);
    expect(result.locationContextUsable).toBe(false);
    expect(result.readinessReasons.structure).toContain('NO_VALID_PIVOTS');
  });
});
