import type { Candle } from './primitives.js';
import type { FreshnessState, ReactionStrength, StructureZone, ZoneAbsorptionEvidence, ZoneEvidence, ZoneObviousness, ZoneQuality, StructureWarning } from './sr.types.js';
import type { SupportResistanceConfig } from './sr-config.js';
import { resolveSupportResistanceConfig } from './sr-config.js';

export function evaluateZoneQuality(input: {
  zone: StructureZone;
  candles: readonly Candle[];
  currentPrice: number;
  atr?: number;
  config?: Partial<SupportResistanceConfig>;
  // v2.2 optional evidence
  freshnessState?: FreshnessState;
  absorptionEvidence?: ZoneAbsorptionEvidence;
}): {
  quality: ZoneQuality;
  score: number;
  reasons: string[];
  warnings: StructureWarning[];
  structuredEvidence: ZoneEvidence;
} {
  const { zone, currentPrice } = input;
  const config = resolveSupportResistanceConfig(input.config);
  const warnings: StructureWarning[] = [];
  const reasons: string[] = [];

  if (zone.lifecycle === 'INVALIDATED') {
    return {
      quality: 'LOW',
      score: 0,
      reasons: ['INVALIDATED'],
      warnings,
      structuredEvidence: buildStructuredEvidence({ zone, input, warnings, reasons: ['INVALIDATED'] }),
    };
  }

  let score = 4;

  const touchContribution = Math.min(zone.touchCount, 3) * 0.5;
  if (touchContribution > 0) {
    score += touchContribution;
    reasons.push('TOUCH_COUNT_CAPPED');
    if (zone.touchCount >= 2) reasons.push('TOUCH_COUNT_GTE_2');
    if (zone.touchCount >= 3) reasons.push('TOUCH_COUNT_GTE_3');
  }

  const effectiveRejectionCount = Math.min(
    zone.rejectionCount,
    zone.cleanTouchSessions ?? zone.touchCount
  );
  const rejectionContribution = Math.min(effectiveRejectionCount, 3) * 0.75;
  if (rejectionContribution > 0) {
    score += rejectionContribution;
    reasons.push('REJECTION_COUNT_CAPPED');
    if (effectiveRejectionCount >= 2) reasons.push('REJECTION_COUNT_GTE_2');
  }

  if (zone.lifecycle === 'FLIPPED') {
    score += 1.5;
    reasons.push('LIFECYCLE_FLIPPED');
    score += 1.25;
    reasons.push('ZONE_ROLE_REVERSAL_CONFIRMED');
  }
  if (zone.lifecycle === 'TESTED') {
    score += 0.75;
    reasons.push('LIFECYCLE_TESTED');
  }

  if (zone.noisyCrossCount === 0) {
    reasons.push('NO_NOISY_CROSSES');
  }

  const cleanTouchSessions = zone.cleanTouchSessions ?? 0;
  const noisyTouchSessions = zone.noisyTouchSessions ?? 0;
  const passThroughCount = zone.passThroughCount ?? 0;
  if (cleanTouchSessions > 0) {
    score += Math.min(cleanTouchSessions, 3) * 0.5;
    reasons.push('CLEAN_TOUCH_SESSIONS_CAPPED');
  }
  if (noisyTouchSessions > 0) {
    score -= noisyTouchSessions * 0.5;
    reasons.push('NOISY_TOUCH_SESSIONS_PENALTY');
  }
  if (passThroughCount > 0) {
    score -= passThroughCount;
    reasons.push('PASS_THROUGH_COUNT_PENALTY');
  }
  if (noisyTouchSessions >= config.maxNoisyTouchSessionsBeforeInvalidation) {
    warnings.push('ZONE_TOO_NOISY');
  }
  if (passThroughCount >= config.maxPassThroughBeforeInvalidation) {
    warnings.push('ZONE_REPEATED_PASS_THROUGH');
  }

  applyReactionScore(zone.reactionQuality?.reactionStrength ?? 'NONE', { reasons, warnings, add: (value) => { score += value; } });

  if (zone.widthPct <= 0.5) {
    reasons.push('REASONABLE_WIDTH');
  }

  if (zone.breakCount === 0) {
    reasons.push('NO_BREAKS');
  }

  if (zone.widthAtr !== undefined && zone.widthAtr <= 0.5) {
    score += 0.5;
    reasons.push('WIDTH_ATR_LTE_0_5');
  }

  if (zone.warnings.includes('ZONE_TOO_WIDE') || zone.widthPct > 0.5) {
    score -= 2;
    warnings.push('ZONE_TOO_WIDE');
    reasons.push('ZONE_TOO_WIDE_PENALTY');
  }
  if (zone.warnings.includes('ZONE_TOO_NARROW_EXPANDED')) {
    score -= 0.5;
    warnings.push('ZONE_TOO_NARROW_EXPANDED');
    reasons.push('ZONE_TOO_NARROW_EXPANDED_PENALTY');
  }

  if (zone.noisyCrossCount >= 2) {
    score -= 1.5;
    reasons.push('NOISY_CROSS_GTE_2_PENALTY');
  }
  if (zone.noisyCrossCount >= 4) {
    score -= 2.5;
    reasons.push('NOISY_CROSS_GTE_4_PENALTY');
  }

  if (zone.breakCount > 1) {
    score -= 1;
    reasons.push('BREAK_COUNT_GT_1_PENALTY');
  }

  if (zone.lifecycle === 'BROKEN') {
    score -= 3;
    reasons.push('BROKEN_PENALTY');
  }

  if (currentPrice >= zone.low && currentPrice <= zone.high) {
    score -= 0.5;
    reasons.push('PRICE_INSIDE_ZONE_PENALTY');
  }

  const freshnessStartIndex = zone.lastRespectedIndex ?? zone.availableFromIndex;
  const zoneAgeBars = Math.max(0, input.candles.length - 1 - freshnessStartIndex);
  const recentlyRespected = zone.lastRespectedIndex !== undefined && zoneAgeBars <= config.recentRespectWindowBars;
  if (recentlyRespected) {
    score += 0.75;
    reasons.push('ZONE_RECENTLY_RESPECTED');
  } else {
    score -= 0.5;
    warnings.push('ZONE_NO_RECENT_RESPECT');
    reasons.push('ZONE_NO_RECENT_RESPECT_PENALTY');
  }
  if (zoneAgeBars > config.maxRelevantZoneAgeBars) {
    score -= 1;
    reasons.push('OLD_ZONE_PENALTY');
  }

  score = Math.round(clamp(score, 0, 10) * 10) / 10;

  // Score caps: WEAK/NONE reaction, incomplete window, passThrough, or noisy → never HIGH
  const reactionStrengthForCap = zone.reactionQuality?.reactionStrength ?? 'NONE';
  const windowComplete = zone.reactionQuality?.reactionWindowComplete !== false;
  const isFlipped = zone.lifecycle === 'FLIPPED';
  const noisyForCap =
    (zone.noisyTouchSessions ?? 0) >= config.maxNoisyTouchSessionsBeforeInvalidation ||
    zone.noisyCrossCount >= config.maxNoisyCrossesBeforeInvalidation;
  const tooWideForCap = zone.warnings.includes('ZONE_TOO_WIDE') || warnings.includes('ZONE_TOO_WIDE') || zone.widthPct > 0.5;
  const obviousnessForCap = deriveObviousness({
    majorSwingExtreme: zone.origin === 'SWING_HIGH' || zone.origin === 'SWING_LOW' || zone.origin === 'RANGE_HIGH' || zone.origin === 'RANGE_LOW',
    cleanTouchSessions,
    reactionStrength: reactionStrengthForCap,
    recentlyRespected,
    tooWide: tooWideForCap,
    noisy: noisyForCap,
    config,
  });

  if (reactionStrengthForCap === 'NONE') {
    score = Math.min(score, 6.9);
    reasons.push(isFlipped ? 'SCORE_CAP_FLIPPED_REACTION_NONE' : 'SCORE_CAP_REACTION_NONE');
  }
  if (reactionStrengthForCap === 'WEAK') {
    score = Math.min(score, 6.9);
    reasons.push('SCORE_CAP_REACTION_WEAK');
  }
  if (!windowComplete) {
    score = Math.min(score, 6.9);
    reasons.push('SCORE_CAP_INCOMPLETE_REACTION_WINDOW');
  }
  if (!isFlipped && (zone.touchCount === 0 || (zone.cleanTouchSessions ?? 0) === 0)) {
    score = Math.min(score, 6.9);
    reasons.push('SCORE_CAP_NO_CLEAN_TOUCH');
  }
  if (!isFlipped && obviousnessForCap === 'LOW') {
    score = Math.min(score, 6.9);
    reasons.push('SCORE_CAP_LOW_OBVIOUSNESS');
  }
  if ((zone.passThroughCount ?? 0) > 0) {
    score = Math.min(score, 6.9);
    reasons.push('SCORE_CAP_PASS_THROUGH');
  }
  if (noisyForCap) {
    score = Math.min(score, 6.9);
    reasons.push('SCORE_CAP_NOISY_ZONE');
  }

  // v2.2 freshness/absorption adjustments — applied before wide zone hard cap
  const freshnessState = input.freshnessState;
  const absorptionEvidence = input.absorptionEvidence;

  if (freshnessState === 'FRESH_WEAK_ORIGIN') {
    score -= 0.25;
    warnings.push('FRESH_WEAK_ORIGIN');
    reasons.push('FRESH_WEAK_ORIGIN');
  }
  if (freshnessState === 'MITIGATED_NO_REACTION') {
    warnings.push('ZONE_MITIGATED_NO_REACTION');
    reasons.push('ZONE_MITIGATED_NO_REACTION');
  }
  if (freshnessState === 'STALE_UNTOUCHED') {
    score = Math.min(score, 6.9);
    warnings.push('STALE_UNTOUCHED_ZONE');
    reasons.push('STALE_UNTOUCHED_ZONE');
  }
  if (freshnessState === 'EXHAUSTED') {
    score = Math.min(score, 3.9);
    warnings.push('EXHAUSTED_ZONE');
    reasons.push('EXHAUSTED_ZONE');
  }
  if (absorptionEvidence?.absorptionRisk === 'HIGH') {
    warnings.push('ZONE_MULTI_TESTED_ORDER_ABSORPTION_RISK');
    reasons.push('ZONE_MULTI_TESTED_ORDER_ABSORPTION_RISK');
  }
  if (absorptionEvidence?.absorptionRisk === 'HIGH_BUT_REBUILDING') {
    warnings.push('ZONE_RELOAD_LIKELY');
    reasons.push('ZONE_RELOAD_LIKELY');
  }

  // Hard cap for wide zones — applied after all positive contributions, including FLIPPED lifecycle bonus.
  if (tooWideForCap) {
    score = Math.min(score, config.wideZoneScoreCap);
    reasons.push('SCORE_CAP_ZONE_TOO_WIDE');
  }
  score = Math.round(clamp(score, 0, 10) * 10) / 10;

  let quality: ZoneQuality;
  if (score >= 7) quality = 'HIGH';
  else if (score >= 4) quality = 'MEDIUM';
  else quality = 'LOW';

  const structuredEvidence = buildStructuredEvidence({ zone, input, warnings, reasons });
  return { quality, score, reasons, warnings, structuredEvidence };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function applyReactionScore(
  strength: ReactionStrength,
  output: {
    reasons: string[];
    warnings: StructureWarning[];
    add(value: number): void;
  }
): void {
  if (strength === 'STRONG') {
    output.add(1.25);
    output.reasons.push('ZONE_STRONG_REACTION');
  } else if (strength === 'NORMAL') {
    output.add(0.75);
    output.reasons.push('ZONE_NORMAL_REACTION');
  } else if (strength === 'WEAK') {
    output.add(0.25);
    output.reasons.push('ZONE_WEAK_REACTION');
  } else {
    output.add(-0.5);
    output.warnings.push('ZONE_NO_STRONG_REACTION');
    output.reasons.push('ZONE_NO_STRONG_REACTION_PENALTY');
  }
}

function buildStructuredEvidence(input: {
  zone: StructureZone;
  input: {
    candles: readonly Candle[];
    currentPrice: number;
    atr?: number;
    config?: Partial<SupportResistanceConfig>;
  };
  warnings: StructureWarning[];
  reasons: string[];
}): ZoneEvidence {
  const { zone } = input;
  const config = resolveSupportResistanceConfig(input.input.config);
  const freshnessStartIndex = zone.lastRespectedIndex ?? zone.availableFromIndex;
  const candlesSinceLastRespect = Math.max(0, input.input.candles.length - 1 - freshnessStartIndex);
  const recentlyRespected = zone.lastRespectedIndex !== undefined && candlesSinceLastRespect <= config.recentRespectWindowBars;
  const cleanTouchSessions = zone.cleanTouchSessions ?? 0;
  const noisyTouchSessions = zone.noisyTouchSessions ?? 0;
  const passThroughCount = zone.passThroughCount ?? 0;
  const tooWide = zone.warnings.includes('ZONE_TOO_WIDE') || input.warnings.includes('ZONE_TOO_WIDE') || zone.widthPct > 0.5;
  const tooNarrowExpanded = zone.warnings.includes('ZONE_TOO_NARROW_EXPANDED') || input.warnings.includes('ZONE_TOO_NARROW_EXPANDED');
  const hasNoisyTouches = noisyTouchSessions >= config.maxNoisyTouchSessionsBeforeInvalidation;
  const hasNoisyCrosses = (zone.noisyCrossCount ?? 0) >= config.maxNoisyCrossesBeforeInvalidation;
  const hasPassThrough = passThroughCount > 0;
  const noisy = hasNoisyTouches || hasNoisyCrosses;
  const majorSwingExtreme = zone.origin === 'SWING_HIGH' || zone.origin === 'SWING_LOW' || zone.origin === 'RANGE_HIGH' || zone.origin === 'RANGE_LOW';
  const roleReversalConfirmed = zone.lifecycle === 'FLIPPED';
  const reactionStrength = zone.reactionQuality?.reactionStrength ?? 'NONE';
  const obviousness = deriveObviousness({
    majorSwingExtreme,
    cleanTouchSessions,
    reactionStrength,
    recentlyRespected,
    tooWide,
    noisy,
    config,
  });
  const notes = [...new Set(input.reasons)];
  if (roleReversalConfirmed) notes.push('Former level confirmed as flipped zone');
  if (recentlyRespected) notes.push('Recently respected');
  if (zone.reactionQuality !== undefined && zone.reactionQuality.reactionStrength !== 'NONE') {
    notes.push(`Reaction strength ${zone.reactionQuality.reactionStrength}`);
  }

  const evidence: ZoneEvidence = {
    majorSwingExtreme,
    touchSessions: zone.touchCount,
    cleanTouchSessions,
    noisyTouchSessions,
    passThroughCount,
    roleReversalConfirmed,
    recentlyRespected,
    obviousness,
    tooWide,
    tooNarrowExpanded,
    hasNoisyTouches,
    hasNoisyCrosses,
    hasPassThrough,
    noisy,
    notes,
  };
  if (zone.reactionQuality?.moveAwayAtr !== undefined) {
    evidence.strongestReactionAtr = zone.reactionQuality.moveAwayAtr;
    evidence.averageReactionAtr = zone.reactionQuality.moveAwayAtr;
  }
  if (zone.reactionQuality?.moveAwayPct !== undefined) {
    evidence.strongestReactionPct = zone.reactionQuality.moveAwayPct;
  }
  if (zone.lastRespectedAt !== undefined) evidence.lastRespectedAt = zone.lastRespectedAt;
  if (zone.lastRespectedIndex !== undefined) evidence.lastRespectedIndex = zone.lastRespectedIndex;
  if (zone.lastRespectedIndex !== undefined) evidence.candlesSinceLastRespect = candlesSinceLastRespect;
  return evidence;
}

function deriveObviousness(input: {
  majorSwingExtreme: boolean;
  cleanTouchSessions: number;
  reactionStrength: ReactionStrength;
  recentlyRespected: boolean;
  tooWide: boolean;
  noisy: boolean;
  config: SupportResistanceConfig;
}): ZoneObviousness {
  const hasNormalOrStrongReaction = input.reactionStrength === 'NORMAL' || input.reactionStrength === 'STRONG';
  if (
    input.majorSwingExtreme &&
    input.cleanTouchSessions >= input.config.obviousnessMinCleanTouches &&
    hasNormalOrStrongReaction &&
    input.recentlyRespected &&
    !input.tooWide &&
    !input.noisy
  ) {
    return 'HIGH';
  }
  if (
    input.majorSwingExtreme &&
    (input.cleanTouchSessions >= 1 || input.reactionStrength !== 'NONE') &&
    !input.tooWide
  ) {
    return 'MEDIUM';
  }
  return 'LOW';
}
