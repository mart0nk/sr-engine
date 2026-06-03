import { toChartOverlays } from 'sr-engine/chart';
import { StrictSupportResistanceEngine } from 'sr-engine';

import type { Candle } from 'sr-engine/types';

const candles: Candle[] = [
  {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    openTime: new Date('2026-01-01T00:00:00.000Z'),
    closeTime: new Date('2026-01-01T00:59:59.999Z'),
    open: 42000,
    high: 42150,
    low: 41950,
    close: 42080,
    volume: 2400,
    closed: true,
  },
];

const engine = new StrictSupportResistanceEngine({
  requireAtr: false,
  requireTickSize: false,
});

const snapshot = engine.evaluate({
  symbol: 'BTCUSDT',
  timeframe: '1h',
  candles,
  currentPrice: 42090,
  priceSource: 'MARKET_SNAPSHOT',
  timestamp: new Date('2026-01-01T01:00:00.000Z'),
});

const overlays = toChartOverlays(snapshot);
console.log(overlays);
