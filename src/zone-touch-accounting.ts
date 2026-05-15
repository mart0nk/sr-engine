import type { Candle } from './primitives.js';
import type { StructureZone, ZoneTouchAccountingV2, ReactionStrength } from './sr.types.js';
import type { SupportResistanceConfig } from './sr-config.js';
import { evaluateReactionQuality } from './zone-reaction-quality.js';

function enteredZone(candle: Candle, zone: StructureZone): boolean {
  return candle.low <= zone.high && candle.high >= zone.low;
}

function closedAwayFromZone(candle: Candle, zone: StructureZone): boolean {
  if (zone.role === 'SUPPORT') return candle.close > zone.high;
  return candle.close < zone.low;
}

function meetsReactionThreshold(
  strength: ReactionStrength,
  minStrength: 'WEAK' | 'NORMAL' | 'STRONG',
): boolean {
  const order: ReactionStrength[] = ['NONE', 'WEAK', 'NORMAL', 'STRONG'];
  const minIndex = order.indexOf(minStrength);
  const actualIndex = order.indexOf(strength);
  return actualIndex >= minIndex;
}

export function evaluateZoneTouchAccountingV2(args: {
  zone: StructureZone;
  candles: readonly Candle[];
  startIndex: number;
  atr: number;
  config: SupportResistanceConfig;
}): ZoneTouchAccountingV2 {
  const { zone, candles, startIndex, atr, config } = args;

  let touchSessions = 0;
  let mitigationSessions = 0;
  let trueTestSessions = 0;
  let cleanTouchSessions = 0;
  let noisyTouchSessions = 0;
  let passThroughCount = 0;
  let lastMitigatedAt: Date | undefined;
  let lastMitigatedIndex: number | undefined;
  let lastTrueTestAt: Date | undefined;
  let lastTrueTestIndex: number | undefined;

  let wasInsideZone = false;

  const start = Math.max(startIndex, 0);

  for (let i = start; i < candles.length; i++) {
    const candle = candles[i];
    if (candle === undefined) continue;

    const inside = enteredZone(candle, zone);

    if (inside && !wasInsideZone) {
      // First candle of a new session
      touchSessions += 1;

      const quality = evaluateReactionQuality({
        zone,
        candles,
        touchIndex: i,
        atr,
        config,
      });

      const closedAway = closedAwayFromZone(candle, zone);
      const isTrueTest =
        closedAway && meetsReactionThreshold(quality.reactionStrength, config.trueTestMinReactionStrength);

      if (isTrueTest) {
        trueTestSessions += 1;
        lastTrueTestAt = candle.openTime;
        lastTrueTestIndex = i;
        cleanTouchSessions += 1;
      } else {
        mitigationSessions += 1;
        lastMitigatedAt = candle.openTime;
        lastMitigatedIndex = i;

        // Distinguish noisy vs pass-through
        const isPassThrough =
          zone.role === 'SUPPORT'
            ? candle.close < zone.low
            : candle.close > zone.high;

        if (isPassThrough) {
          passThroughCount += 1;
        } else {
          noisyTouchSessions += 1;
        }
      }
    }

    wasInsideZone = inside;
  }

  const result: ZoneTouchAccountingV2 = {
    touchSessions,
    mitigationSessions,
    trueTestSessions,
    cleanTouchSessions,
    noisyTouchSessions,
    passThroughCount,
  };

  if (lastMitigatedAt !== undefined) result.lastMitigatedAt = lastMitigatedAt;
  if (lastMitigatedIndex !== undefined) result.lastMitigatedIndex = lastMitigatedIndex;
  if (lastTrueTestAt !== undefined) result.lastTrueTestAt = lastTrueTestAt;
  if (lastTrueTestIndex !== undefined) result.lastTrueTestIndex = lastTrueTestIndex;

  return result;
}
