import { describe, expect, it } from 'vitest';

import {
  SupportResistanceEngine,
  StrictSupportResistanceEngine,
  PermissiveSupportResistanceEngine,
  createSupportResistanceRollingEngine,
  toChartOverlays,
  toScannerFacts,
} from '../src/index.js';
import { resolveSupportResistanceConfig } from '../src/config.js';

describe('public package surface', () => {
  it('keeps strict engine aliasing and integration exports available', () => {
    expect(StrictSupportResistanceEngine).toBe(SupportResistanceEngine);
    expect(PermissiveSupportResistanceEngine).toBeTypeOf('function');
    expect(createSupportResistanceRollingEngine).toBeTypeOf('function');
    expect(toChartOverlays).toBeTypeOf('function');
    expect(toScannerFacts).toBeTypeOf('function');
    expect(resolveSupportResistanceConfig).toBeTypeOf('function');
  });

  it('defaults the rolling wrapper to strict mode', () => {
    const engine = createSupportResistanceRollingEngine({
      symbol: 'BTCUSDT',
      timeframe: '1h',
    });

    expect(() =>
      engine.evaluate({
        currentPrice: 100,
        priceSource: 'MARKET_SNAPSHOT',
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).toThrow(/validation failed/i);
  });
});
