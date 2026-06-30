import type { Candle, Timeframe, PriceSource } from './primitives.js';
import type {
  StructureZone,
  ContextZone,
  StructureWarning,
  StructureMissing,
  StructureNotReadyReason,
  RangeLocation,
  ZoneOriginEvidence,
  ZoneTouchAccountingV2,
  LiquidityRebuildEvidence,
  ZoneAbsorptionEvidence,
  FreshnessState,
  ZoneTier,
  SupportResistanceDiagnostics,
  SupportResistanceReadinessReasons,
  SrBottleneck,
  SupportResistanceAvailability,
  SupportResistanceConflict,
  ConflictResolvedZone,
  SupportResistanceSnapshot,
} from './sr.types.js';
import { resolveSupportResistanceConfig } from './sr-config.js';
import type { SupportResistanceConfig } from './sr-config.js';
import { SrErrors } from './sr-errors.js';
import { detectPivots } from './pivot-detector.js';
import { buildZoneCandidates } from './zone-builder.js';
import { clusterZones } from './zone-clustering.js';
import { classifyZoneLifecycle } from './zone-state-engine.js';
import { evaluateZoneQuality } from './zone-quality.js';
import { resolveClosestZones } from './closest-zones-resolver.js';
import { resolveOppositeRoleConflicts } from './opposite-role-conflict-resolver.js';
import { enrichZoneFormation } from './zone-formation.js';
import { markZoneKind, toContextZone, isActionableLevelZone } from './zone-kind.js';
import { evaluateZoneOriginEvidence } from './zone-origin-evidence.js';
import { evaluateZoneTouchAccountingV2 } from './zone-touch-accounting.js';
import { evaluateLiquidityRebuildEvidence } from './zone-liquidity-rebuild.js';
import { evaluateAbsorptionRisk } from './zone-absorption.js';
import { classifyFreshnessState } from './zone-freshness.js';
import { classifyRangeBoundary } from './range-boundary-classifier.js';
import { resolveDescriptiveRangeContext } from './descriptive-range-context.js';

export type SupportResistanceInput = {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  currentPrice: number;
  priceSource: PriceSource;
  timestamp: Date;
  atr?: number;
  tickSize?: number;
  config?: SupportResistanceConfig;
};

type ZoneV2Evidence = {
  originEvidence?: ZoneOriginEvidence;
  touchAccounting?: ZoneTouchAccountingV2;
  liquidityRebuildEvidence?: LiquidityRebuildEvidence;
  absorptionEvidence?: ZoneAbsorptionEvidence;
  freshnessState?: FreshnessState;
};

