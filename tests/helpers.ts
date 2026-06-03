import { DEFAULT_SUPPORT_RESISTANCE_CONFIG } from '../src/index.js';

import type {
  Candle,
  SupportResistanceConfig,
  SupportResistanceSnapshot,
  SupportResistanceZone,
} from '../src/index.js';

export function makeCandle(
  timestamp: string,
  overrides: Partial<Candle> = {},
): Candle {
  const openTime = new Date(timestamp);
  const closeTime = new Date(openTime.getTime() + timeframeToMs(overrides.timeframe ?? '1h') - 1);

  return {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    openTime,
    closeTime,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 10,
    closed: true,
    ...overrides,
  };
}

export function makeSupportZone(overrides: Partial<SupportResistanceZone> = {}): SupportResistanceZone {
  const timestamp = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'zone-support-1',
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
    high: 100.5,
    mid: 99.75,
    createdAt: timestamp,
    touchCount: 0,
    rejectionCount: 0,
    breakCount: 0,
    noisyCrossCount: 0,
    quality: 'LOW',
    score: 0,
    widthPct: 1,
    evidence: [],
    warnings: [],
    ...overrides,
  };
}

export function makeSnapshot(
  overrides: Partial<SupportResistanceSnapshot> = {},
): SupportResistanceSnapshot {
  const timestamp = new Date('2026-01-01T00:00:00.000Z');

  return {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    timestamp,
    price: 100,
    priceSource: 'MARKET_SNAPSHOT',
    supportZones: [],
    resistanceZones: [],
    structureState: {
      aboveSupport: false,
      belowResistance: false,
      insideZone: false,
    },
    ready: false,
    legacyReady: false,
    engineReady: false,
    structureReady: false,
    actionableStructureReady: false,
    boundedRangeReady: false,
    locationContextUsable: false,
    readinessReasons: {
      engine: [],
      structure: [],
      actionable: [],
      range: [],
      location: [],
    },
    missing: [],
    warnings: [],
    evidence: [],
    ...overrides,
  };
}

export function makeLenientConfig(
  overrides: Partial<SupportResistanceConfig> = {},
): SupportResistanceConfig {
  return {
    ...DEFAULT_SUPPORT_RESISTANCE_CONFIG,
    minCandlesForReady: 1,
    zoneTierActionableMinScore: 70,
    zoneTierWatchableMinScore: 25,
    zoneTierContextMinScore: 0,
    ...overrides,
  };
}

export function normalizeSnapshotForGolden(snapshot: SupportResistanceSnapshot) {
  return {
    ready: snapshot.ready,
    legacyReady: snapshot.legacyReady,
    engineReady: snapshot.engineReady,
    structureReady: snapshot.structureReady,
    actionableStructureReady: snapshot.actionableStructureReady,
    boundedRangeReady: snapshot.boundedRangeReady,
    locationContextUsable: snapshot.locationContextUsable,
    readinessReasons: normalizeReadinessReasons(snapshot.readinessReasons),
    notReadyReason: snapshot.notReadyReason ?? null,
    structureAvailability: snapshot.structureAvailability ?? null,
    supportZones: snapshot.supportZones.map(normalizeZoneForGolden),
    resistanceZones: snapshot.resistanceZones.map(normalizeZoneForGolden),
    transitionZones: (snapshot.transitionZones ?? []).map(normalizeZoneForGolden),
    s1: normalizeOptionalZone(snapshot.s1),
    s2: normalizeOptionalZone(snapshot.s2),
    r1: normalizeOptionalZone(snapshot.r1),
    r2: normalizeOptionalZone(snapshot.r2),
    warnings: [...snapshot.warnings].sort(),
  };
}

