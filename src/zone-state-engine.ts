import type { Candle } from './primitives.js';
import type { ReactionQuality, StructureZone, StructureZoneRole, ZoneLifecycle, StructureWarning, ZoneTouchAccountingV2 } from './sr.types.js';
import type { SupportResistanceConfig } from './sr-config.js';
import { resolveSupportResistanceConfig } from './sr-config.js';
import { evaluateReactionQuality } from './zone-reaction-quality.js';

type BreakDirection = 'UP' | 'DOWN';
type InteractionType =
  | 'NONE'
  | 'REJECTION'
  | 'BREAK_UP'
  | 'BREAK_DOWN'
  | 'RETEST_FROM_ABOVE_HELD'
  | 'RETEST_FROM_BELOW_REJECTED'
  | 'FLIPPED_ZONE_LOST'
  | 'NOISY';

export type ZoneLifecycleResult = {
  role: StructureZoneRole;
  lifecycle: ZoneLifecycle;
  touchCount: number;
  rejectionCount: number;
  breakCount: number;
  noisyCrossCount: number;
  cleanTouchSessions: number;
  noisyTouchSessions: number;
  passThroughCount: number;
  lastTouchedAt?: Date;
  lastRespectedAt?: Date;
  lastRespectedIndex?: number;
  brokenAt?: Date;
  flippedAt?: Date;
  invalidatedAt?: Date;
  reactionQuality?: ReactionQuality;
  evidence: string[];
  warnings: StructureWarning[];
  touchAccounting: ZoneTouchAccountingV2;
};

