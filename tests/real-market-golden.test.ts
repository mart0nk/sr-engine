import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SUPPORT_RESISTANCE_CONFIG,
  SupportResistanceEngine,
} from '../src/index.js';
import { REAL_MARKET_FIXTURES } from './fixtures/real-market-fixtures.js';
import { REAL_MARKET_GOLDENS } from './golden/real-market.golden.js';
import { assertReplayCursorInvariants, normalizeSnapshotForGolden } from './helpers.js';

describe('real-market golden regression', () => {
  const engine = new SupportResistanceEngine();

  for (const fixture of REAL_MARKET_FIXTURES) {
    it(`matches normalized golden checkpoints for ${fixture.id}`, () => {
      const config = {
        ...DEFAULT_SUPPORT_RESISTANCE_CONFIG,
        pivotLeftBars: 2,
        pivotRightBars: 2,
        minCandlesForReady: Math.min(8, fixture.candles.length),
        zoneTierActionableMinScore: 70,
        zoneTierWatchableMinScore: 20,
        zoneTierContextMinScore: 0,
      };

      const goldenKey = fixture.id as keyof typeof REAL_MARKET_GOLDENS;
      const checkpoints = REAL_MARKET_GOLDENS[goldenKey];
      expect(checkpoints).toBeDefined();

      for (const checkpoint of checkpoints) {
        const candles = fixture.candles.slice(0, checkpoint.cursor + 1);
        const last = candles.at(-1);
        if (!last) {
          throw new Error(`Fixture ${fixture.id} has no candle at cursor ${checkpoint.cursor}`);
        }

        const snapshot = engine.evaluate({
          symbol: fixture.symbol,
          timeframe: fixture.timeframe,
          candles,
          currentPrice: last.close,
          priceSource: 'LAST_CLOSED_CANDLE',
          timestamp: last.closeTime ?? last.openTime,
          config,
        });

        assertReplayCursorInvariants(snapshot, checkpoint.cursor, candles);
        expect(normalizeSnapshotForGolden(snapshot)).toEqual(checkpoint.comparable);
      }
    });
  }
});
