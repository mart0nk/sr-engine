import type { Timeframe, PriceSource } from './primitives.js';

export type { PriceSource };

export type StructureZoneRole = 'SUPPORT' | 'RESISTANCE';

export type ZoneLifecycle =
  | 'FRESH'
  | 'TESTED'
  | 'BROKEN'
  | 'FLIPPED'
  | 'INVALIDATED';

export type ZoneOrigin =
  | 'SWING_HIGH'
  | 'SWING_LOW'
  // Deprecated: not emitted as zone.origin. Use zone.rangeBoundaryEvidence.role instead.
  | 'RANGE_HIGH'
  // Deprecated: not emitted as zone.origin. Use zone.rangeBoundaryEvidence.role instead.
  | 'RANGE_LOW'
  | 'BREAKOUT_LEVEL'
  | 'BREAKDOWN_LEVEL'
  | 'RETEST_LEVEL'
  | 'CLUSTER';

export type RangeBoundaryRole =
  | 'RANGE_HIGH'
  | 'RANGE_LOW'
  | 'NOT_RANGE_BOUNDARY';

export type RangeBoundaryEvidence = {
  role: RangeBoundaryRole;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  touchCount: number;
  cleanTouchSessions: number;
  causedBos: boolean;
  passThroughCount: number;
  reasons: string[];
};

export type ZoneQuality = 'LOW' | 'MEDIUM' | 'HIGH';

export type ZoneScore = number; // 0..10 structural/debug only

export type ZoneTier = 'ACTIONABLE' | 'WATCHABLE' | 'CONTEXT' | 'DROP';

export type ZoneKind = 'LEVEL_ZONE' | 'RANGE_BOX';

export type ContextZoneKind = 'RANGE_BOX' | 'CONGESTION_ZONE';

export type FreshnessState =
  | 'FRESH_VALIDATED_ORIGIN'
  | 'FRESH_WEAK_ORIGIN'
  | 'MITIGATED_NO_REACTION'
  | 'TRUE_TESTED'
  | 'MULTI_TESTED'
  | 'STALE_UNTOUCHED'
  | 'EXHAUSTED';

export type AbsorptionRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'HIGH_BUT_REBUILDING';

export type ZoneOriginEvidence = {
  causedBos: boolean;
  bosDirection?: 'BULLISH' | 'BEARISH';

  removedOpposingZone: boolean;
  removedOpposingZoneId?: string;

  displacementAtr: number;
  displacementPct: number;

  impulseVolumeConfirmed: boolean;

  significantOrigin: boolean;
  originAgeCandles: number;

  notes: string[];
};

export type ZoneTouchAccountingV2 = {
  touchSessions: number;

  mitigationSessions: number;
  trueTestSessions: number;

  cleanTouchSessions: number;
  noisyTouchSessions: number;
  passThroughCount: number;

  lastMitigatedAt?: Date;
  lastMitigatedIndex?: number;

  lastTrueTestAt?: Date;
  lastTrueTestIndex?: number;
};

export type ZoneAbsorptionEvidence = {
  trueTestSessions: number;
  absorptionRisk: AbsorptionRisk;
  repeatedTestPenalty: number;
  likelyOrdersConsumed: boolean;
  warning?: 'ZONE_MULTI_TESTED_ORDER_ABSORPTION_RISK';
  notes: string[];
};

export type LiquidityRebuildEvidence = {
  consolidationAtZone: boolean;
  baseCandles: number;
  baseRangeAtr: number;

  repeatedHigherReactions?: boolean;
  repeatedLowerRejections?: boolean;

  roundLevelProximityBps?: number;
  psychologicalLevel: boolean;

  sweepAndReclaim: boolean;
  volumeBuildUp: boolean;

  orderbookClusterDetected?: boolean;

  reloadLikely: boolean;
  notes: string[];
};

export type ZoneFormationType =
  | 'SWING_HIGH'
  | 'SWING_LOW'
  | 'CLUSTER'
  | 'FLIPPED';

export type ZoneFormationSummary = {
  shortLabel: string;
  formationType: ZoneFormationType;
  formedFrom: string;
  priceLogic: string;
  lifecycleLogic: string;
  qualityReason: string;
  traderMeaning: string;
};

