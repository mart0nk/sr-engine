import type { Candle } from './primitives.js';
import type { StructureZone, ZoneOriginEvidence } from './sr.types.js';
import type { PivotPoint } from './pivot-detector.js';
import type { SupportResistanceConfig } from './sr-config.js';

export function evaluateZoneOriginEvidence(args: {
  zone: StructureZone;
  candles: readonly Candle[];
  pivots: readonly PivotPoint[];
  opposingZones: readonly StructureZone[];
  atr: number;
  config: SupportResistanceConfig;
}): ZoneOriginEvidence {
  const { zone, candles, pivots, opposingZones, atr, config } = args;
  const notes: string[] = [];

  const start = zone.availableFromIndex;
  const end = Math.min(start + config.originBosLookaheadCandles, candles.length);

  // --- causedBos / bosDirection ---

  let causedBos = false;
  let bosDirection: 'BULLISH' | 'BEARISH' | undefined;

  function checkBullishBos(): boolean {
    // Support zone (SWING_LOW): price closes above the most recent previous SWING_HIGH pivot
    const prevHighPivot = [...pivots]
      .filter((p) => p.type === 'HIGH' && p.availableFromIndex < start)
      .sort((a, b) => b.availableFromIndex - a.availableFromIndex)[0];

    if (prevHighPivot === undefined) return false;

    for (let i = start; i < end; i++) {
      const candle = candles[i];
      if (candle === undefined) continue;
      if (candle.close > prevHighPivot.price) return true;
    }
    return false;
  }

  function checkBearishBos(): boolean {
    // Resistance zone (SWING_HIGH): price closes below the most recent previous SWING_LOW pivot
    const prevLowPivot = [...pivots]
      .filter((p) => p.type === 'LOW' && p.availableFromIndex < start)
      .sort((a, b) => b.availableFromIndex - a.availableFromIndex)[0];

    if (prevLowPivot === undefined) return false;

    for (let i = start; i < end; i++) {
      const candle = candles[i];
      if (candle === undefined) continue;
      if (candle.close < prevLowPivot.price) return true;
    }
    return false;
  }

  if (zone.origin === 'SWING_LOW') {
    if (checkBullishBos()) {
      causedBos = true;
      bosDirection = 'BULLISH';
    }
  } else if (zone.origin === 'SWING_HIGH') {
    if (checkBearishBos()) {
      causedBos = true;
      bosDirection = 'BEARISH';
    }
  } else if (zone.origin === 'CLUSTER') {
    if (checkBullishBos()) {
      causedBos = true;
      bosDirection = 'BULLISH';
    } else if (checkBearishBos()) {
      causedBos = true;
      bosDirection = 'BEARISH';
    }
  }

  // --- displacementAtr / displacementPct ---

  let maxDisplacement = 0;
  for (let i = start; i < end; i++) {
    const candle = candles[i];
    if (candle === undefined) continue;
    const moveUp = Math.abs(candle.high - zone.mid);
    const moveDown = Math.abs(candle.low - zone.mid);
    const move = Math.max(moveUp, moveDown);
    if (move > maxDisplacement) maxDisplacement = move;
  }

  const displacementAtr = atr > 0 ? maxDisplacement / atr : 0;
  const displacementPct = zone.mid > 0 ? (maxDisplacement / zone.mid) * 100 : 0;

  // Determine displacement range bounds from origin
  let dispRangeLow = zone.mid;
  let dispRangeHigh = zone.mid;
  for (let i = start; i < end; i++) {
    const candle = candles[i];
    if (candle === undefined) continue;
    if (candle.low < dispRangeLow) dispRangeLow = candle.low;
    if (candle.high > dispRangeHigh) dispRangeHigh = candle.high;
  }

  // --- removedOpposingZone ---

  let removedOpposingZone = false;
  let removedOpposingZoneId: string | undefined;

  for (const oz of opposingZones) {
    if (oz.mid >= dispRangeLow && oz.mid <= dispRangeHigh) {
      removedOpposingZone = true;
      removedOpposingZoneId = oz.id;
      break;
    }
  }

  // --- impulseVolumeConfirmed (MVP skip) ---

  const impulseVolumeConfirmed = false;
  notes.push('Volume confirmation requires session-adjusted volume; skipped in v2.2 MVP.');

  // --- significantOrigin ---

  const significantOrigin =
    causedBos ||
    removedOpposingZone ||
    displacementAtr >= config.originDisplacementAtrThreshold ||
    displacementPct >= config.originDisplacementPctThreshold;

  // --- originAgeCandles ---

  const originAgeCandles = candles.length - 1 - zone.availableFromIndex;

  const result: ZoneOriginEvidence = {
    causedBos,
    removedOpposingZone,
    displacementAtr,
    displacementPct,
    impulseVolumeConfirmed,
    significantOrigin,
    originAgeCandles,
    notes,
  };

  if (bosDirection !== undefined) result.bosDirection = bosDirection;
  if (removedOpposingZoneId !== undefined) result.removedOpposingZoneId = removedOpposingZoneId;

  return result;
}
