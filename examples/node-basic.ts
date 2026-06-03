import { SupportResistanceEngine, resolveSupportResistanceConfig } from 'sr-engine';

import type { Candle } from 'sr-engine/types';

const candles: Candle[] = [
  {
    symbol: 'BTCUSDT',
    timeframe: '15m',
    openTime: new Date('2026-01-01T00:00:00.000Z'),
    closeTime: new Date('2026-01-01T00:14:59.999Z'),
    open: 42000,
    high: 42120,
    low: 41880,
    close: 42050,
    volume: 1200,
    closed: true,
  },
];

const engine = new SupportResistanceEngine({
  requireAtr: false,
  requireTickSize: false,
});

const snapshot = engine.evaluate({
  symbol: 'BTCUSDT',
  timeframe: '15m',
  candles,
  currentPrice: 42080,
  priceSource: 'MARKET_SNAPSHOT',
  timestamp: new Date('2026-01-01T00:15:00.000Z'),
  config: resolveSupportResistanceConfig({
    minCandlesForReady: 1,
  }),
});

console.log(snapshot.structureAvailability?.level ?? 'NONE');
