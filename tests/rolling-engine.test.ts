import { describe, expect, it } from 'vitest';

import {
  PermissiveSupportResistanceEngine,
  createSupportResistanceRollingEngine,
} from '../src/index.js';
import { makeCandle, makeLenientConfig, normalizeSnapshotForGolden } from './helpers.js';

import type { Candle } from '../src/index.js';

function makeReplayFixture(): Candle[] {
  return [
    makeCandle('2026-01-01T00:00:00.000Z', { open: 100, high: 101, low: 99, close: 100 }),
    makeCandle('2026-01-01T01:00:00.000Z', { open: 100, high: 105, low: 99, close: 104 }),
    makeCandle('2026-01-01T02:00:00.000Z', { open: 109.8, high: 110, low: 103, close: 109.9 }),
    makeCandle('2026-01-01T03:00:00.000Z', { open: 109, high: 107, low: 103, close: 104 }),
    makeCandle('2026-01-01T04:00:00.000Z', { open: 104, high: 106, low: 102, close: 103 }),
    makeCandle('2026-01-01T05:00:00.000Z', { open: 103, high: 105, low: 101, close: 102 }),
  ];
}

describe('SupportResistanceRollingEngine', () => {
  it('matches stateless evaluation on the same candle prefix', () => {
    const candles = makeReplayFixture();
    const config = makeLenientConfig({
      pivotLeftBars: 2,
      pivotRightBars: 2,
      zoneTierActionableMinScore: 70,
      zoneTierWatchableMinScore: 20,
      zoneTierContextMinScore: 0,
    });
    const stateless = new PermissiveSupportResistanceEngine();
    const rolling = createSupportResistanceRollingEngine({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      config,
    });

    for (const [cursor, candle] of candles.entries()) {
      rolling.pushClosedCandle(candle);

      const rollingSnapshot = rolling.evaluate({
        currentPrice: 102,
        priceSource: 'MARKET_SNAPSHOT',
        timestamp: candle.closeTime ?? candle.openTime,
      });
      const statelessSnapshot = stateless.evaluate({
        symbol: 'BTCUSDT',
        timeframe: '1h',
        candles: candles.slice(0, cursor + 1),
        currentPrice: 102,
        priceSource: 'MARKET_SNAPSHOT',
        timestamp: candle.closeTime ?? candle.openTime,
        config,
      });

      expect(normalizeSnapshotForGolden(rollingSnapshot)).toEqual(
        normalizeSnapshotForGolden(statelessSnapshot),
      );
    }
  });

  it('trims buffered candles to maxCandles', () => {
    const rolling = createSupportResistanceRollingEngine({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      maxCandles: 2,
    });

    rolling.pushClosedCandles([
      makeCandle('2026-01-01T00:00:00.000Z'),
      makeCandle('2026-01-01T01:00:00.000Z'),
      makeCandle('2026-01-01T02:00:00.000Z'),
    ]);

    const buffered = rolling.getCandles();
    expect(buffered).toHaveLength(2);
    expect(buffered[0]?.openTime.toISOString()).toBe('2026-01-01T01:00:00.000Z');
    expect(buffered[1]?.openTime.toISOString()).toBe('2026-01-01T02:00:00.000Z');
  });

  it('rejects open candles in the rolling buffer', () => {
    const rolling = createSupportResistanceRollingEngine({
      symbol: 'BTCUSDT',
      timeframe: '1h',
    });

    expect(() =>
      rolling.pushClosedCandle(
        makeCandle('2026-01-01T00:00:00.000Z', { closed: false }),
      ),
    ).toThrow(/closed candles only/i);
  });
});