export class PermissiveSupportResistanceEngine {
  evaluate(input: SupportResistanceInput): SupportResistanceSnapshot {
    const { symbol, timeframe, candles, timestamp } = input;
    const price = input.currentPrice;
    const priceSource = input.priceSource;
    const atr = input.atr;
    const tickSize = input.tickSize;
    const config = resolveSupportResistanceConfig(input.config);

    const warnings: StructureWarning[] = [];
    const missing: StructureMissing[] = [];
    const evidence: string[] = [];

    if (price <= 0) {
      missing.push('CURRENT_PRICE');
      warnings.push('MISSING_LIVE_PRICE');
      evidence.push('Current price is unavailable or zero — cannot evaluate structure.');
      return buildNotReadySnapshot({
        symbol,
        timeframe,
        timestamp,
        price,
        priceSource,
        notReadyReason: 'MISSING_CURRENT_PRICE',
        missing,
        warnings,
        evidence,
        candlesAnalyzed: candles.length
      });
    }

    if (atr === undefined) {
      missing.push('ATR_CONTEXT');
    }
    if (tickSize === undefined) {
      warnings.push('MISSING_INSTRUMENT_METADATA');
      missing.push('INSTRUMENT_METADATA');
    }

    if (candles.length < config.minCandlesForReady) {
      missing.push('CANDLES');
      warnings.push('INSUFFICIENT_STRUCTURE_HISTORY');
      return buildNotReadySnapshot({
        symbol,
        timeframe,
        timestamp,
        price,
        priceSource,
        notReadyReason: 'INSUFFICIENT_CANDLES',
        missing,
        warnings,
        evidence,
        candlesAnalyzed: candles.length
      });
    }

    const pivots = detectPivots({
      candles,
      leftBars: config.pivotLeftBars,
      rightBars: config.pivotRightBars
    });

    if (pivots.length === 0) {
      missing.push('STRUCTURE_ZONES');
      warnings.push('NO_VALID_STRUCTURE');
      evidence.push('No valid confirmed swing highs/lows detected in the candle window.');
      return buildNotReadySnapshot({
        symbol,
        timeframe,
        timestamp,
        price,
        priceSource,
        notReadyReason: 'NO_VALID_PIVOTS',
        missing,
        warnings,
        evidence,
        candlesAnalyzed: candles.length,
        confirmedPivotCount: pivots.length
      });
    }

    const candidates = buildZoneCandidates({
      symbol,
      timeframe,
      candles,
      pivots,
      ...(atr !== undefined ? { atr } : {}),
      ...(tickSize !== undefined ? { tickSize } : {}),
      config
    });

    const clustered = clusterZones({
      zones: candidates,
      ...(atr !== undefined ? { atr } : {}),
      ...(tickSize !== undefined ? { tickSize } : {}),
      config
    });
    const availableZones = clustered.filter(
      (zone) => zone.availableFromIndex <= candles.length - 1
    );

    // Pass 1: lifecycle classification
    const lifecycleZones = availableZones.map((zone) => {
      const breakBuffer = computeBuffer(
        zone.mid,
        tickSize,
        config.breakBufferTicks,
        config.breakBufferPct
      );
      const reclaimBuffer = computeBuffer(
        zone.mid,
        tickSize,
        config.reclaimBufferTicks,
        config.reclaimBufferPct
      );
      const lifecycleResult = classifyZoneLifecycle({
        zone,
        candles,
        startIndex: zone.availableFromIndex,
        breakBuffer,
        reclaimBuffer,
        ...(atr !== undefined ? { atr } : {}),
        config
      });

      const lz: StructureZone = {
        ...zone,
        role: lifecycleResult.role,
        lifecycle: lifecycleResult.lifecycle,
        touchCount: lifecycleResult.touchCount,
        rejectionCount: lifecycleResult.rejectionCount,
        breakCount: lifecycleResult.breakCount,
        noisyCrossCount: lifecycleResult.noisyCrossCount,
        cleanTouchSessions: lifecycleResult.cleanTouchSessions,
        noisyTouchSessions: lifecycleResult.noisyTouchSessions,
        passThroughCount: lifecycleResult.passThroughCount,
        evidence: [...new Set([...zone.evidence, ...lifecycleResult.evidence])],
        warnings: [...new Set([...zone.warnings, ...lifecycleResult.warnings])]
      };
      if (lifecycleResult.reactionQuality !== undefined)
        lz.reactionQuality = lifecycleResult.reactionQuality;
      if (lifecycleResult.lastTouchedAt !== undefined)
        lz.lastTouchedAt = lifecycleResult.lastTouchedAt;
      if (lifecycleResult.lastRespectedAt !== undefined)
        lz.lastRespectedAt = lifecycleResult.lastRespectedAt;
      if (lifecycleResult.lastRespectedIndex !== undefined)
        lz.lastRespectedIndex = lifecycleResult.lastRespectedIndex;
      if (lifecycleResult.brokenAt !== undefined) lz.brokenAt = lifecycleResult.brokenAt;
      if (lifecycleResult.flippedAt !== undefined)
        lz.flippedAt = lifecycleResult.flippedAt;
      if (lifecycleResult.invalidatedAt !== undefined)
        lz.invalidatedAt = lifecycleResult.invalidatedAt;
      return lz;
    });

    // v2.2 evidence — requires ATR; skipped when ATR unavailable
    const v2EvidenceMap = new Map<string, ZoneV2Evidence>();
    if (atr !== undefined) {
      for (const zone of lifecycleZones) {
        const opposingZones = lifecycleZones.filter((z) => z.role !== zone.role);
        const originEvidence = evaluateZoneOriginEvidence({
          zone,
          candles,
          pivots,
          opposingZones,
          atr,
          config
        });
        const touchAccounting = evaluateZoneTouchAccountingV2({
          zone,
          candles,
          startIndex: zone.availableFromIndex,
          atr,
          config
        });
        const liquidityRebuildEvidence = evaluateLiquidityRebuildEvidence({
          zone,
          candles,
          atr,
          config
        });
        const absorptionEvidence = evaluateAbsorptionRisk({
          trueTestSessions: touchAccounting.trueTestSessions,
          liquidityRebuildEvidence,
          config
        });
        const zoneAgeCandles = Math.max(0, candles.length - 1 - zone.availableFromIndex);
        const freshnessState = classifyFreshnessState({
          lifecycle: zone.lifecycle,
          originEvidence,
          touchAccounting,
          absorptionEvidence,
          zoneAgeCandles,
          config
        });
        v2EvidenceMap.set(zone.id, {
          originEvidence,
          touchAccounting,
          liquidityRebuildEvidence,
          absorptionEvidence,
          freshnessState
        });
      }
    }

    // Pass 2: quality evaluation + distance + formation enrichment
    const classified = lifecycleZones.map((zone) => {
      const v2e = v2EvidenceMap.get(zone.id);

      const qualityResult = evaluateZoneQuality({
        zone,
        candles,
        currentPrice: price,
        ...(atr !== undefined ? { atr } : {}),
        config,
        ...(v2e?.freshnessState !== undefined
          ? { freshnessState: v2e.freshnessState }
          : {}),
        ...(v2e?.absorptionEvidence !== undefined
          ? { absorptionEvidence: v2e.absorptionEvidence }
          : {})
      });

      const updated: StructureZone = {
        ...zone,
        quality: qualityResult.quality,
        score: qualityResult.score,
        qualityScore: qualityResult.score * 10,
        tier: assignZoneTier(qualityResult.score, config),
        structuredEvidence: qualityResult.structuredEvidence,
        evidence: [...new Set([...zone.evidence, ...qualityResult.reasons])],
        warnings: [...new Set([...zone.warnings, ...qualityResult.warnings])]
      };

      if (v2e?.originEvidence !== undefined) updated.originEvidence = v2e.originEvidence;
      if (v2e?.touchAccounting !== undefined)
        updated.touchAccounting = v2e.touchAccounting;
      if (v2e?.liquidityRebuildEvidence !== undefined)
        updated.liquidityRebuildEvidence = v2e.liquidityRebuildEvidence;
      if (v2e?.absorptionEvidence !== undefined)
        updated.absorptionEvidence = v2e.absorptionEvidence;
      if (v2e?.freshnessState !== undefined) updated.freshnessState = v2e.freshnessState;

      const distancePct = (Math.abs(updated.mid - price) / price) * 100;
      updated.distanceFromPricePct = distancePct;
      updated.distanceFromPriceBps = distancePct * 100;

      return enrichZoneFormation({ zone: updated, candles, currentPrice: price });
    });

    // Zone kind marking — uses markZoneKind (DROP policy filters out zones)
    const classifiedWithKind = classified.reduce<StructureZone[]>((acc, zone) => {
      const marked = markZoneKind(zone, config);
      if (marked !== undefined && marked.tier !== 'DROP') acc.push(marked);
      return acc;
    }, []);

    const publicActiveZones = classifiedWithKind.filter(
      (z) =>
        z.lifecycle === 'FRESH' || z.lifecycle === 'TESTED' || z.lifecycle === 'FLIPPED'
    );

    // v2.3: classify range boundary evidence for all active zones
    for (const zone of publicActiveZones) {
      zone.rangeBoundaryEvidence = classifyRangeBoundary(zone);
    }

    const transitionZones = classifiedWithKind.filter((z) => z.lifecycle === 'BROKEN');
    const brokenZonesWaitingForRetest = transitionZones;

    if (publicActiveZones.length === 0 && transitionZones.length === 0) {
      missing.push('ACTIVE_SUPPORT_OR_RESISTANCE');
      warnings.push('NO_VALID_STRUCTURE');
      evidence.push(
        'No FRESH/TESTED/FLIPPED zones found. All detected zones are BROKEN or INVALIDATED.'
      );
      return buildNotReadySnapshot({
        symbol,
        timeframe,
        timestamp,
        price,
        priceSource,
        notReadyReason: 'NO_PUBLIC_ACTIVE_ZONES',
        missing,
        warnings,
        evidence,
        candlesAnalyzed: candles.length,
        confirmedPivotCount: pivots.length,
        rawZoneCount: classified.length,
        droppedZoneCount: classified.length - classifiedWithKind.length
      });
    }

    // v2.2: split actionable LEVEL_ZONE vs context RANGE_BOX
    const s1r1EligibleZones = publicActiveZones.filter(
      (zone) =>
        isActionableLevelZone(zone) &&
        (zone.tier === 'ACTIONABLE' ||
          zone.tier === 'WATCHABLE' ||
          zone.tier === undefined)
    );
    const contextStructureZones = publicActiveZones.filter(
      (z) => z.kind === 'RANGE_BOX' || z.tier === 'CONTEXT'
    );
    const contextZones: ContextZone[] = contextStructureZones.map(toContextZone);

    // Opposite-role conflict resolver — makes final map non-overlapping before S1/R1 selection
    const resolverResult = resolveOppositeRoleConflicts({
      zones: s1r1EligibleZones,
      price,
      config,
      ...(atr !== undefined ? { atr } : {}),
      ...(tickSize !== undefined ? { tickSize } : {}),
    });
    const conflictResolvedZones: ConflictResolvedZone[] = resolverResult.conflictResolvedZones;

    const supportZones = resolverResult.accepted.filter((z) => z.role === 'SUPPORT');
    const resistanceZones = resolverResult.accepted.filter((z) => z.role === 'RESISTANCE');

    if (s1r1EligibleZones.length === 0 && contextZones.length > 0) {
      warnings.push('NO_ACTIONABLE_SR_ZONES');
      evidence.push(
        'Only range box / context zones found — no actionable level zones for SR.'
      );
    }

    const resolvedZones = resolveClosestZones({ zones: resolverResult.accepted, price });
    const { closestSupport, closestResistance, s1, s2, r1, r2 } = resolvedZones;
    warnings.push(...resolvedZones.warnings);
    evidence.push(...resolvedZones.evidence);

    // Inside zone checks (v2.2: separate actionable vs context)
    const insideActionableCandidate = resolverResult.accepted.find(
      (z) => price >= z.low && price <= z.high
    );
    const insideZone = insideActionableCandidate !== undefined;
    if (insideZone) warnings.push('PRICE_INSIDE_ZONE');

    const insideContextCandidate = contextZones.find(
      (z) => price >= z.low && price <= z.high
    );
    const insideContextZone = insideContextCandidate !== undefined;
    if (insideContextZone) {
      warnings.push('PRICE_INSIDE_CONTEXT_ZONE');
      warnings.push('NO_CLEAN_TRADE_LOCATION');
    }

    const allActionableZones = [...supportZones, ...resistanceZones];
    const nearestZoneCandidate = allActionableZones.reduce<StructureZone | undefined>(
      (best, z) => {
        if (best === undefined) return z;
        return (z.distanceFromPricePct ?? Infinity) <
          (best.distanceFromPricePct ?? Infinity)
          ? z
          : best;
      },
      undefined
    );

    const closestContextZone = contextZones.reduce<ContextZone | undefined>((best, z) => {
      if (best === undefined) return z;
      return Math.abs(z.mid - price) < Math.abs(best.mid - price) ? z : best;
    }, undefined);

    const srConflictResult = classifyS1R1Conflict({
      ...(s1 !== undefined ? { s1 } : {}),
      ...(r1 !== undefined ? { r1 } : {}),
      price,
      ...(tickSize !== undefined ? { tickSize } : {}),
      ...(atr !== undefined ? { atr } : {}),
      config
    });

    let rangeLocation: RangeLocation | undefined;
    let srConflict: SupportResistanceConflict | undefined;
    if (s1 === undefined || r1 === undefined) {
      rangeLocation = 'UNDEFINED';
    } else if (srConflictResult.type !== 'NONE') {
      rangeLocation = 'COMPRESSED_OR_OVERLAPPING_RANGE';
      warnings.push(srConflictResult.type);
      warnings.push('COMPRESSED_OR_OVERLAPPING_RANGE');
      evidence.push(
        `Nearest support and resistance do not form a clean range: ${srConflictResult.type} ` +
          `(cleanGap=${round(srConflictResult.cleanGap)}, minCleanGap=${round(srConflictResult.minCleanGap)}).`
      );
      srConflict = buildSrConflict({
        s1,
        ...(s2 !== undefined ? { s2 } : {}),
        r1,
        ...(r2 !== undefined ? { r2 } : {}),
        conflict: srConflictResult
      });
    } else {
      const rangeSize = r1.mid - s1.mid;
      const position = (price - s1.mid) / rangeSize;
      if (position < 0 || position > 1) {
        rangeLocation = 'OUTSIDE_RANGE';
      } else if (position <= 0.33) {
        rangeLocation = 'NEAR_SUPPORT';
      } else if (position <= 0.66) {
        rangeLocation = 'MIDDLE';
        warnings.push('PRICE_IN_MIDDLE_OF_RANGE');
      } else {
        rangeLocation = 'NEAR_RESISTANCE';
      }
    }

    const descriptiveRangeContext = resolveDescriptiveRangeContext({
      price,
      ...(s1 !== undefined ? { s1 } : {}),
      ...(r1 !== undefined ? { r1 } : {}),
      supportZones,
      resistanceZones,
      contextZones,
      transitionZones,
      ...(atr !== undefined ? { atr } : {}),
      ...(tickSize !== undefined ? { tickSize } : {}),
    });

    const aboveSupport =
      closestSupport !== undefined ? price >= closestSupport.low : false;
    const belowResistance =
      closestResistance !== undefined ? price <= closestResistance.high : false;

    const structureState: SupportResistanceSnapshot['structureState'] = {
      aboveSupport,
      belowResistance,
      insideZone
    };

    if (insideZone && insideActionableCandidate !== undefined)
      structureState.insideZoneId = insideActionableCandidate.id;
    if (insideContextZone) {
      structureState.insideContextZone = true;
      structureState.insideWideZone = true;
      if (insideContextCandidate !== undefined) {
        structureState.insideContextZoneId = insideContextCandidate.id;
        structureState.insideContextZoneKind = insideContextCandidate.kind;
      }
    }
    if (nearestZoneCandidate !== undefined)
      structureState.nearestZoneId = nearestZoneCandidate.id;
    if (closestContextZone !== undefined)
      structureState.nearestContextZoneId = closestContextZone.id;
    if (rangeLocation !== undefined) structureState.rangeLocation = rangeLocation;

    const hasValidZone = publicActiveZones.length > 0;
    if (!hasValidZone) {
      missing.push('ACTIVE_SUPPORT_OR_RESISTANCE');
      warnings.push('NO_VALID_STRUCTURE');
      evidence.push(
        'No FRESH/TESTED/FLIPPED zones available for public snapshot. Only BROKEN transition zones remain.'
      );
    }
    const hasPrice = price > 0;
    const ready = candles.length >= config.minCandlesForReady && hasPrice && hasValidZone;
    const notReadyReason =
      !ready && !hasValidZone ? ('NO_PUBLIC_ACTIVE_ZONES' as const) : undefined;
    const structureAvailability = resolveStructureAvailability({
      ...(s1 !== undefined ? { s1 } : {}),
      ...(r1 !== undefined ? { r1 } : {}),
      contextZones,
      transitionZones,
      ...(rangeLocation !== undefined ? { rangeLocation } : {})
    });
    const diagnostics = buildSrDiagnostics({
      candlesAnalyzed: candles.length,
      confirmedPivotCount: pivots.length,
      rawZoneCount: classified.length,
      actionableZoneCount: s1r1EligibleZones.filter(
        (zone) => zone.tier === 'ACTIONABLE' || zone.tier === undefined
      ).length,
      watchableZoneCount: s1r1EligibleZones.filter((zone) => zone.tier === 'WATCHABLE')
        .length,
      contextZoneCount: contextZones.length,
      droppedZoneCount: classified.length - classifiedWithKind.length,
      transitionZoneCount: transitionZones.length,
      s1Present: s1 !== undefined,
      r1Present: r1 !== undefined,
      srConflict: srConflict !== undefined,
      ...(rangeLocation !== undefined ? { rangeLocation } : {}),
      warnings: [...new Set(warnings)] as StructureWarning[]
    });
    const readinessState = buildReadinessState({
      legacyReady: ready,
      engineReady: candles.length >= config.minCandlesForReady && hasPrice,
      structureReady:
        publicActiveZones.length > 0 ||
        contextZones.length > 0 ||
        transitionZones.length > 0,
      actionableStructureReady: s1r1EligibleZones.length > 0,
      boundedRangeReady:
        s1 !== undefined &&
        r1 !== undefined &&
        srConflictResult.type === 'NONE',
      locationContextUsable:
        s1 !== undefined &&
        r1 !== undefined &&
        srConflictResult.type === 'NONE' &&
        !insideContextZone &&
        rangeLocation !== 'MIDDLE' &&
        rangeLocation !== 'COMPRESSED_OR_OVERLAPPING_RANGE' &&
        !warnings.includes('NO_CLEAN_TRADE_LOCATION'),
      reasons: {
        ...(candles.length < config.minCandlesForReady
          ? { engine: ['INSUFFICIENT_CANDLES'] }
          : {}),
        ...(hasPrice ? {} : { engine: ['MISSING_CURRENT_PRICE'] }),
        ...((publicActiveZones.length > 0 || contextZones.length > 0 || transitionZones.length > 0)
          ? {}
          : { structure: ['NO_VALID_PIVOTS'] }),
        ...(s1r1EligibleZones.length > 0
          ? {}
          : {
              actionable: [
                publicActiveZones.length === 0
                  ? 'NO_PUBLIC_ACTIVE_ZONES'
                  : 'NO_ACTIONABLE_SR_ZONES',
              ],
            }),
        ...(s1 !== undefined && r1 !== undefined && srConflictResult.type === 'NONE'
          ? {}
          : {
              range: [
                srConflictResult.type !== 'NONE'
                  ? srConflictResult.type
                  : 'MISSING_RANGE_BOUNDARY',
              ],
            }),
        ...((s1 !== undefined &&
          r1 !== undefined &&
          srConflictResult.type === 'NONE' &&
          !insideContextZone &&
          rangeLocation !== 'MIDDLE' &&
          rangeLocation !== 'COMPRESSED_OR_OVERLAPPING_RANGE' &&
          !warnings.includes('NO_CLEAN_TRADE_LOCATION'))
          ? {}
          : {
              location: [
                s1 === undefined || r1 === undefined
                  ? 'MISSING_RANGE_BOUNDARY'
                  : srConflictResult.type !== 'NONE'
                    ? srConflictResult.type
                    :
                insideContextZone
                  ? 'PRICE_INSIDE_CONTEXT_ZONE'
                  : rangeLocation === 'MIDDLE'
                    ? 'PRICE_IN_MIDDLE_OF_RANGE'
                    : rangeLocation === 'COMPRESSED_OR_OVERLAPPING_RANGE'
                      ? 'NO_CLEAN_RANGE'
                      : warnings.includes('NO_CLEAN_TRADE_LOCATION')
                        ? 'NO_CLEAN_TRADE_LOCATION'
                        : 'NO_ACTIONABLE_SR_ZONES',
              ],
            }),
      },
    });

    const snapshotResult: SupportResistanceSnapshot = {
      symbol,
      timeframe,
      timestamp,
      price,
      priceSource,
      supportZones,
      resistanceZones,
      transitionZones,
      brokenZonesWaitingForRetest,
      structureState,
      ready,
      legacyReady: readinessState.legacyReady,
      engineReady: readinessState.engineReady,
      structureReady: readinessState.structureReady,
      actionableStructureReady: readinessState.actionableStructureReady,
      boundedRangeReady: readinessState.boundedRangeReady,
      locationContextUsable: readinessState.locationContextUsable,
      readinessReasons: readinessState.readinessReasons,
      ...(notReadyReason !== undefined ? { notReadyReason } : {}),
      missing: [...new Set(missing)],
      warnings: [...new Set(warnings)] as StructureWarning[],
      evidence: [...new Set(evidence)],
      structureAvailability,
      diagnostics,
      descriptiveRangeContext
    };
    if (conflictResolvedZones.length > 0)
      snapshotResult.conflictResolvedZones = conflictResolvedZones;

    if (contextZones.length > 0) snapshotResult.contextZones = contextZones;
    if (closestContextZone !== undefined)
      snapshotResult.closestContextZone = closestContextZone;
    if (closestSupport !== undefined) snapshotResult.closestSupport = closestSupport;
    if (closestResistance !== undefined)
      snapshotResult.closestResistance = closestResistance;
    if (s1 !== undefined) {
      snapshotResult.s1 = s1;
      snapshotResult.structuralS1 = s1;
      if (s1.tier !== undefined) snapshotResult.s1Tier = s1.tier;
      snapshotResult.s1Score = s1.score;
      snapshotResult.s1OriginalRole = s1.originalRole;
      snapshotResult.s1RoleFlipped = s1.role !== s1.originalRole;
    }
    if (s2 !== undefined) {
      snapshotResult.s2 = s2;
      snapshotResult.structuralS2 = s2;
    }
    if (r1 !== undefined) {
      snapshotResult.r1 = r1;
      snapshotResult.structuralR1 = r1;
      if (r1.tier !== undefined) snapshotResult.r1Tier = r1.tier;
      snapshotResult.r1Score = r1.score;
      snapshotResult.r1OriginalRole = r1.originalRole;
      snapshotResult.r1RoleFlipped = r1.role !== r1.originalRole;
    }
    if (r2 !== undefined) {
      snapshotResult.r2 = r2;
      snapshotResult.structuralR2 = r2;
    }
    if (srConflict !== undefined) snapshotResult.srConflict = srConflict;

    return snapshotResult;
  }
}