export type ClusterComponent = {
  sourceZoneId?: string;
  sourceType: 'SWING_HIGH' | 'SWING_LOW';
  originAt: Date;
  low: number;
  high: number;
  mid: number;
  mergeReason: 'OVERLAP' | 'MID_PROXIMITY' | 'ATR_PROXIMITY' | 'PCT_PROXIMITY';
};

export type ZoneFormationTrace = {
  detectedPivot?: {
    type: 'SWING_HIGH' | 'SWING_LOW';
    originIndex: number;
    originAt: Date;
    open: number;
    high: number;
    low: number;
    close: number;
  };
  initialZone: {
    low: number;
    high: number;
    formula: string;
  };
  widthAdjustment?: {
    applied: boolean;
    reason?: 'TOO_NARROW_EXPANDED' | 'TOO_WIDE_MARKED';
    before?: { low: number; high: number };
    after?: { low: number; high: number };
  };
  clustering?: {
    applied: boolean;
    components: ClusterComponent[];
  };
  lifecycleEvents: {
    type: 'CREATED' | 'TESTED' | 'BROKEN' | 'FLIPPED' | 'INVALIDATED';
    at: Date;
    reason: string;
  }[];
};

export type ReactionStrength = 'NONE' | 'WEAK' | 'NORMAL' | 'STRONG';

export type ReactionQuality = {
  touchedZone: boolean;
  rejectedFromZone: boolean;
  closedAwayFromZone: boolean;
  moveAwayAtr?: number;
  moveAwayPct: number;
  candlesToReact: number;
  reactionWindowCandles: number;
  reactionWindowComplete: boolean;
  reactionStrength: ReactionStrength;
};

export type ZoneObviousness = 'LOW' | 'MEDIUM' | 'HIGH';

export type ZoneEvidence = {
  majorSwingExtreme: boolean;
  touchSessions: number;
  cleanTouchSessions: number;
  noisyTouchSessions: number;
  passThroughCount: number;
  strongestReactionAtr?: number;
  strongestReactionPct?: number;
  averageReactionAtr?: number;
  roleReversalConfirmed: boolean;
  recentlyRespected: boolean;
  lastRespectedAt?: Date;
  lastRespectedIndex?: number;
  candlesSinceLastRespect?: number;
  obviousness: ZoneObviousness;
  tooWide: boolean;
  tooNarrowExpanded: boolean;
  hasNoisyTouches: boolean;
  hasNoisyCrosses: boolean;
  hasPassThrough: boolean;
  noisy: boolean;
  notes: string[];
};