export function classifyZoneLifecycle(input: {
  zone: StructureZone;
  candles: readonly Candle[];
  startIndex: number;
  breakBuffer: number;
  reclaimBuffer: number;
  atr?: number;
  config?: Partial<SupportResistanceConfig>;
}): ZoneLifecycleResult {
  const { zone, candles, breakBuffer, reclaimBuffer, atr } = input;
  const config = resolveSupportResistanceConfig(input.config);

  let role: StructureZoneRole = zone.role;
  let lifecycle: ZoneLifecycle = zone.lifecycle;
  let breakDirection: BreakDirection | undefined;
  let touchCount = 0;
  let rejectionCount = 0;
  let breakCount = 0;
  let noisyCrossCount = 0;
  let cleanTouchSessions = 0;
  let noisyTouchSessions = 0;
  let passThroughCount = 0;
  let lastTouchedAt: Date | undefined;
  let lastRespectedAt: Date | undefined;
  let lastRespectedIndex: number | undefined;
  let brokenAt: Date | undefined;
  let flippedAt: Date | undefined;
  let invalidatedAt: Date | undefined;
  let reactionQuality: ReactionQuality | undefined;
  let wasInsideZone = false;

  const evidence: string[] = [];
  const warnings: StructureWarning[] = [];
  const startIndex = Math.max(input.startIndex ?? 0, 0);

  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i];
    if (candle === undefined) continue;
    const previousCandle = candles[i - 1];
    const touched = intersectsZone(candle, zone);

    if (touched && !wasInsideZone) {
      touchCount += 1;
      lastTouchedAt = candle.openTime;
      const quality = evaluateReactionQuality({
        zone: { ...zone, role },
        candles,
        touchIndex: i,
        ...(atr !== undefined ? { atr } : {}),
        config,
      });
      reactionQuality = quality;
      if (quality.closedAwayFromZone && quality.reactionStrength !== 'NONE') {
        cleanTouchSessions += 1;
        lastRespectedAt = candle.openTime;
        lastRespectedIndex = i;
      } else if (isPassThroughTouch({ zone, role, candle, breakBuffer })) {
        passThroughCount += 1;
      } else {
        noisyTouchSessions += 1;
      }
    }

    const interaction = classifyInteraction({
      zone,
      role,
      candle,
      breakBuffer,
      reclaimBuffer,
      lifecycle,
      ...(previousCandle !== undefined ? { previousCandle } : {}),
      ...(breakDirection !== undefined ? { breakDirection } : {}),
    });

    switch (lifecycle) {
      case 'FRESH':
      case 'TESTED': {
        if (interaction === 'BREAK_UP') {
          lifecycle = 'BROKEN';
          breakDirection = 'UP';
          breakCount += 1;
          brokenAt = candle.openTime;
          evidence.push(`BROKEN_UP_AT_${candle.openTime.toISOString()}`);
        } else if (interaction === 'BREAK_DOWN') {
          lifecycle = 'BROKEN';
          breakDirection = 'DOWN';
          breakCount += 1;
          brokenAt = candle.openTime;
          evidence.push(`BROKEN_DOWN_AT_${candle.openTime.toISOString()}`);
        } else if (interaction === 'REJECTION') {
          lifecycle = 'TESTED';
          rejectionCount += 1;
          lastTouchedAt = candle.openTime;
          lastRespectedAt = candle.openTime;
          lastRespectedIndex = i;
          evidence.push(`TESTED_AT_${candle.openTime.toISOString()}`);
        } else if (interaction === 'NOISY') {
          noisyCrossCount += 1;
        }
        break;
      }

      case 'BROKEN': {
        if (
          zone.originalRole === 'RESISTANCE' &&
          breakDirection === 'UP' &&
          interaction === 'RETEST_FROM_ABOVE_HELD'
        ) {
          role = 'SUPPORT';
          lifecycle = 'FLIPPED';
          flippedAt = candle.openTime;
          lastRespectedAt = candle.openTime;
          lastRespectedIndex = i;
          rejectionCount += 1;
          evidence.push(`FLIPPED_TO_SUPPORT_AT_${candle.openTime.toISOString()}`);
        } else if (
          zone.originalRole === 'SUPPORT' &&
          breakDirection === 'DOWN' &&
          interaction === 'RETEST_FROM_BELOW_REJECTED'
        ) {
          role = 'RESISTANCE';
          lifecycle = 'FLIPPED';
          flippedAt = candle.openTime;
          lastRespectedAt = candle.openTime;
          lastRespectedIndex = i;
          rejectionCount += 1;
          evidence.push(`FLIPPED_TO_RESISTANCE_AT_${candle.openTime.toISOString()}`);
        } else if (interaction === 'NOISY') {
          noisyCrossCount += 1;
        }
        break;
      }

      case 'FLIPPED': {
        if (interaction === 'FLIPPED_ZONE_LOST') {
          lifecycle = 'INVALIDATED';
          invalidatedAt = candle.openTime;
          evidence.push(`INVALIDATED_FLIPPED_LOST_AT_${candle.openTime.toISOString()}`);
        } else if (interaction === 'REJECTION') {
          rejectionCount += 1;
          lastTouchedAt = candle.openTime;
          lastRespectedAt = candle.openTime;
          lastRespectedIndex = i;
        } else if (interaction === 'NOISY') {
          noisyCrossCount += 1;
        }

        if (lifecycle !== 'INVALIDATED' && noisyCrossCount >= config.maxNoisyCrossesBeforeInvalidation) {
          lifecycle = 'INVALIDATED';
          invalidatedAt = candle.openTime;
          evidence.push(`INVALIDATED_NOISY_AT_${candle.openTime.toISOString()}`);
        }
        break;
      }

      case 'INVALIDATED':
        break;
    }

    if (lifecycle !== 'INVALIDATED' && noisyCrossCount >= config.maxNoisyCrossesBeforeInvalidation) {
      lifecycle = 'INVALIDATED';
      invalidatedAt = candle.openTime;
      evidence.push(`INVALIDATED_NOISY_AT_${candle.openTime.toISOString()}`);
    }

    if (
      lifecycle !== 'INVALIDATED' &&
      (noisyTouchSessions >= config.maxNoisyTouchSessionsBeforeInvalidation ||
        passThroughCount >= config.maxPassThroughBeforeInvalidation)
    ) {
      lifecycle = 'INVALIDATED';
      invalidatedAt = candle.openTime;
      evidence.push(`INVALIDATED_TOUCH_QUALITY_AT_${candle.openTime.toISOString()}`);
    }

    wasInsideZone = touched;
  }

  const touchAccounting: ZoneTouchAccountingV2 = {
    touchSessions: touchCount,
    mitigationSessions: Math.max(0, touchCount - cleanTouchSessions - passThroughCount),
    trueTestSessions: cleanTouchSessions,
    cleanTouchSessions,
    noisyTouchSessions,
    passThroughCount,
  };
  if (lastRespectedAt !== undefined) {
    touchAccounting.lastTrueTestAt = lastRespectedAt;
  }
  if (lastRespectedIndex !== undefined) {
    touchAccounting.lastTrueTestIndex = lastRespectedIndex;
  }

  const result: ZoneLifecycleResult = {
    role,
    lifecycle,
    touchCount,
    rejectionCount,
    breakCount,
    noisyCrossCount,
    cleanTouchSessions,
    noisyTouchSessions,
    passThroughCount,
    evidence,
    warnings,
    touchAccounting,
  };

  if (lastTouchedAt !== undefined) result.lastTouchedAt = lastTouchedAt;
  if (lastRespectedAt !== undefined) result.lastRespectedAt = lastRespectedAt;
  if (lastRespectedIndex !== undefined) result.lastRespectedIndex = lastRespectedIndex;
  if (brokenAt !== undefined) result.brokenAt = brokenAt;
  if (flippedAt !== undefined) result.flippedAt = flippedAt;
  if (invalidatedAt !== undefined) result.invalidatedAt = invalidatedAt;
  if (reactionQuality !== undefined) result.reactionQuality = reactionQuality;

  return result;
}