export function assertReplayCursorInvariants(
  snapshot: SupportResistanceSnapshot,
  cursor: number,
  candles: readonly Candle[],
): void {
  const cursorTimestamp = candles[cursor]?.openTime.getTime();
  const zones = dedupeZones([
    ...snapshot.supportZones,
    ...snapshot.resistanceZones,
    ...(snapshot.contextZones ?? []),
    ...(snapshot.transitionZones ?? []),
    ...(snapshot.brokenZonesWaitingForRetest ?? []),
    ...(snapshot.closestSupport ? [snapshot.closestSupport] : []),
    ...(snapshot.closestResistance ? [snapshot.closestResistance] : []),
    ...(snapshot.s1 ? [snapshot.s1] : []),
    ...(snapshot.s2 ? [snapshot.s2] : []),
    ...(snapshot.r1 ? [snapshot.r1] : []),
    ...(snapshot.r2 ? [snapshot.r2] : []),
    ...(snapshot.conflictResolvedZones ?? []).map((resolved) => resolved.zone),
  ]);

  for (const zone of zones) {
    if ('originIndex' in zone) {
      assertIndexAtOrBeforeCursor(zone.originIndex, cursor, zone.id, 'originIndex');
      assertIndexAtOrBeforeCursor(zone.confirmedIndex, cursor, zone.id, 'confirmedIndex');
      assertIndexAtOrBeforeCursor(zone.availableFromIndex, cursor, zone.id, 'availableFromIndex');
      assertOptionalIndexAtOrBeforeCursor(zone.lastRespectedIndex, cursor, zone.id, 'lastRespectedIndex');
      assertOptionalIndexAtOrBeforeCursor(
        zone.touchAccounting?.lastMitigatedIndex,
        cursor,
        zone.id,
        'touchAccounting.lastMitigatedIndex',
      );
      assertOptionalIndexAtOrBeforeCursor(
        zone.touchAccounting?.lastTrueTestIndex,
        cursor,
        zone.id,
        'touchAccounting.lastTrueTestIndex',
      );
      assertOptionalIndexAtOrBeforeCursor(
        zone.structuredEvidence?.lastRespectedIndex,
        cursor,
        zone.id,
        'structuredEvidence.lastRespectedIndex',
      );

      if (cursorTimestamp !== undefined) {
        for (const [field, date] of [
          ['originAt', zone.originAt],
          ['createdAt', zone.createdAt],
          ['lastTouchedAt', zone.lastTouchedAt],
          ['lastRespectedAt', zone.lastRespectedAt],
          ['brokenAt', zone.brokenAt],
          ['flippedAt', zone.flippedAt],
          ['invalidatedAt', zone.invalidatedAt],
          ['touchAccounting.lastMitigatedAt', zone.touchAccounting?.lastMitigatedAt],
          ['touchAccounting.lastTrueTestAt', zone.touchAccounting?.lastTrueTestAt],
          ['structuredEvidence.lastRespectedAt', zone.structuredEvidence?.lastRespectedAt],
        ] as const) {
          assertOptionalTimeAtOrBeforeCursor(date, cursorTimestamp, zone.id, field);
        }

        for (const component of zone.clusterComponents ?? []) {
          assertOptionalTimeAtOrBeforeCursor(
            component.originAt,
            cursorTimestamp,
            zone.id,
            'clusterComponents.originAt',
          );
        }

        const detectedPivot = zone.formationTrace?.detectedPivot;
        if (detectedPivot !== undefined) {
          assertIndexAtOrBeforeCursor(
            detectedPivot.originIndex,
            cursor,
            zone.id,
            'formationTrace.detectedPivot.originIndex',
          );
          assertOptionalTimeAtOrBeforeCursor(
            detectedPivot.originAt,
            cursorTimestamp,
            zone.id,
            'formationTrace.detectedPivot.originAt',
          );
        }

        for (const event of zone.formationTrace?.lifecycleEvents ?? []) {
          assertOptionalTimeAtOrBeforeCursor(
            event.at,
            cursorTimestamp,
            zone.id,
            'formationTrace.lifecycleEvents.at',
          );
        }
      }
    }
  }
}

export function timeframeToMs(timeframe: Candle['timeframe']): number {
  switch (timeframe) {
    case '1m':
      return 60_000;
    case '5m':
      return 300_000;
    case '15m':
      return 900_000;
    case '1h':
      return 3_600_000;
    case '4h':
      return 14_400_000;
    case '1d':
      return 86_400_000;
  }
}

function normalizeOptionalZone(zone: SupportResistanceZone | undefined) {
  return zone === undefined ? null : normalizeZoneForGolden(zone);
}

function normalizeZoneForGolden(zone: SupportResistanceZone) {
  return {
    id: zone.id,
    role: zone.role,
    originalRole: zone.originalRole,
    lifecycle: zone.lifecycle,
    tier: zone.tier ?? null,
    quality: zone.quality,
    low: round(zone.low),
    high: round(zone.high),
    mid: round(zone.mid),
    score: round(zone.score),
    originIndex: zone.originIndex,
    confirmedIndex: zone.confirmedIndex,
    availableFromIndex: zone.availableFromIndex,
    touchCount: zone.touchCount,
    cleanTouchSessions: zone.cleanTouchSessions ?? 0,
    noisyTouchSessions: zone.noisyTouchSessions ?? 0,
    passThroughCount: zone.passThroughCount ?? 0,
    breakCount: zone.breakCount,
    noisyCrossCount: zone.noisyCrossCount,
    lastRespectedIndex: zone.lastRespectedIndex ?? null,
    brokenAt: zone.brokenAt?.toISOString() ?? null,
    flippedAt: zone.flippedAt?.toISOString() ?? null,
    invalidatedAt: zone.invalidatedAt?.toISOString() ?? null,
  };
}

function normalizeReadinessReasons(snapshot: SupportResistanceSnapshot['readinessReasons']) {
  return {
    engine: [...snapshot.engine].sort(),
    structure: [...snapshot.structure].sort(),
    actionable: [...snapshot.actionable].sort(),
    range: [...snapshot.range].sort(),
    location: [...snapshot.location].sort(),
  };
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function dedupeZones<T extends { id: string }>(zones: T[]): T[] {
  const byId = new Map<string, T>();
  for (const zone of zones) {
    byId.set(zone.id, zone);
  }
  return [...byId.values()];
}

function assertIndexAtOrBeforeCursor(
  value: number,
  cursor: number,
  zoneId: string,
  field: string,
): void {
  if (value > cursor) {
    throw new Error(`Zone ${zoneId} leaked future ${field} ${value} at cursor ${cursor}`);
  }
}

function assertOptionalIndexAtOrBeforeCursor(
  value: number | undefined,
  cursor: number,
  zoneId: string,
  field: string,
): void {
  if (value !== undefined) {
    assertIndexAtOrBeforeCursor(value, cursor, zoneId, field);
  }
}

function assertOptionalTimeAtOrBeforeCursor(
  value: Date | undefined,
  cursorTimestamp: number,
  zoneId: string,
  field: string,
): void {
  if (value !== undefined && value.getTime() > cursorTimestamp) {
    throw new Error(`Zone ${zoneId} leaked future ${field} ${value.toISOString()} beyond cursor timestamp`);
  }
}