function computeBuffer(
  price: number,
  tickSize: number | undefined,
  bufferTicks: number,
  bufferPct: number
): number {
  const tickBuffer = tickSize !== undefined ? tickSize * bufferTicks : 0;
  const pctBuffer = price * bufferPct;
  return Math.max(tickBuffer, pctBuffer);
}

function assignZoneTier(score: number, config: SupportResistanceConfig): ZoneTier {
  const qualityScore = score * 10;
  if (qualityScore >= config.zoneTierActionableMinScore) return 'ACTIONABLE';
  if (qualityScore >= config.zoneTierWatchableMinScore) return 'WATCHABLE';
  if (qualityScore >= config.zoneTierContextMinScore) return 'CONTEXT';
  return 'DROP';
}

function resolveStructureAvailability(input: {
  s1?: StructureZone;
  r1?: StructureZone;
  contextZones: readonly ContextZone[];
  transitionZones: readonly StructureZone[];
  rangeLocation?: RangeLocation;
}): SupportResistanceAvailability {
  if (input.rangeLocation === 'MIDDLE') {
    return { level: 'NONE', limitingFactor: 'COMPRESSED_MIDDLE' };
  }

  const references = [input.s1, input.r1].filter(
    (zone): zone is StructureZone => zone !== undefined
  );
  if (references.length === 0) {
    if (input.contextZones.length > 0 || input.transitionZones.length > 0) {
      return { level: 'CONTEXT_ONLY', limitingFactor: 'ZONE_QUALITY' };
    }
    return { level: 'NONE', limitingFactor: 'NO_ZONES' };
  }

  if (references.some((zone) => zone.tier === 'ACTIONABLE' || zone.tier === undefined)) {
    return { level: 'ACTIONABLE', limitingFactor: null };
  }

  if (references.some((zone) => zone.tier === 'WATCHABLE')) {
    return { level: 'WATCHABLE', limitingFactor: 'ZONE_QUALITY' };
  }

  return { level: 'CONTEXT_ONLY', limitingFactor: 'ZONE_QUALITY' };
}

