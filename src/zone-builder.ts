import type { Timeframe, Candle } from './primitives.js';
import type { StructureZone, StructureWarning } from './sr.types.js';
import type { PivotPoint } from './pivot-detector.js';
import type { SupportResistanceConfig } from './sr-config.js';
import { resolveSupportResistanceConfig } from './sr-config.js';
import { SrErrors } from './sr-errors.js';
import { normalizeZoneWidth } from './zone-width.js';

export function buildZoneCandidates(input: {
  symbol: string;
  timeframe: Timeframe;
  candles: readonly Candle[];
  pivots: readonly PivotPoint[];
  atr?: number;
  tickSize?: number;
  config?: Partial<SupportResistanceConfig>;
}): StructureZone[] {
  const { symbol, timeframe, candles, pivots, atr, tickSize } = input;
  const config = resolveSupportResistanceConfig(input.config);
  if (config.zoneConstructionPolicy !== 'WICK_TO_BODY') {
    throw SrErrors.unsupportedZonePolicy(config.zoneConstructionPolicy);
  }

  const zones: StructureZone[] = [];
  let idCounter = 0;

  for (const pivot of pivots) {
    const originCandle = candles[pivot.originIndex];
    const confirmedCandle = candles[pivot.confirmedIndex];
    if (originCandle === undefined || confirmedCandle === undefined) continue;

    idCounter++;
    const indexStr = String(idCounter).padStart(3, '0');

    if (pivot.type === 'HIGH') {
      zones.push(buildZone({
        id: `${symbol}-${timeframe}-R-${indexStr}`,
        symbol,
        timeframe,
        role: 'RESISTANCE',
        origin: 'SWING_HIGH',
        high: originCandle.high,
        low: Math.max(originCandle.open, originCandle.close),
        pivot,
        originCandle,
        config,
        ...(atr !== undefined ? { atr } : {}),
        ...(tickSize !== undefined ? { tickSize } : {}),
      }));
    } else {
      zones.push(buildZone({
        id: `${symbol}-${timeframe}-S-${indexStr}`,
        symbol,
        timeframe,
        role: 'SUPPORT',
        origin: 'SWING_LOW',
        high: Math.min(originCandle.open, originCandle.close),
        low: originCandle.low,
        pivot,
        originCandle,
        config,
        ...(atr !== undefined ? { atr } : {}),
        ...(tickSize !== undefined ? { tickSize } : {}),
      }));
    }
  }

  return zones;
}

function buildZone(input: {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  role: 'SUPPORT' | 'RESISTANCE';
  origin: 'SWING_HIGH' | 'SWING_LOW';
  high: number;
  low: number;
  pivot: PivotPoint;
  originCandle: Candle;
  config: SupportResistanceConfig;
  atr?: number;
  tickSize?: number;
}): StructureZone {
  const { id, symbol, timeframe, role, origin, pivot, originCandle, atr, tickSize, config } = input;
  let { high, low } = input;

  if (high < low) {
    [high, low] = [low, high];
  }

  const warnings: StructureWarning[] = [];
  if (atr == null) {
    warnings.push('MISSING_ATR_CONTEXT');
  }
  if (tickSize == null) {
    warnings.push('MISSING_INSTRUMENT_METADATA');
  }

  const mid = (low + high) / 2;
  const widthPct = (high - low) / mid * 100;

  const initialLow = low;
  const initialHigh = high;
  const zone: StructureZone = {
    id,
    symbol,
    timeframe,
    role,
    originalRole: role,
    lifecycle: 'FRESH',
    origin,
    originIndex: pivot.originIndex,
    confirmedIndex: pivot.confirmedIndex,
    availableFromIndex: pivot.availableFromIndex,
    originAt: pivot.originAt,
    low,
    high,
    mid,
    createdAt: pivot.confirmedAt,
    touchCount: 0,
    rejectionCount: 0,
    breakCount: 0,
    noisyCrossCount: 0,
    quality: 'LOW',
    score: 0,
    widthPct,
    formationTrace: {
      detectedPivot: {
        type: origin,
        originIndex: pivot.originIndex,
        originAt: pivot.originAt,
        open: originCandle.open,
        high: originCandle.high,
        low: originCandle.low,
        close: originCandle.close,
      },
      initialZone: {
        low: initialLow,
        high: initialHigh,
        formula: origin === 'SWING_HIGH'
          ? 'RESISTANCE: zone.high = swing candle high; zone.low = max(open, close)'
          : 'SUPPORT: zone.low = swing candle low; zone.high = min(open, close)',
      },
      widthAdjustment: {
        applied: false,
      },
      lifecycleEvents: [{
        type: 'CREATED',
        at: pivot.confirmedAt,
        reason: `Zone created after ${origin} pivot confirmation.`,
      }],
    },
    evidence: [],
    warnings,
  };

  if (atr != null) {
    zone.widthAtr = (high - low) / atr;
  }

  const normalized = normalizeZoneWidth({
    zone,
    price: mid,
    ...(atr !== undefined ? { atr } : {}),
    ...(tickSize !== undefined ? { tickSize } : {}),
    config,
  });

  if (normalized.formationTrace !== undefined) {
    const widthChanged = normalized.low !== initialLow || normalized.high !== initialHigh;
    normalized.formationTrace = {
      ...normalized.formationTrace,
      widthAdjustment: {
        applied: widthChanged,
        ...(widthChanged
          ? {
              reason: normalized.warnings.includes('ZONE_TOO_NARROW_EXPANDED')
                ? 'TOO_NARROW_EXPANDED'
                : 'TOO_WIDE_MARKED',
              before: { low: initialLow, high: initialHigh },
              after: { low: normalized.low, high: normalized.high },
            }
          : {}),
      },
    };
  }

  return normalized;
}
