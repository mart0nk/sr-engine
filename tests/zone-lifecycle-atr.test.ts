import { describe, expect, it } from 'vitest';

import { classifyZoneLifecycle, evaluateZoneQuality } from '../src/index.js';
import { makeCandle, makeLenientConfig, makeSupportZone } from './helpers.js';

import type { StructureZone } from '../src/index.js';

function makeResistanceZone(overrides: Partial<StructureZone> = {}): StructureZone {
  return makeSupportZone({
    id: 'zone-resistance-1',
    role: 'RESISTANCE',
    originalRole: 'RESISTANCE',
    origin: 'SWING_HIGH',
    low: 100,
    high: 101.5,
    mid: 100.75,
    ...overrides,
  });
}

describe('zone lifecycle ATR propagation and synthetic truth cases', () => {
  it('uses ATR to gate TESTED promotion and downstream quality for the same touch', () => {
    const zone = makeSupportZone({
      low: 99,
      high: 100.5,
      mid: 99.75,
      availableFromIndex: 0,
    });
    const candles = [
      makeCandle('2026-01-01T00:00:00.000Z', {
        open: 100.8,
        high: 101.4,
        low: 99.4,
        close: 101.2,
      }),
    ];

    const lowAtrLifecycle = classifyZoneLifecycle({
      zone,
      candles,
      startIndex: 0,
      breakBuffer: 0.05,
      reclaimBuffer: 0.05,
      atr: 0.5,
      config: makeLenientConfig({ trueTestMinReactionStrength: 'WEAK' }),
    });
    const highAtrLifecycle = classifyZoneLifecycle({
      zone,
      candles,
      startIndex: 0,
      breakBuffer: 0.05,
      reclaimBuffer: 0.05,
      atr: 10,
      config: makeLenientConfig({ trueTestMinReactionStrength: 'WEAK' }),
    });

    expect(lowAtrLifecycle.lifecycle).toBe('TESTED');
    expect(highAtrLifecycle.lifecycle).toBe('FRESH');
    expect(lowAtrLifecycle.cleanTouchSessions).toBe(1);
    expect(highAtrLifecycle.cleanTouchSessions).toBe(0);
    expect(lowAtrLifecycle.reactionQuality?.reactionStrength).not.toBe(
      highAtrLifecycle.reactionQuality?.reactionStrength,
    );

    const lowAtrQuality = evaluateZoneQuality({
      zone: mergeLifecycleIntoZone(zone, lowAtrLifecycle),
      candles,
      currentPrice: 101.2,
      atr: 0.5,
      config: makeLenientConfig({ trueTestMinReactionStrength: 'WEAK' }),
    });
    const highAtrQuality = evaluateZoneQuality({
      zone: mergeLifecycleIntoZone(zone, highAtrLifecycle),
      candles,
      currentPrice: 101.2,
      atr: 10,
      config: makeLenientConfig({ trueTestMinReactionStrength: 'WEAK' }),
    });

    expect(lowAtrQuality.score).toBeGreaterThan(highAtrQuality.score);
  });

  it('flips broken support into resistance after a rejection from below', () => {
    const result = classifyZoneLifecycle({
      zone: makeSupportZone({
        low: 99,
        high: 100.5,
        mid: 99.75,
      }),
      candles: [
        makeCandle('2026-01-01T00:00:00.000Z', {
          open: 100,
          high: 100.2,
          low: 97.8,
          close: 98.2,
        }),
        makeCandle('2026-01-01T01:00:00.000Z', {
          open: 98.2,
          high: 100.1,
          low: 97.9,
          close: 98.6,
        }),
      ],
      startIndex: 0,
      breakBuffer: 0.05,
      reclaimBuffer: 0.05,
      config: makeLenientConfig(),
    });

    expect(result.lifecycle).toBe('FLIPPED');
    expect(result.role).toBe('RESISTANCE');
    expect(result.flippedAt).toBeDefined();
  });

  it('flips broken resistance into support after a retest from above', () => {
    const result = classifyZoneLifecycle({
      zone: makeResistanceZone(),
      candles: [
        makeCandle('2026-01-01T00:00:00.000Z', {
          open: 100.8,
          high: 102.1,
          low: 100.7,
          close: 101.9,
        }),
        makeCandle('2026-01-01T01:00:00.000Z', {
          open: 101.9,
          high: 101.8,
          low: 100.9,
          close: 101.7,
        }),
      ],
      startIndex: 0,
      breakBuffer: 0.05,
      reclaimBuffer: 0.05,
      config: makeLenientConfig(),
    });

    expect(result.lifecycle).toBe('FLIPPED');
    expect(result.role).toBe('SUPPORT');
    expect(result.flippedAt).toBeDefined();
  });

  it('invalidates a zone after repeated noisy crosses', () => {
    const result = classifyZoneLifecycle({
      zone: makeSupportZone(),
      candles: [
        makeCandle('2026-01-01T00:00:00.000Z', {
          open: 100.2,
          high: 100.3,
          low: 99.3,
          close: 100.1,
        }),
        makeCandle('2026-01-01T01:00:00.000Z', {
          open: 100.1,
          high: 100.4,
          low: 99.4,
          close: 100,
        }),
      ],
      startIndex: 0,
      breakBuffer: 0.05,
      reclaimBuffer: 0.05,
      config: makeLenientConfig({
        maxNoisyCrossesBeforeInvalidation: 2,
      }),
    });

    expect(result.lifecycle).toBe('INVALIDATED');
    expect(result.invalidatedAt).toBeDefined();
  });

  it('waits for a later candle in the touch session before promoting to TESTED', () => {
    const zone = makeSupportZone({
      low: 99,
      high: 100.5,
      mid: 99.75,
      availableFromIndex: 0,
    });
    const candles = [
      makeCandle('2026-01-01T00:00:00.000Z', {
        open: 100.3,
        high: 100.4,
        low: 99.4,
        close: 99.9,
      }),
      makeCandle('2026-01-01T01:00:00.000Z', {
        open: 99.9,
        high: 100.2,
        low: 99.2,
        close: 99.8,
      }),
      makeCandle('2026-01-01T02:00:00.000Z', {
        open: 99.8,
        high: 101.2,
        low: 99.7,
        close: 100.9,
      }),
    ];

    const early = classifyZoneLifecycle({
      zone,
      candles: candles.slice(0, 1),
      startIndex: 0,
      breakBuffer: 0.05,
      reclaimBuffer: 0.05,
      atr: 0.5,
      config: makeLenientConfig({ trueTestMinReactionStrength: 'WEAK' }),
    });
    const full = classifyZoneLifecycle({
      zone,
      candles,
      startIndex: 0,
      breakBuffer: 0.05,
      reclaimBuffer: 0.05,
      atr: 0.5,
      config: makeLenientConfig({ trueTestMinReactionStrength: 'WEAK' }),
    });

    expect(early.lifecycle).toBe('FRESH');
    expect(early.cleanTouchSessions).toBe(0);
    expect(full.lifecycle).toBe('TESTED');
    expect(full.cleanTouchSessions).toBe(1);
    expect(full.reactionQuality?.closedAwayFromZone).toBe(true);
  });
});

function mergeLifecycleIntoZone(
  zone: StructureZone,
  lifecycle: ReturnType<typeof classifyZoneLifecycle>,
): StructureZone {
  return {
    ...zone,
    lifecycle: lifecycle.lifecycle,
    touchCount: lifecycle.touchCount,
    rejectionCount: lifecycle.rejectionCount,
    cleanTouchSessions: lifecycle.cleanTouchSessions,
    noisyTouchSessions: lifecycle.noisyTouchSessions,
    passThroughCount: lifecycle.passThroughCount,
    ...(lifecycle.reactionQuality !== undefined
      ? { reactionQuality: lifecycle.reactionQuality }
      : {}),
    ...(lifecycle.lastRespectedIndex !== undefined
      ? { lastRespectedIndex: lifecycle.lastRespectedIndex }
      : {}),
  };
}