type S1R1ConflictResult =
  | {
      type: 'NONE';
      cleanGap: number;
      minCleanGap: number;
    }
  | {
      type: SupportResistanceConflict['type'];
      cleanGap: number;
      minCleanGap: number;
    };

export function zonesOverlap(a: StructureZone, b: StructureZone): boolean {
  return Math.max(a.low, b.low) <= Math.min(a.high, b.high);
}

export function getMinCleanRangeGap(input: {
  price: number;
  tickSize?: number;
  atr?: number;
  config: SupportResistanceConfig;
}): number {
  const effectiveTickSize = input.tickSize ?? input.price * 0.0001;
  return Math.max(
    effectiveTickSize * input.config.noCleanRangeMinGapTicks,
    input.price * input.config.noCleanRangeMinGapPct,
    input.atr !== undefined ? input.atr * input.config.noCleanRangeMinGapAtr : 0
  );
}

export function classifyS1R1Conflict(input: {
  s1?: StructureZone;
  r1?: StructureZone;
  price: number;
  tickSize?: number;
  atr?: number;
  config: SupportResistanceConfig;
}): S1R1ConflictResult {
  const minCleanGap = getMinCleanRangeGap(input);
  if (input.s1 === undefined || input.r1 === undefined) {
    return { type: 'NONE', cleanGap: Number.POSITIVE_INFINITY, minCleanGap };
  }

  const cleanGap = input.r1.low - input.s1.high;
  const effectiveTickSize = input.tickSize ?? input.price * 0.0001;
  const epsilon = Math.max(effectiveTickSize * 0.1, Number.EPSILON);

  if (cleanGap < -epsilon) {
    return { type: 'S1_R1_OVERLAP', cleanGap, minCleanGap };
  }
  if (Math.abs(cleanGap) <= epsilon) {
    return { type: 'S1_R1_TOUCHING', cleanGap, minCleanGap };
  }
  if (cleanGap <= minCleanGap) {
    return { type: 'NO_CLEAN_RANGE', cleanGap, minCleanGap };
  }

  return { type: 'NONE', cleanGap, minCleanGap };
}

