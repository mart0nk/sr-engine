import { describe, expect, it } from 'vitest';

import {
  StrictSupportResistanceEngine,
  validateSupportResistanceInput,
} from '../src/index.js';
import { makeCandle, makeLenientConfig } from './helpers.js';

describe('strict validation', () => {
  it('rejects unsorted candles, duplicates, open candles, invalid OHLC, and non-finite values', () => {
    const candles = [
      makeCandle('2026-01-01T01:00:00.000Z'),
      makeCandle('2026-01-01T00:00:00.000Z', { high: Number.NaN }),
      makeCandle('2026-01-01T00:00:00.000Z', { closed: false }),
      makeCandle('2026-01-01T03:00:00.000Z', { high: 99, low: 100 }),
    ];

    const issues = validateSupportResistanceInput(
      {
        symbol: 'BTCUSDT',
        timeframe: '1h',
        candles,
        currentPrice: Number.POSITIVE_INFINITY,
        priceSource: 'MARKET_SNAPSHOT',
        timestamp: new Date('2026-01-01T03:30:00.000Z'),
      },
      { gapPolicy: 'reject' },
    );

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'UNSORTED_CANDLES',
        'DUPLICATE_CANDLE_TIMESTAMP',
        'OPEN_CANDLE_NOT_ALLOWED',
        'INVALID_OHLC',
        'NON_FINITE_NUMBER',
        'INVALID_CURRENT_PRICE',
        'MISSING_ATR',
        'MISSING_TICK_SIZE',
      ]),
    );
  });

  it('rejects timeframe gaps in reject mode and downgrades them to warnings in warn mode', () => {
    const first = makeCandle('2026-01-01T00:00:00.000Z');
    const gap = makeCandle('2026-01-01T03:00:00.000Z');

    const rejectIssues = validateSupportResistanceInput(
      {
        symbol: 'BTCUSDT',
        timeframe: '1h',
        candles: [first, gap],
        currentPrice: 100,
        priceSource: 'MARKET_SNAPSHOT',
        timestamp: new Date('2026-01-01T03:00:00.000Z'),
        atr: 5,
        tickSize: 0.1,
      },
      { gapPolicy: 'reject' },
    );
    expect(rejectIssues.find((issue) => issue.code === 'TIMEFRAME_GAP')?.severity).toBe(
      'ERROR',
    );

    const warnIssues = validateSupportResistanceInput(
      {
        symbol: 'BTCUSDT',
        timeframe: '1h',
        candles: [first, gap],
        currentPrice: 100,
        priceSource: 'MARKET_SNAPSHOT',
        timestamp: new Date('2026-01-01T03:00:00.000Z'),
        atr: 5,
        tickSize: 0.1,
      },
      { gapPolicy: 'warn' },
    );
    expect(warnIssues.find((issue) => issue.code === 'TIMEFRAME_GAP')?.severity).toBe(
      'WARNING',
    );
  });

  it('allows a latest open candle only when configured and strips it before core evaluation', () => {
    const closed = makeCandle('2026-01-01T00:00:00.000Z');
    const openTail = makeCandle('2026-01-01T01:00:00.000Z', {
      closeTime: new Date('2026-01-01T01:59:59.000Z'),
      closed: false,
    });
    const engine = new StrictSupportResistanceEngine({
      allowLatestOpenCandleAsPriceContext: true,
      requireAtr: false,
      requireTickSize: false,
      gapPolicy: 'allow',
    });

    const withoutOpen = engine.evaluate({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: [closed],
      currentPrice: 100,
      priceSource: 'MARKET_SNAPSHOT',
      timestamp: new Date('2026-01-01T01:00:00.000Z'),
      config: makeLenientConfig(),
    });

    const withOpenTail = engine.evaluate({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: [closed, openTail],
      currentPrice: 100,
      priceSource: 'MARKET_SNAPSHOT',
      timestamp: new Date('2026-01-01T01:00:00.000Z'),
      config: makeLenientConfig(),
    });

    expect(withOpenTail).toEqual(withoutOpen);
  });

  it('strict engine throws on blocking validation issues', () => {
    const engine = new StrictSupportResistanceEngine();

    expect(() =>
      engine.evaluate({
        symbol: 'BTCUSDT',
        timeframe: '1h',
        candles: [
          makeCandle('2026-01-01T00:00:00.000Z', { closed: false }),
          makeCandle('2026-01-01T01:00:00.000Z'),
        ],
        currentPrice: 100,
        priceSource: 'MARKET_SNAPSHOT',
        timestamp: new Date('2026-01-01T01:00:00.000Z'),
      }),
    ).toThrowError(/validation failed/i);
  });
});
