import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SUPPORT_RESISTANCE_CONFIG } from '../src/index.js';
import type { Candle, SupportResistanceZone } from '../src/index.js';

const {
  detectPivotsMock,
  buildZoneCandidatesMock,
  clusterZonesMock,
  classifyZoneLifecycleMock,
  evaluateZoneQualityMock,
  enrichZoneFormationMock,
  markZoneKindMock,
} = vi.hoisted(() => ({
  detectPivotsMock: vi.fn(),
  buildZoneCandidatesMock: vi.fn(),
  clusterZonesMock: vi.fn(),
  classifyZoneLifecycleMock: vi.fn(),
  evaluateZoneQualityMock: vi.fn(),
  enrichZoneFormationMock: vi.fn(),
  markZoneKindMock: vi.fn(),
}));

vi.mock('../src/pivot-detector.js', () => ({
  detectPivots: detectPivotsMock,
}));

vi.mock('../src/zone-builder.js', () => ({
  buildZoneCandidates: buildZoneCandidatesMock,
}));

vi.mock('../src/zone-clustering.js', () => ({
  clusterZones: clusterZonesMock,
}));

vi.mock('../src/zone-state-engine.js', async () => {
  const actual = await vi.importActual<typeof import('../src/zone-state-engine.js')>(
    '../src/zone-state-engine.js'
  );
  return {
    ...actual,
    classifyZoneLifecycle: classifyZoneLifecycleMock,
  };
});

vi.mock('../src/zone-quality.js', () => ({
  evaluateZoneQuality: evaluateZoneQualityMock,
}));

vi.mock('../src/zone-formation.js', async () => {
  const actual = await vi.importActual<typeof import('../src/zone-formation.js')>(
    '../src/zone-formation.js'
  );
  return {
    ...actual,
    enrichZoneFormation: enrichZoneFormationMock,
  };
});

vi.mock('../src/zone-kind.js', async () => {
  const actual = await vi.importActual<typeof import('../src/zone-kind.js')>(
    '../src/zone-kind.js'
  );
  return {
    ...actual,
    markZoneKind: markZoneKindMock,
  };
});

import { SupportResistanceEngine } from '../src/index.js';

function makeCandle(): Candle {
  return {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    openTime: new Date('2026-05-20T00:00:00.000Z'),
    closeTime: new Date('2026-05-20T00:59:59.000Z'),
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 10,
    closed: true,
  };
}

function makeZone(): SupportResistanceZone {
  const timestamp = new Date('2026-05-20T00:00:00.000Z');
  return {
    id: 'zone-1',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    role: 'SUPPORT',
    originalRole: 'SUPPORT',
    lifecycle: 'FRESH',
    origin: 'SWING_LOW',
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
  };
}

describe('SupportResistanceEngine transition-only snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    detectPivotsMock.mockReturnValue([{ type: 'SWING_LOW' }]);
    buildZoneCandidatesMock.mockReturnValue([makeZone()]);
    clusterZonesMock.mockImplementation(({ zones }) => zones);
    classifyZoneLifecycleMock.mockReturnValue({
      role: 'SUPPORT',
      lifecycle: 'BROKEN',
      touchCount: 0,
      rejectionCount: 0,
      breakCount: 1,
      noisyCrossCount: 0,
      cleanTouchSessions: 0,
      noisyTouchSessions: 0,
      passThroughCount: 0,
      evidence: [],
      warnings: [],
      touchAccounting: {
        touchSessions: 0,
        mitigationSessions: 0,
        trueTestSessions: 0,
        cleanTouchSessions: 0,
        noisyTouchSessions: 0,
        passThroughCount: 0,
      },
    });
    evaluateZoneQualityMock.mockReturnValue({
      quality: 'MEDIUM',
      score: 8,
      reasons: [],
      warnings: [],
      structuredEvidence: {
        majorSwingExtreme: true,
        touchSessions: 0,
        cleanTouchSessions: 0,
        noisyTouchSessions: 0,
        passThroughCount: 0,
        roleReversalConfirmed: false,
        recentlyRespected: false,
        obviousness: 'MEDIUM',
        tooWide: false,
        tooNarrowExpanded: false,
        hasNoisyTouches: false,
        hasNoisyCrosses: false,
        hasPassThrough: false,
        noisy: false,
        notes: [],
      },
    });
    enrichZoneFormationMock.mockImplementation(({ zone }) => zone);
    markZoneKindMock.mockImplementation((zone: SupportResistanceZone) => ({
      ...zone,
      kind: 'LEVEL_ZONE',
      usableAsS1R1: true,
      usableAsCleanStop: true,
      usableAs2RBlocker: true,
    }));
  });

  it('returns NO_PUBLIC_ACTIVE_ZONES while preserving transition zones', () => {
    const engine = new SupportResistanceEngine();

    const result = engine.evaluate({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: [makeCandle()],
      currentPrice: 100,
      priceSource: 'MARKET_SNAPSHOT',
      timestamp: new Date('2026-05-20T01:00:00.000Z'),
      config: {
        ...DEFAULT_SUPPORT_RESISTANCE_CONFIG,
        minCandlesForReady: 1,
      },
    });

    expect(result.ready).toBe(false);
    expect(result.notReadyReason).toBe('NO_PUBLIC_ACTIVE_ZONES');
    expect(result.legacyReady).toBe(false);
    expect(result.engineReady).toBe(true);
    expect(result.structureReady).toBe(true);
    expect(result.actionableStructureReady).toBe(false);
    expect(result.boundedRangeReady).toBe(false);
    expect(result.locationContextUsable).toBe(false);
    expect(result.readinessReasons.actionable).toContain('NO_PUBLIC_ACTIVE_ZONES');
    expect(result.supportZones).toEqual([]);
    expect(result.resistanceZones).toEqual([]);
    expect(result.transitionZones).toHaveLength(1);
    expect(result.brokenZonesWaitingForRetest).toHaveLength(1);
    expect(result.structureAvailability).toEqual({
      level: 'CONTEXT_ONLY',
      limitingFactor: 'ZONE_QUALITY',
    });
    expect(result.missing).toContain('ACTIVE_SUPPORT_OR_RESISTANCE');
    expect(result.warnings).toContain('NO_VALID_STRUCTURE');
  });
});
