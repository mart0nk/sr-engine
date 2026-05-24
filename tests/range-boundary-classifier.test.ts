import { describe, expect, it } from 'vitest';
import type { SupportResistanceZone } from '../src/index.js';
import { classifyRangeBoundary } from '../src/index.js';

function makeZone(overrides: Partial<SupportResistanceZone> = {}): SupportResistanceZone {
  const timestamp = new Date('2026-05-20T00:00:00.000Z');
  return {
    id: 'zone-test',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    role: 'RESISTANCE',
    originalRole: 'RESISTANCE',
    lifecycle: 'FRESH',
    origin: 'SWING_HIGH',
    originIndex: 0,
    confirmedIndex: 0,
    availableFromIndex: 0,
    originAt: timestamp,
    low: 99,
    high: 101,
    mid: 100,
    createdAt: timestamp,
    touchCount: 0,
    rejectionCount: 0,
    breakCount: 0,
    noisyCrossCount: 0,
    quality: 'MEDIUM',
    score: 8,
    widthPct: 0.2,
    evidence: [],
    warnings: [],
    ...overrides,
  };
}

describe('classifyRangeBoundary', () => {
  it('classifies SWING_HIGH with touchCount=3, causedBos=false, passThrough=0 as RANGE_HIGH HIGH confidence', () => {
    const zone = makeZone({
      origin: 'SWING_HIGH',
      touchCount: 3,
      originEvidence: {
        causedBos: false,
        removedOpposingZone: false,
        displacementAtr: 0,
        displacementPct: 0,
        impulseVolumeConfirmed: false,
        significantOrigin: false,
        originAgeCandles: 0,
        notes: [],
      },
      touchAccounting: {
        touchSessions: 3,
        mitigationSessions: 0,
        trueTestSessions: 0,
        cleanTouchSessions: 0,
        noisyTouchSessions: 0,
        passThroughCount: 0,
      },
    });

    const result = classifyRangeBoundary(zone);

    expect(result.role).toBe('RANGE_HIGH');
    expect(result.confidence).toBe('HIGH');
    expect(result.touchCount).toBe(3);
    expect(result.causedBos).toBe(false);
    expect(result.passThroughCount).toBe(0);
  });

  it('classifies SWING_HIGH with touchCount=2, causedBos=false, passThrough=0 as RANGE_HIGH MEDIUM confidence', () => {
    const zone = makeZone({
      origin: 'SWING_HIGH',
      touchCount: 2,
      originEvidence: {
        causedBos: false,
        removedOpposingZone: false,
        displacementAtr: 0,
        displacementPct: 0,
        impulseVolumeConfirmed: false,
        significantOrigin: false,
        originAgeCandles: 0,
        notes: [],
      },
      touchAccounting: {
        touchSessions: 2,
        mitigationSessions: 0,
        trueTestSessions: 0,
        cleanTouchSessions: 0,
        noisyTouchSessions: 0,
        passThroughCount: 0,
      },
    });

    const result = classifyRangeBoundary(zone);

    expect(result.role).toBe('RANGE_HIGH');
    expect(result.confidence).toBe('MEDIUM');
    expect(result.touchCount).toBe(2);
    expect(result.causedBos).toBe(false);
    expect(result.passThroughCount).toBe(0);
  });

  it('classifies SWING_LOW with touchCount=3, causedBos=false, passThrough=1 as RANGE_LOW HIGH confidence', () => {
    const zone = makeZone({
      origin: 'SWING_LOW',
      role: 'SUPPORT',
      originalRole: 'SUPPORT',
      touchCount: 3,
      originEvidence: {
        causedBos: false,
        removedOpposingZone: false,
        displacementAtr: 0,
        displacementPct: 0,
        impulseVolumeConfirmed: false,
        significantOrigin: false,
        originAgeCandles: 0,
        notes: [],
      },
      touchAccounting: {
        touchSessions: 3,
        mitigationSessions: 0,
        trueTestSessions: 0,
        cleanTouchSessions: 0,
        noisyTouchSessions: 0,
        passThroughCount: 1,
      },
    });

    const result = classifyRangeBoundary(zone);

    expect(result.role).toBe('RANGE_LOW');
    expect(result.confidence).toBe('HIGH');
    expect(result.touchCount).toBe(3);
    expect(result.causedBos).toBe(false);
    expect(result.passThroughCount).toBe(1);
  });

  it('classifies SWING_HIGH with causedBos=true as NOT_RANGE_BOUNDARY', () => {
    const zone = makeZone({
      origin: 'SWING_HIGH',
      touchCount: 4,
      originEvidence: {
        causedBos: true,
        bosDirection: 'BEARISH',
        removedOpposingZone: false,
        displacementAtr: 1,
        displacementPct: 0.5,
        impulseVolumeConfirmed: true,
        significantOrigin: true,
        originAgeCandles: 5,
        notes: [],
      },
      touchAccounting: {
        touchSessions: 4,
        mitigationSessions: 0,
        trueTestSessions: 0,
        cleanTouchSessions: 0,
        noisyTouchSessions: 0,
        passThroughCount: 0,
      },
    });

    const result = classifyRangeBoundary(zone);

    expect(result.role).toBe('NOT_RANGE_BOUNDARY');
  });

  it('classifies SWING_HIGH with touchCount=1 as NOT_RANGE_BOUNDARY', () => {
    const zone = makeZone({
      origin: 'SWING_HIGH',
      touchCount: 1,
      touchAccounting: {
        touchSessions: 1,
        mitigationSessions: 0,
        trueTestSessions: 0,
        cleanTouchSessions: 0,
        noisyTouchSessions: 0,
        passThroughCount: 0,
      },
    });

    const result = classifyRangeBoundary(zone);

    expect(result.role).toBe('NOT_RANGE_BOUNDARY');
  });

  it('classifies SWING_HIGH with passThrough=2 as NOT_RANGE_BOUNDARY', () => {
    const zone = makeZone({
      origin: 'SWING_HIGH',
      touchCount: 4,
      originEvidence: {
        causedBos: false,
        removedOpposingZone: false,
        displacementAtr: 0,
        displacementPct: 0,
        impulseVolumeConfirmed: false,
        significantOrigin: false,
        originAgeCandles: 0,
        notes: [],
      },
      touchAccounting: {
        touchSessions: 4,
        mitigationSessions: 0,
        trueTestSessions: 0,
        cleanTouchSessions: 0,
        noisyTouchSessions: 0,
        passThroughCount: 2,
      },
    });

    const result = classifyRangeBoundary(zone);

    expect(result.role).toBe('NOT_RANGE_BOUNDARY');
  });

  it('does not mutate zone.origin — it stays SWING_HIGH after classification', () => {
    const zone = makeZone({
      origin: 'SWING_HIGH',
      touchCount: 4,
      originEvidence: {
        causedBos: false,
        removedOpposingZone: false,
        displacementAtr: 0,
        displacementPct: 0,
        impulseVolumeConfirmed: false,
        significantOrigin: false,
        originAgeCandles: 0,
        notes: [],
      },
      touchAccounting: {
        touchSessions: 4,
        mitigationSessions: 0,
        trueTestSessions: 0,
        cleanTouchSessions: 0,
        noisyTouchSessions: 0,
        passThroughCount: 0,
      },
    });

    classifyRangeBoundary(zone);

    expect(zone.origin).toBe('SWING_HIGH');
  });
});
