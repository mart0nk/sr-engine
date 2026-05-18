import type { Candle } from './primitives.js';
import type { StructureZone, LiquidityRebuildEvidence } from './sr.types.js';
import type { SupportResistanceConfig } from './sr-config.js';

function nearestRoundLevel(price: number): number {
  let increments: number[];

  if (price < 1) {
    increments = [0.01, 0.05, 0.10];
  } else if (price < 10) {
    increments = [0.10, 0.50, 1.00];
  } else if (price < 100) {
    increments = [1, 5, 10];
  } else if (price < 1000) {
    increments = [10, 50, 100];
  } else {
    increments = [100, 500, 1000];
  }

  let nearest = 0;
  let minDist = Infinity;

  for (const inc of increments) {
    const rounded = Math.round(price / inc) * inc;
    const dist = Math.abs(price - rounded);
    if (dist < minDist) {
      minDist = dist;
      nearest = rounded;
    }
  }

  return nearest;
}

export function evaluateLiquidityRebuildEvidence(args: {
  zone: StructureZone;
  candles: readonly Candle[];
  atr: number;
  config: SupportResistanceConfig;
}): LiquidityRebuildEvidence {
  const { zone, candles, atr, config } = args;
  const notes: string[] = [];

  const start = zone.availableFromIndex;

  // --- consolidationAtZone ---

  let bestRunLength = 0;
  let bestRunHigh = 0;
  let bestRunLow = Infinity;
  let currentRunLength = 0;
  let currentRunHigh = 0;
  let currentRunLow = Infinity;

  for (let i = start; i < candles.length; i++) {
    const candle = candles[i];
    if (candle === undefined) continue;

    const overlaps = candle.low <= zone.high && candle.high >= zone.low;

    if (overlaps) {
      currentRunLength += 1;
      if (candle.high > currentRunHigh) currentRunHigh = candle.high;
      if (candle.low < currentRunLow) currentRunLow = candle.low;
    } else {
      if (currentRunLength > bestRunLength) {
        bestRunLength = currentRunLength;
        bestRunHigh = currentRunHigh;
        bestRunLow = currentRunLow;
      }
      currentRunLength = 0;
      currentRunHigh = 0;
      currentRunLow = Infinity;
    }
  }
  // Flush final run
  if (currentRunLength > bestRunLength) {
    bestRunLength = currentRunLength;
    bestRunHigh = currentRunHigh;
    bestRunLow = currentRunLow;
  }

  const baseCandles = bestRunLength;
  const baseRangeAtr = atr > 0 && bestRunLength > 0 ? (bestRunHigh - bestRunLow) / atr : 0;

  let consolidationAtZone = false;

  if (bestRunLength >= config.baseMinCandles && baseRangeAtr <= config.baseMaxRangeAtr) {
    const overlapLow = Math.max(bestRunLow, zone.low);
    const overlapHigh = Math.min(bestRunHigh, zone.high);
    const overlapSize = overlapHigh - overlapLow;
    const zoneWidth = zone.high - zone.low;
    const overlapPct = zoneWidth > 0 ? overlapSize / zoneWidth : 0;
    if (overlapPct >= config.baseZoneOverlapPct) {
      consolidationAtZone = true;
    }
  }

  // --- sweepAndReclaim ---

  let sweepAndReclaim = false;

  for (let i = start; i < candles.length; i++) {
    const candle = candles[i];
    if (candle === undefined) continue;

    if (zone.role === 'SUPPORT') {
      if (candle.low < zone.low && candle.close > zone.mid) {
        sweepAndReclaim = true;
        break;
      }
    } else {
      if (candle.high > zone.high && candle.close < zone.mid) {
        sweepAndReclaim = true;
        break;
      }
    }
  }

  // --- psychologicalLevel ---

  const nearest = nearestRoundLevel(zone.mid);
  const roundLevelProximityBps = zone.mid > 0 ? (Math.abs(zone.mid - nearest) / zone.mid) * 10000 : Infinity;
  const psychologicalLevel = roundLevelProximityBps <= config.roundLevelBps;

  // --- volumeBuildUp (MVP skip) ---

  const volumeBuildUp = false;
  notes.push('Volume build-up requires session-adjusted volume baseline; skipped in v2.2 MVP.');

  // --- reloadLikely ---

  const passThroughCount = zone.passThroughCount ?? 0;

  const reloadLikely =
    consolidationAtZone &&
    passThroughCount === 0 &&
    (sweepAndReclaim || volumeBuildUp || psychologicalLevel);

  const result: LiquidityRebuildEvidence = {
    consolidationAtZone,
    baseCandles,
    baseRangeAtr,
    roundLevelProximityBps,
    psychologicalLevel,
    sweepAndReclaim,
    volumeBuildUp,
    reloadLikely,
    notes,
  };

  return result;
}