export type SupportResistanceWarning =
  | 'INSUFFICIENT_STRUCTURE_HISTORY'
  | 'NO_VALID_SUPPORT'
  | 'NO_VALID_RESISTANCE'
  | 'PRICE_INSIDE_ZONE'
  | 'PRICE_IN_MIDDLE_OF_RANGE'
  | 'NEAREST_RESISTANCE_TOO_CLOSE'
  | 'NEAREST_SUPPORT_TOO_CLOSE'
  | 'ZONE_TOO_WIDE'
  | 'ZONE_TOO_NARROW_EXPANDED'
  | 'STRUCTURE_SIDEWAYS'
  | 'MISSING_ATR_CONTEXT'
  | 'MISSING_INSTRUMENT_METADATA'
  | 'MISSING_LIVE_PRICE'
  | 'USING_LOW_QUALITY_SUPPORT_FALLBACK'
  | 'USING_LOW_QUALITY_RESISTANCE_FALLBACK'
  | 'BLOCKING_ZONE_AFTER_1_5R'
  | 'BLOCKING_ZONE_TOO_CLOSE'
  | 'S1_R1_OVERLAP'
  | 'S1_R1_TOUCHING'
  | 'NO_CLEAN_RANGE'
  | 'COMPRESSED_OR_OVERLAPPING_RANGE'
  | 'ZONE_NO_RECENT_RESPECT'
  | 'ZONE_NO_STRONG_REACTION'
  | 'ZONE_TOO_NOISY'
  | 'ZONE_REPEATED_PASS_THROUGH'
  | 'ZONE_OVERLAPS_WITH_NOISY_AREA'
  | 'NO_VALID_STRUCTURE'
  // v2.1 wide zone
  | 'PRICE_INSIDE_WIDE_ZONE'
  | 'NO_CLEAN_TRADE_LOCATION'
  | 'RANGE_BOX_NOT_ACTIONABLE_SR'
  // v2.2 freshness / origin
  | 'FRESH_WEAK_ORIGIN'
  | 'ZONE_MITIGATED_NO_REACTION'
  | 'STALE_UNTOUCHED_ZONE'
  | 'EXHAUSTED_ZONE'
  // v2.2 absorption / reload
  | 'ZONE_MULTI_TESTED_ORDER_ABSORPTION_RISK'
  | 'ZONE_RELOAD_LIKELY'
  // v2.2 context zone policy
  | 'NO_ACTIONABLE_SR_ZONES'
  | 'PRICE_INSIDE_CONTEXT_ZONE'
  | 'CONTEXT_ZONE_BETWEEN_ENTRY_AND_TARGET'
  | 'PROVISIONAL_STRUCTURE'
  | 'LOW_QUALITY_ZONE'
  | 'WATCHABLE_ZONE_ONLY'
  | 'COMPRESSED_STRUCTURE'
  | 'RANGE_BOUND_CONTEXT'
  | 'STOP_WIDE'
  | 'STOP_ACCEPTABLE_NOT_CLEAN'
  | 'NO_CLEAR_2R_PATH_EARLY'
  | 'FIRST_BLOCKER_BEFORE_2R'
  | 'PATH_PARTIAL';

// Keep StructureWarning as an alias for backward compatibility
export type StructureWarning = SupportResistanceWarning;

export type SupportResistanceMissing =
  | 'CANDLES'
  | 'CURRENT_PRICE'
  | 'SUPPORT_ZONES'
  | 'RESISTANCE_ZONES'
  | 'ATR_CONTEXT'
  | 'INSTRUMENT_METADATA'
  | 'STRUCTURE_ZONES'
  | 'ACTIVE_SUPPORT_OR_RESISTANCE';

// Keep StructureMissing as an alias for backward compatibility
export type StructureMissing = SupportResistanceMissing;

export type SupportResistanceZone = {
  id: string;

  symbol: string;
  timeframe: Timeframe;

  role: StructureZoneRole;
  originalRole: StructureZoneRole;
  lifecycle: ZoneLifecycle;
  origin: ZoneOrigin;

  originIndex: number;
  confirmedIndex: number;
  availableFromIndex: number;

  originAt: Date;
  low: number;
  high: number;
  mid: number;

  createdAt: Date;
  lastTouchedAt?: Date;
  lastRespectedAt?: Date;
  lastRespectedIndex?: number;
  brokenAt?: Date;
  flippedAt?: Date;
  invalidatedAt?: Date;

  touchCount: number;
  rejectionCount: number;
  breakCount: number;
  noisyCrossCount: number;
  cleanTouchSessions?: number;
  noisyTouchSessions?: number;
  passThroughCount?: number;

  quality: ZoneQuality;
  score: number;
  qualityScore?: number;
  tier?: ZoneTier;
  reactionQuality?: ReactionQuality;
  structuredEvidence?: ZoneEvidence;
  formationSummary?: ZoneFormationSummary;
  formationTrace?: ZoneFormationTrace;
  clusterComponents?: ClusterComponent[];

  distanceFromPricePct?: number;
  distanceFromPriceBps?: number;

  widthPct: number;
  widthAtr?: number;

  // v2.1 zone kind
  kind?: ZoneKind;
  usableAsS1R1?: boolean;

  // v2.2 actionability guards
  usableAsCleanStop?: boolean;
  usableAs2RBlocker?: boolean;

  // v2.2 semantic evidence
  originEvidence?: ZoneOriginEvidence;
  freshnessState?: FreshnessState;
  touchAccounting?: ZoneTouchAccountingV2;
  absorptionEvidence?: ZoneAbsorptionEvidence;
  liquidityRebuildEvidence?: LiquidityRebuildEvidence;

  // v2.3 range boundary classification
  rangeBoundaryEvidence?: RangeBoundaryEvidence;

  evidence: string[];
  warnings: SupportResistanceWarning[];
};

