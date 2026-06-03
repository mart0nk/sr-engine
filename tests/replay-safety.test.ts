import { describe, expect, it } from 'vitest';

import { PermissiveSupportResistanceEngine } from '../src/index.js';
import { assertReplayCursorInvariants, makeCandle, makeLenientConfig, normalizeSnapshotForGolden } from './helpers.js';

import type { Candle } from '../src/index.js';

function makeReplayFixture(): Candle[] {
  return [
    makeCandle('2026-01-01T00:00:00.000Z', { open: 100, high: 101, low: 99, close: 100 }),
    makeCandle('2026-01-01T01:00:00.000Z', { open: 100, high: 105, low: 99, close: 104 }),
    makeCandle('2026-01-01T02:00:00.000Z', { open: 109.8, high: 110, low: 103, close: 109.9 }),
    makeCandle('2026-01-01T03:00:00.000Z', { open: 109, high: 107, low: 103, close: 104 }),
    makeCandle('2026-01-01T04:00:00.000Z', { open: 104, high: 106, low: 102, close: 103 }),
    makeCandle('2026-01-01T05:00:00.000Z', { open: 103, high: 105, low: 101, close: 102 }),
    makeCandle('2026-01-01T06:00:00.000Z', { open: 102, high: 104, low: 100, close: 101 }),
  ];
}

describe('replay safety', () => {
  it('never exposes zones before availableFromIndex and preserves cursor-local state', () => {
    const candles = makeReplayFixture();
    const engine = new PermissiveSupportResistanceEngine();
    const config = makeLenientConfig({
      pivotLeftBars: 2,
      pivotRightBars: 2,
      zoneTierActionableMinScore: 70,
      zoneTierWatchableMinScore: 20,
      zoneTierContextMinScore: 0,
    });

    const snapshots = candles.map((_, cursor) =>
      engine.evaluate({
        symbol: 'BTCUSDT',
        timeframe: '1h',
        candles: candles.slice(0, cursor + 1),
        currentPrice: 102,
        priceSource: 'MARKET_SNAPSHOT',
        timestamp: candles[cursor]!.closeTime ?? candles[cursor]!.openTime,
        config,
      }),
    );

    for (const [cursor, snapshot] of snapshots.entries()) {
      assertReplayCursorInvariants(snapshot, cursor, candles);
    }

    for (let cursor = 0; cursor < 5; cursor++) {
      expect(snapshots[cursor]?.supportZones ?? []).toEqual([]);
      expect(snapshots[cursor]?.resistanceZones ?? []).toEqual([]);
      expect(snapshots[cursor]?.transitionZones ?? []).toEqual([]);
    }

    expect(normalizeSnapshotForGolden(snapshots[4]!)).toMatchObject({
      ready: false,
      structureReady: false,
      actionableStructureReady: false,
      notReadyReason: 'NO_PUBLIC_ACTIVE_ZONES',
    });

    expect(normalizeSnapshotForGolden(snapshots[5]!)).toMatchObject({
      ready: true,
      legacyReady: true,
      engineReady: true,
      structureReady: true,
      actionableStructureReady: true,
      boundedRangeReady: false,
      locationContextUsable: false,
      readinessReasons: {
        engine: [],
        structure: [],
        actionable: [],
        range: ['MISSING_RANGE_BOUNDARY'],
        location: ['MISSING_RANGE_BOUNDARY'],
      },
    });
    expect(normalizeSnapshotForGolden(snapshots[5]!).resistanceZones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'RESISTANCE',
          originIndex: 2,
          confirmedIndex: 4,
          availableFromIndex: 5,
        }),
      ]),
    );
  });
});
