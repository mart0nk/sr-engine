import { describe, expect, it } from 'vitest';

import { toChartOverlays, toScannerFacts } from '../src/index.js';
import { makeSnapshot, makeSupportZone } from './helpers.js';

describe('integration adapters', () => {
  it('projects zones into chart overlays', () => {
    const support = makeSupportZone({
      id: 'support-1',
      role: 'SUPPORT',
      originalRole: 'SUPPORT',
      lifecycle: 'TESTED',
      tier: 'ACTIONABLE',
    });
    const resistance = makeSupportZone({
      id: 'resistance-1',
      role: 'RESISTANCE',
      originalRole: 'RESISTANCE',
      lifecycle: 'FRESH',
      tier: 'WATCHABLE',
      low: 109,
      high: 110,
      mid: 109.5,
    });
    const transition = makeSupportZone({
      id: 'broken-1',
      role: 'SUPPORT',
      originalRole: 'SUPPORT',
      lifecycle: 'BROKEN',
      tier: 'CONTEXT',
    });

    const snapshot = makeSnapshot({
      ready: true,
      legacyReady: true,
      engineReady: true,
      structureReady: true,
      actionableStructureReady: true,
      locationContextUsable: true,
      supportZones: [support],
      resistanceZones: [resistance],
      transitionZones: [transition],
      contextZones: [
        {
          id: 'context-1',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          kind: 'RANGE_BOX',
          low: 100,
          high: 110,
          mid: 105,
          widthPct: 10,
          lifecycle: 'TESTED',
          quality: 'MEDIUM',
          score: 55,
          sourceZoneId: 'support-1',
          actionable: false,
          usableAsS1R1: false,
          usableAsCleanStop: false,
          usableAs2RBlocker: false,
          warnings: ['RANGE_BOX_NOT_ACTIONABLE_SR'],
          evidence: ['Context only'],
        },
      ],
    });

    const overlays = toChartOverlays(snapshot);
    expect(overlays.map((overlay) => overlay.kind)).toEqual([
      'SUPPORT_ZONE',
      'RESISTANCE_ZONE',
      'CONTEXT_ZONE',
      'TRANSITION_ZONE',
    ]);
    expect(overlays[0]).toMatchObject({
      id: 'support-1',
      label: 'SUPPORT TESTED ACTIONABLE',
      state: 'ACTIONABLE',
    });
    expect(overlays[2]).toMatchObject({
      id: 'context-1',
      sourceZoneId: 'support-1',
      state: 'CONTEXT',
    });
  });

  it('projects scanner facts from readiness and location context', () => {
    const snapshot = makeSnapshot({
      ready: false,
      notReadyReason: 'NO_PUBLIC_ACTIVE_ZONES',
      engineReady: true,
      structureReady: true,
      actionableStructureReady: false,
      boundedRangeReady: false,
      locationContextUsable: false,
      readinessReasons: {
        engine: [],
        structure: [],
        actionable: ['NO_ACTIONABLE_ZONES'],
        range: ['MISSING_RANGE_BOUNDARY'],
        location: ['INSIDE_CONTEXT_ZONE'],
      },
      transitionZones: [
        makeSupportZone({
          id: 'broken-1',
          lifecycle: 'BROKEN',
        }),
      ],
      structureState: {
        aboveSupport: false,
        belowResistance: false,
        insideZone: false,
        insideContextZone: true,
        insideContextZoneId: 'context-1',
        insideContextZoneKind: 'RANGE_BOX',
        rangeLocation: 'MIDDLE',
      },
      contextZones: [
        {
          id: 'context-1',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          kind: 'RANGE_BOX',
          low: 100,
          high: 110,
          mid: 105,
          widthPct: 10,
          lifecycle: 'TESTED',
          quality: 'MEDIUM',
          score: 55,
          sourceZoneId: 'broken-1',
          actionable: false,
          usableAsS1R1: false,
          usableAsCleanStop: false,
          usableAs2RBlocker: false,
          warnings: [],
          evidence: [],
        },
      ],
    });

    const facts = toScannerFacts(snapshot);
    expect(facts.map((fact) => fact.code)).toEqual(
      expect.arrayContaining([
        'NOT_READY',
        'TRANSITION_ONLY_STRUCTURE',
        'PRICE_IN_MIDDLE',
        'PRICE_INSIDE_CONTEXT_ZONE',
        'NO_CLEAN_LOCATION',
        'WATCHABLE_OR_CONTEXT_ONLY',
      ]),
    );
  });
});