function buildSrConflict(input: {
  s1: StructureZone;
  s2?: StructureZone;
  r1: StructureZone;
  r2?: StructureZone;
  conflict: Exclude<S1R1ConflictResult, { type: 'NONE' }>;
}): SupportResistanceConflict {
  return {
    type: input.conflict.type,
    supportId: input.s1.id,
    resistanceId: input.r1.id,
    ...(input.s2 !== undefined ? { outerSupportId: input.s2.id } : {}),
    ...(input.r2 !== undefined ? { outerResistanceId: input.r2.id } : {}),
    cleanGap: input.conflict.cleanGap,
    minCleanGap: input.conflict.minCleanGap
  };
}

function buildSrDiagnostics(input: {
  candlesAnalyzed: number;
  confirmedPivotCount: number;
  rawZoneCount?: number;
  actionableZoneCount?: number;
  watchableZoneCount?: number;
  contextZoneCount?: number;
  droppedZoneCount?: number;
  transitionZoneCount?: number;
  s1Present?: boolean;
  r1Present?: boolean;
  srConflict?: boolean;
  rangeLocation?: string;
  stopQuality?: SupportResistanceDiagnostics['stopQuality'];
  pathQuality?: SupportResistanceDiagnostics['pathQuality'];
  rMultipleToFirstBlocker?: number;
  warnings: StructureWarning[];
}): SupportResistanceDiagnostics {
  const diagnostics: SupportResistanceDiagnostics = {
    candlesAnalyzed: input.candlesAnalyzed,
    confirmedPivotCount: input.confirmedPivotCount,
    provisionalPivotCount: 0,
    rawZoneCount: input.rawZoneCount ?? 0,
    actionableZoneCount: input.actionableZoneCount ?? 0,
    watchableZoneCount: input.watchableZoneCount ?? 0,
    contextZoneCount: input.contextZoneCount ?? 0,
    droppedZoneCount: input.droppedZoneCount ?? 0,
    transitionZoneCount: input.transitionZoneCount ?? 0,
    s1Present: input.s1Present ?? false,
    r1Present: input.r1Present ?? false,
    srConflict: input.srConflict ?? false,
    stopQuality: input.stopQuality ?? 'NONE',
    pathQuality: input.pathQuality ?? 'UNKNOWN',
    bottleneck: 'NONE',
    warnings: input.warnings
  };
  if (input.rangeLocation !== undefined) diagnostics.rangeLocation = input.rangeLocation;
  if (input.rMultipleToFirstBlocker !== undefined)
    diagnostics.rMultipleToFirstBlocker = input.rMultipleToFirstBlocker;
  diagnostics.bottleneck = detectBottleneck({
    ...diagnostics,
    stopQualityKnown: input.stopQuality !== undefined,
    pathQualityKnown: input.pathQuality !== undefined
  });
  return diagnostics;
}