function isPassThroughTouch(input: {
  zone: StructureZone;
  role: StructureZoneRole;
  candle: Candle;
  breakBuffer: number;
}): boolean {
  if (input.role === 'SUPPORT') return input.candle.close < input.zone.low - input.breakBuffer;
  return input.candle.close > input.zone.high + input.breakBuffer;
}

export function intersectsZone(candle: Candle, zone: StructureZone): boolean {
  return candle.low <= zone.high && candle.high >= zone.low;
}

function classifyInteraction(input: {
  zone: StructureZone;
  role: StructureZoneRole;
  candle: Candle;
  previousCandle?: Candle;
  breakBuffer: number;
  reclaimBuffer: number;
  lifecycle: ZoneLifecycle;
  breakDirection?: BreakDirection;
}): InteractionType {
  const { zone, role, candle, previousCandle, breakBuffer, reclaimBuffer, lifecycle, breakDirection } = input;
  const touched = intersectsZone(candle, zone);
  const previousClose = previousCandle?.close ?? candle.open;

  if (lifecycle === 'BROKEN') {
    if (breakDirection === 'UP') {
      if (touched && previousClose > zone.high && candle.close > zone.mid + reclaimBuffer) {
        return 'RETEST_FROM_ABOVE_HELD';
      }
      return touched ? 'NOISY' : 'NONE';
    }

    if (breakDirection === 'DOWN') {
      if (touched && previousClose < zone.low && candle.close < zone.mid - reclaimBuffer) {
        return 'RETEST_FROM_BELOW_REJECTED';
      }
      return touched ? 'NOISY' : 'NONE';
    }
  }

  if (lifecycle === 'FLIPPED') {
    if (role === 'SUPPORT' && candle.close < zone.low - breakBuffer) return 'FLIPPED_ZONE_LOST';
    if (role === 'RESISTANCE' && candle.close > zone.high + breakBuffer) return 'FLIPPED_ZONE_LOST';
  }

  const breakRole = lifecycle === 'FRESH' || lifecycle === 'TESTED' ? zone.originalRole : role;
  if (breakRole === 'RESISTANCE' && candle.close > zone.high + breakBuffer) return 'BREAK_UP';
  if (breakRole === 'SUPPORT' && candle.close < zone.low - breakBuffer) return 'BREAK_DOWN';

  if (!touched) return 'NONE';

  if (role === 'SUPPORT') {
    if (previousClose >= zone.high && candle.close > zone.high) return 'REJECTION';
    return 'NOISY';
  }

  if (previousClose <= zone.low && candle.close < zone.low) return 'REJECTION';
  return 'NOISY';
}
