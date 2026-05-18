export type ZoneConstructionPolicy =
  | 'WICK_TO_BODY'
  | 'FULL_CANDLE'
  | 'BODY_TO_BODY'
  | 'ATR_AROUND_PIVOT';

export type SupportResistanceConfig = {
  pivotLeftBars: number;
  pivotRightBars: number;

  zoneConstructionPolicy: ZoneConstructionPolicy;

  minWidthTicks: number;
  minWidthPct: number;

  maxWidthPct: number;
  maxWidthAtrMultiplier: number;

  breakBufferTicks: number;
  breakBufferPct: number;

  reclaimBufferTicks: number;
  reclaimBufferPct: number;

  mergeDistancePct: number;
  mergeDistanceAtrMultiplier: number;

  maxNoisyCrossesBeforeInvalidation: number;
  maxNoisyTouchSessionsBeforeInvalidation: number;
  maxPassThroughBeforeInvalidation: number;
  maxRelevantZoneAgeBars: number;

  wideZoneScoreCap: number;
  rangeBoxWidthPct: number;
  wideZonePolicy: 'KEEP_AS_SR' | 'CONTEXT_ONLY' | 'DROP';

  oppositeRoleMinGapTicks: number;
  oppositeRoleMinGapPct: number;
  oppositeRoleMinGapAtr: number;

  noCleanRangeMinGapTicks: number;
  noCleanRangeMinGapPct: number;
  noCleanRangeMinGapAtr: number;

  zoneTierActionableMinScore: number;
  zoneTierWatchableMinScore: number;
  zoneTierContextMinScore: number;

  // v2.2 origin validation
  originBosLookaheadCandles: number;
  originDisplacementAtrThreshold: number;
  originDisplacementPctThreshold: number;
  originVolumeMultiplier: number;

  // v2.2 freshness / test model
  staleUntouchedCandles: number;
  trueTestMinReactionStrength: 'WEAK' | 'NORMAL' | 'STRONG';
  multiTestAbsorptionThreshold: number;

  // v2.2 liquidity rebuild
  baseMinCandles: number;
  baseMaxRangeAtr: number;
  baseZoneOverlapPct: number;
  roundLevelBps: number;
  reloadVolumeMultiplier: number;
  sweepReclaimLookbackCandles: number;

  reactionLookaheadCandles: number;
  weakReactionAtr: number;
  normalReactionAtr: number;
  strongReactionAtr: number;
  weakReactionPct: number;
  normalReactionPct: number;
  strongReactionPct: number;
  recentRespectWindowBars: number;
  obviousnessMinCleanTouches: number;

  minCandlesForReady: number;
};

// Keep StructureConfig as an alias for backward compatibility within app
export type StructureConfig = SupportResistanceConfig;

export const DEFAULT_SUPPORT_RESISTANCE_CONFIG: SupportResistanceConfig = {
  pivotLeftBars: 2,
  pivotRightBars: 2,

  zoneConstructionPolicy: 'WICK_TO_BODY',

  minWidthTicks: 2,
  minWidthPct: 0.0005,

  maxWidthPct: 0.0035,
  maxWidthAtrMultiplier: 0.5,

  breakBufferTicks: 2,
  breakBufferPct: 0.0005,

  reclaimBufferTicks: 2,
  reclaimBufferPct: 0.0005,

  mergeDistancePct: 0.002,
  mergeDistanceAtrMultiplier: 0.25,

  maxNoisyCrossesBeforeInvalidation: 4,
  maxNoisyTouchSessionsBeforeInvalidation: 3,
  maxPassThroughBeforeInvalidation: 2,
  maxRelevantZoneAgeBars: 300,

  wideZoneScoreCap: 5.9,
  rangeBoxWidthPct: 0.7,
  wideZonePolicy: 'CONTEXT_ONLY' as const,

  oppositeRoleMinGapTicks: 3,
  oppositeRoleMinGapPct: 0.001,
  oppositeRoleMinGapAtr: 0.15,

  noCleanRangeMinGapTicks: 3,
  noCleanRangeMinGapPct: 0.001,
  noCleanRangeMinGapAtr: 0.15,

  zoneTierActionableMinScore: 75,
  zoneTierWatchableMinScore: 50,
  zoneTierContextMinScore: 30,

  originBosLookaheadCandles: 12,
  originDisplacementAtrThreshold: 1.0,
  originDisplacementPctThreshold: 0.35,
  originVolumeMultiplier: 1.3,

  staleUntouchedCandles: 300,
  trueTestMinReactionStrength: 'NORMAL' as const,
  multiTestAbsorptionThreshold: 2,

  baseMinCandles: 6,
  baseMaxRangeAtr: 0.75,
  baseZoneOverlapPct: 0.4,
  roundLevelBps: 15,
  reloadVolumeMultiplier: 1.2,
  sweepReclaimLookbackCandles: 20,

  reactionLookaheadCandles: 5,
  weakReactionAtr: 0.25,
  normalReactionAtr: 0.75,
  strongReactionAtr: 1.5,
  weakReactionPct: 0.15,
  normalReactionPct: 0.35,
  strongReactionPct: 0.75,
  recentRespectWindowBars: 80,
  obviousnessMinCleanTouches: 2,

  minCandlesForReady: 80,
};

// Keep DEFAULT_STRUCTURE_CONFIG as an alias for backward compatibility
export const DEFAULT_STRUCTURE_CONFIG = DEFAULT_SUPPORT_RESISTANCE_CONFIG;

export function resolveSupportResistanceConfig(
  overrides?: Partial<SupportResistanceConfig>
): SupportResistanceConfig {
  return {
    ...DEFAULT_SUPPORT_RESISTANCE_CONFIG,
    ...overrides,
  };
}

// Keep resolveStructureConfig as an alias for backward compatibility
export const resolveStructureConfig = resolveSupportResistanceConfig;