// Keep StructureZone as an alias for backward compatibility
export type StructureZone = SupportResistanceZone;

export type ContextZone = {
  id: string;
  symbol: string;
  timeframe: Timeframe;

  kind: ContextZoneKind;

  low: number;
  high: number;
  mid: number;
  widthPct: number;

  roleHint?: 'SUPPORT_CONTEXT' | 'RESISTANCE_CONTEXT' | 'NEUTRAL_RANGE';

  lifecycle: ZoneLifecycle;
  quality: ZoneQuality;
  score: number;

  sourceZoneId: string;

  actionable: false;
  usableAsS1R1: false;
  usableAsCleanStop: false;
  usableAs2RBlocker: false;

  warnings: SupportResistanceWarning[];
  evidence: string[];
};

export type RangeLocation =
  | 'NEAR_SUPPORT'
  | 'MIDDLE'
  | 'NEAR_RESISTANCE'
  | 'OUTSIDE_RANGE'
  | 'UNDEFINED'
  | 'COMPRESSED_OR_OVERLAPPING_RANGE';

export type SrConflictType =
  | 'S1_R1_OVERLAP'
  | 'S1_R1_TOUCHING'
  | 'NO_CLEAN_RANGE';

export type SupportResistanceConflict = {
  type: SrConflictType;
  supportId: string;
  resistanceId: string;
  outerSupportId?: string;
  outerResistanceId?: string;
  cleanGap: number;
  minCleanGap: number;
};

// Keep SrConflict as an alias for backward compatibility
export type SrConflict = SupportResistanceConflict;

export type ConflictResolvedReason =
  | 'OVERLAPS_STRONGER_OPPOSITE_ROLE'
  | 'TOO_CLOSE_TO_STRONGER_OPPOSITE_ROLE';

export type ConflictResolvedZone = {
  zone: SupportResistanceZone;
  suppressedByZoneId: string;
  reason: ConflictResolvedReason;
  cleanGap: number;
  minCleanGap: number;
  zonePriority: number;
  winnerPriority: number;
};

export type SupportResistanceAvailability = {
  level: 'ACTIONABLE' | 'WATCHABLE' | 'CONTEXT_ONLY' | 'NONE';
  limitingFactor: 'ZONE_QUALITY' | 'COMPRESSED_MIDDLE' | 'NO_ZONES' | null;
};

// Keep StructureAvailability as an alias for backward compatibility
export type StructureAvailability = SupportResistanceAvailability;

export type StopQuality = 'CLEAN' | 'ACCEPTABLE' | 'WIDE' | 'POOR' | 'NONE';

export type SrBottleneck =
  | 'PIVOT_LAG'
  | 'NO_ACTIONABLE_ZONE'
  | 'NO_CLEAN_RANGE'
  | 'STOP_NONE'
  | 'PATH_BLOCKED'
  | 'NO_ZONES'
  | 'NONE';

export type SupportResistanceDiagnostics = {
  candlesAnalyzed: number;
  confirmedPivotCount: number;
  // Reserved for the future provisional pivot phase; always 0 until that detector lands.
  provisionalPivotCount: number;
  rawZoneCount: number;
  actionableZoneCount: number;
  watchableZoneCount: number;
  contextZoneCount: number;
  droppedZoneCount: number;
  transitionZoneCount: number;   // BROKEN lifecycle zones waiting for retest (survived kind filter)
  s1Present: boolean;
  r1Present: boolean;
  srConflict: boolean;
  rangeLocation?: string;
  stopQuality: StopQuality;
  pathQuality: PathToTargetQuality;
  rMultipleToFirstBlocker?: number;
  bottleneck: SrBottleneck;
  warnings: SupportResistanceWarning[];
};

// Keep SrDiagnostics as an alias for backward compatibility
export type SrDiagnostics = SupportResistanceDiagnostics;

