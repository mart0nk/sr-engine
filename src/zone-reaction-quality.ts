import type { Candle } from './primitives.js';
import type { ReactionQuality, ReactionStrength, StructureZone } from './sr.types.js';
import type { SupportResistanceConfig } from './sr-config.js';
import { resolveSupportResistanceConfig } from './sr-config.js';

export function evaluateReactionQuality(input: {
  zone: StructureZone;
  candles: readonly Candle[];
  touchIndex: number;
  atr?: number;
  config?: Partial<SupportResistanceConfig>;
}): ReactionQuality {
  const config = resolveSupportResistanceConfig(input.config);
  const touchCandle = input.candles[input.touchIndex];
  const empty = emptyReaction(config.reactionLookaheadCandles);
  if (touchCandle === undefined || touchCandle.closed !== true || !intersectsZone(touchCandle, input.zone)) {
    return empty;
  }

  const lastClosedIndex = findLastClosedIndex(input.candles);
  if (lastClosedIndex < input.touchIndex) return empty;

  const requestedEndIndex = input.touchIndex + config.reactionLookaheadCandles;
  const endIndex = Math.min(requestedEndIndex, lastClosedIndex);
  const reactionWindowComplete = requestedEndIndex <= lastClosedIndex;
  const isSupport = input.zone.role === 'SUPPORT';

  // Check for same-bar rejection: touch candle closes away from the zone
  const sameBarClosedAway = isSupport
    ? touchCandle.close > input.zone.high
    : touchCandle.close < input.zone.low;

  // Post-touch window: candles AFTER the touch candle (excludes touch candle itself)
  // Guarantees postTouchWindow.length <= reactionLookaheadCandles
  const postTouchWindow = input.candles
    .slice(input.touchIndex + 1, endIndex + 1)
    .filter((candle) => candle.closed === true);

  // moveAway uses full window [touchIndex..endIndex] for max high / min low
  const fullWindow = input.candles
    .slice(input.touchIndex, endIndex + 1)
    .filter((candle) => candle.closed === true);
  if (fullWindow.length === 0) return empty;

  const moveAway = isSupport
    ? Math.max(...fullWindow.map((candle) => candle.high)) - input.zone.high
    : input.zone.low - Math.min(...fullWindow.map((candle) => candle.low));
  const positiveMoveAway = Math.max(0, moveAway);
  const reference = isSupport ? input.zone.high : input.zone.low;
  const moveAwayPct = reference > 0 ? positiveMoveAway / reference * 100 : 0;
  const moveAwayAtr = input.atr !== undefined && input.atr > 0 ? positiveMoveAway / input.atr : undefined;

  let closedAwayFromZone: boolean;
  let candlesToReact: number;

  if (sameBarClosedAway) {
    // Same-bar rejection (bullish pinbar / doji touches zone and closes away): candlesToReact = 0
    closedAwayFromZone = true;
    candlesToReact = 0;
  } else {
    // Search post-touch window for first candle that closes away
    const closedAwayIndex = postTouchWindow.findIndex((candle) =>
      isSupport ? candle.close > input.zone.high : candle.close < input.zone.low
    );
    closedAwayFromZone = closedAwayIndex >= 0;
    // postTouchWindow.length <= reactionLookaheadCandles → candlesToReact <= reactionWindowCandles
    candlesToReact = closedAwayFromZone ? closedAwayIndex + 1 : postTouchWindow.length;
  }

  const rejectedFromZone = closedAwayFromZone && positiveMoveAway > 0;
  let reactionStrength = classifyStrength({
    closedAwayFromZone,
    moveAwayPct,
    config,
    ...(moveAwayAtr !== undefined ? { moveAwayAtr } : {}),
  });

  if (!reactionWindowComplete && (reactionStrength === 'NORMAL' || reactionStrength === 'STRONG')) {
    reactionStrength = 'WEAK';
  }

  const result: ReactionQuality = {
    touchedZone: true,
    rejectedFromZone,
    closedAwayFromZone,
    moveAwayPct,
    candlesToReact,
    reactionWindowCandles: config.reactionLookaheadCandles,
    reactionWindowComplete,
    reactionStrength,
  };
  if (moveAwayAtr !== undefined) result.moveAwayAtr = moveAwayAtr;
  return result;
}

function classifyStrength(input: {
  closedAwayFromZone: boolean;
  moveAwayAtr?: number;
  moveAwayPct: number;
  config: SupportResistanceConfig;
}): ReactionStrength {
  if (!input.closedAwayFromZone) return 'NONE';
  if (input.moveAwayAtr !== undefined) {
    if (input.moveAwayAtr >= input.config.strongReactionAtr) return 'STRONG';
    if (input.moveAwayAtr >= input.config.normalReactionAtr) return 'NORMAL';
    if (input.moveAwayAtr >= input.config.weakReactionAtr) return 'WEAK';
    return 'NONE';
  }
  if (input.moveAwayPct >= input.config.strongReactionPct) return 'STRONG';
  if (input.moveAwayPct >= input.config.normalReactionPct) return 'NORMAL';
  if (input.moveAwayPct >= input.config.weakReactionPct) return 'WEAK';
  return 'NONE';
}

function findLastClosedIndex(candles: readonly Candle[]): number {
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i]?.closed === true) return i;
  }
  return -1;
}

function emptyReaction(reactionWindowCandles: number): ReactionQuality {
  return {
    touchedZone: false,
    rejectedFromZone: false,
    closedAwayFromZone: false,
    moveAwayPct: 0,
    candlesToReact: 0,
    reactionWindowCandles,
    reactionWindowComplete: false,
    reactionStrength: 'NONE',
  };
}

function intersectsZone(candle: Candle, zone: StructureZone): boolean {
  return candle.low <= zone.high && candle.high >= zone.low;
}