function detectBottleneck(input: {
  confirmedPivotCount: number;
  actionableZoneCount: number;
  rawZoneCount: number;
  srConflict: boolean;
  stopQuality: SupportResistanceDiagnostics['stopQuality'];
  pathQuality: SupportResistanceDiagnostics['pathQuality'];
  stopQualityKnown: boolean;
  pathQualityKnown: boolean;
}): SrBottleneck {
  if (input.confirmedPivotCount < 2) return 'PIVOT_LAG';
  if (input.rawZoneCount === 0) return 'NO_ZONES';
  if (input.actionableZoneCount === 0) return 'NO_ACTIONABLE_ZONE';
  if (input.srConflict) return 'NO_CLEAN_RANGE';
  if (input.stopQualityKnown && input.stopQuality === 'NONE') return 'STOP_NONE';
  if (input.pathQualityKnown && input.pathQuality === 'BLOCKED') return 'PATH_BLOCKED';
  return 'NONE';
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function buildNotReadySnapshot(input: {
  symbol: string;
  timeframe: Timeframe;
  timestamp: Date;
  price: number;
  priceSource: PriceSource;
  notReadyReason: StructureNotReadyReason;
  missing: StructureMissing[];
  warnings: StructureWarning[];
  evidence: string[];
  candlesAnalyzed?: number;
  confirmedPivotCount?: number;
  rawZoneCount?: number;
  droppedZoneCount?: number;
}): SupportResistanceSnapshot {
  const diagnostics = buildSrDiagnostics({
    candlesAnalyzed: input.candlesAnalyzed ?? 0,
    confirmedPivotCount: input.confirmedPivotCount ?? 0,
    rawZoneCount: input.rawZoneCount ?? 0,
    droppedZoneCount: input.droppedZoneCount ?? 0,
    transitionZoneCount: 0,
    warnings: input.warnings
  });
  const readinessState = buildReadinessState({
    legacyReady: false,
    engineReady:
      input.notReadyReason === 'NO_VALID_PIVOTS' ||
      input.notReadyReason === 'NO_PUBLIC_ACTIVE_ZONES',
    structureReady: false,
    actionableStructureReady: false,
    boundedRangeReady: false,
    locationContextUsable: false,
    reasons: resolveEarlyReadinessReasons(input.notReadyReason),
  });
  return {
    symbol: input.symbol,
    timeframe: input.timeframe,
    timestamp: input.timestamp,
    price: input.price,
    priceSource: input.priceSource,
    supportZones: [],
    resistanceZones: [],
    structureState: {
      aboveSupport: false,
      belowResistance: false,
      insideZone: false,
      rangeLocation: 'UNDEFINED'
    },
    ready: false,
    legacyReady: readinessState.legacyReady,
    engineReady: readinessState.engineReady,
    structureReady: readinessState.structureReady,
    actionableStructureReady: readinessState.actionableStructureReady,
    boundedRangeReady: readinessState.boundedRangeReady,
    locationContextUsable: readinessState.locationContextUsable,
    readinessReasons: readinessState.readinessReasons,
    notReadyReason: input.notReadyReason,
    missing: input.missing,
    warnings: input.warnings,
    evidence: input.evidence,
    structureAvailability: { level: 'NONE', limitingFactor: 'NO_ZONES' },
    diagnostics
  };
}

// Re-export SrErrors for callers that need to throw structured errors
export { SrErrors };

function buildReadinessState(input: {
  legacyReady: boolean;
  engineReady: boolean;
  structureReady: boolean;
  actionableStructureReady: boolean;
  boundedRangeReady: boolean;
  locationContextUsable: boolean;
  reasons?: Partial<SupportResistanceReadinessReasons>;
}): {
  legacyReady: boolean;
  engineReady: boolean;
  structureReady: boolean;
  actionableStructureReady: boolean;
  boundedRangeReady: boolean;
  locationContextUsable: boolean;
  readinessReasons: SupportResistanceReadinessReasons;
} {
  return {
    legacyReady: input.legacyReady,
    engineReady: input.engineReady,
    structureReady: input.structureReady,
    actionableStructureReady: input.actionableStructureReady,
    boundedRangeReady: input.boundedRangeReady,
    locationContextUsable: input.locationContextUsable,
    readinessReasons: {
      engine: [...new Set(input.reasons?.engine ?? [])],
      structure: [...new Set(input.reasons?.structure ?? [])],
      actionable: [...new Set(input.reasons?.actionable ?? [])],
      range: [...new Set(input.reasons?.range ?? [])],
      location: [...new Set(input.reasons?.location ?? [])],
    },
  };
}

function resolveEarlyReadinessReasons(
  notReadyReason: StructureNotReadyReason,
): SupportResistanceReadinessReasons {
  switch (notReadyReason) {
    case 'MISSING_CURRENT_PRICE':
      return {
        engine: ['MISSING_CURRENT_PRICE'],
        structure: ['MISSING_CURRENT_PRICE'],
        actionable: ['MISSING_CURRENT_PRICE'],
        range: ['MISSING_CURRENT_PRICE'],
        location: ['MISSING_CURRENT_PRICE'],
      };
    case 'INSUFFICIENT_CANDLES':
      return {
        engine: ['INSUFFICIENT_CANDLES'],
        structure: ['INSUFFICIENT_CANDLES'],
        actionable: ['INSUFFICIENT_CANDLES'],
        range: ['INSUFFICIENT_CANDLES'],
        location: ['INSUFFICIENT_CANDLES'],
      };
    case 'NO_VALID_PIVOTS':
      return {
        engine: [],
        structure: ['NO_VALID_PIVOTS'],
        actionable: ['NO_VALID_PIVOTS'],
        range: ['NO_VALID_PIVOTS'],
        location: ['NO_VALID_PIVOTS'],
      };
    case 'NO_PUBLIC_ACTIVE_ZONES':
      return {
        engine: [],
        structure: ['NO_PUBLIC_ACTIVE_ZONES'],
        actionable: ['NO_PUBLIC_ACTIVE_ZONES'],
        range: ['NO_PUBLIC_ACTIVE_ZONES'],
        location: ['NO_PUBLIC_ACTIVE_ZONES'],
      };
  }
}