export type SupportResistanceNotReadyReason =
  | 'INSUFFICIENT_CANDLES'
  | 'NO_VALID_PIVOTS'
  | 'NO_PUBLIC_ACTIVE_ZONES'
  | 'MISSING_CURRENT_PRICE';

// Keep StructureNotReadyReason as an alias for backward compatibility
export type StructureNotReadyReason = SupportResistanceNotReadyReason;

export type PathToTargetQuality = 'CLEAR' | 'PARTIAL' | 'BLOCKED' | 'UNKNOWN';

export type TwoRPathBlocker = {
  type: 'LEVEL_ZONE' | 'RANGE_BOX' | 'PREVIOUS_HIGH_LOW' | 'UNKNOWN';
  price: number;
  distanceR: number;
  zoneId?: string;
  source?: 'ACTIVE_ZONE' | 'CONTEXT_ZONE' | 'CONFLICT_RESOLVED_ZONE';
};

export type TwoRPathContext = {
  quality: PathToTargetQuality;
  pathTo1R: boolean;
  pathTo2R: boolean;
  rMultipleToFirstBlocker?: number;
  firstBlocker?: TwoRPathBlocker;
  warnings: SupportResistanceWarning[];
};

export type SupportResistanceReadinessReasons = {
  engine: string[];
  structure: string[];
  actionable: string[];
  range: string[];
  location: string[];
};

export type SupportResistanceSnapshot = {
  symbol: string;
  timeframe: Timeframe;
  timestamp: Date;

  price: number;
  priceSource: PriceSource;

  // Actionable LEVEL_ZONE only
  supportZones: SupportResistanceZone[];
  resistanceZones: SupportResistanceZone[];

  // Context only (RANGE_BOX, CONGESTION_ZONE)
  contextZones?: ContextZone[];

  transitionZones?: SupportResistanceZone[];
  brokenZonesWaitingForRetest?: SupportResistanceZone[];

  closestSupport?: SupportResistanceZone;
  closestResistance?: SupportResistanceZone;
  closestContextZone?: ContextZone;

  // LEVEL_ZONE only — RANGE_BOX never selected
  s1?: SupportResistanceZone;
  s2?: SupportResistanceZone;
  r1?: SupportResistanceZone;
  r2?: SupportResistanceZone;

  // Backward-compatible aliases clarifying that these are structural zones,
  // not classic formula pivot S1/R1 levels.
  structuralS1?: SupportResistanceZone;
  structuralS2?: SupportResistanceZone;
  structuralR1?: SupportResistanceZone;
  structuralR2?: SupportResistanceZone;

  // Convenience fields promoted from s1/r1 for easy diagnostics access
  s1Tier?: ZoneTier;
  s1Score?: number;
  s1OriginalRole?: StructureZoneRole;
  s1RoleFlipped?: boolean;

  r1Tier?: ZoneTier;
  r1Score?: number;
  r1OriginalRole?: StructureZoneRole;
  r1RoleFlipped?: boolean;

  srConflict?: SupportResistanceConflict;
  conflictResolvedZones?: ConflictResolvedZone[];
  structureAvailability?: SupportResistanceAvailability;
  diagnostics?: SupportResistanceDiagnostics;

  structureState: {
    aboveSupport: boolean;
    belowResistance: boolean;

    // true only for actionable LEVEL_ZONE
    insideZone: boolean;
    insideZoneId?: string;

    // true for RANGE_BOX / context zones
    insideContextZone?: boolean;
    insideContextZoneId?: string;
    insideContextZoneKind?: ContextZoneKind;

    // legacy alias kept for backward compat
    insideWideZone?: boolean;

    nearestZoneId?: string;
    nearestContextZoneId?: string;

    rangeLocation?: RangeLocation;
  };

  ready: boolean;
  legacyReady: boolean;
  engineReady: boolean;
  structureReady: boolean;
  actionableStructureReady: boolean;
  boundedRangeReady: boolean;
  locationContextUsable: boolean;
  readinessReasons: SupportResistanceReadinessReasons;
  notReadyReason?: SupportResistanceNotReadyReason;
  missing: SupportResistanceMissing[];
  warnings: SupportResistanceWarning[];
  evidence: string[];
};
