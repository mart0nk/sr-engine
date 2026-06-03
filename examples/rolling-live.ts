import { createSupportResistanceRollingEngine } from 'sr-engine/rolling';

import type { Candle } from 'sr-engine/types';

const engine = createSupportResistanceRollingEngine({
  symbol: 'BTCUSDT',
  timeframe: '5m',
  strict: true,
  validationOptions: {
    requireAtr: false,
    requireTickSize: false,
  },
});

const candle: Candle = {
  symbol: 'BTCUSDT',
  timeframe: '5m',
  openTime: new Date('2026-01-01T00:00:00.000Z'),
  closeTime: new Date('2026-01-01T00:04:59.999Z'),
  open: 42000,
  high: 42080,
  low: 41980,
  close: 42040,
  volume: 800,
  closed: true,
};

engine.pushClosedCandle(candle);

const snapshot = engine.evaluate({
  currentPrice: 42055,
  priceSource: 'MARKET_SNAPSHOT',
  timestamp: new Date('2026-01-01T00:05:00.000Z'),
});

console.log(snapshot.ready, snapshot.structureAvailability?.level ?? 'NONE');
