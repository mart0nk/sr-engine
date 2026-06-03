// Engine
export {
  PermissiveSupportResistanceEngine,
  SrErrors,
  zonesOverlap,
  getMinCleanRangeGap,
  classifyS1R1Conflict,
} from './sr-engine.js';
export type { SupportResistanceInput } from './sr-engine.js';
export { SupportResistanceEngine, StrictSupportResistanceEngine } from './strict-engine.js';
export {
  SupportResistanceRollingEngine,
  createSupportResistanceRollingEngine,
} from './rolling-engine.js';
export {
  resolveSupportResistanceValidationOptions,
  validateSupportResistanceInput,
} from './strict-validation.js';
export { toChartOverlays } from './chart.js';
export { toScannerFacts } from './facts.js';

// Config
export {
  DEFAULT_SUPPORT_RESISTANCE_CONFIG,
  DEFAULT_STRUCTURE_CONFIG,
  resolveSupportResistanceConfig,
  resolveStructureConfig,
} from './sr-config.js';
export type { SupportResistanceConfig, StructureConfig, ZoneConstructionPolicy } from './sr-config.js';
export type {
  SupportResistanceValidationOptions,
  SrValidationIssue,
  SrValidationIssueCode,
} from './strict-validation.js';
export type {
  SupportResistanceRollingEngineOptions,
  SupportResistanceRollingEvaluateInput,
} from './rolling-engine.js';
export type {
  ChartOverlay,
  ChartOverlayKind,
  ChartOverlayOptions,
  ChartOverlayState,
} from './chart.js';
export type { ScannerFact, ScannerFactCode, ScannerFactSeverity } from './facts.js';

// Types
export type {
  // New canonical names
  SupportResistanceZone,
  SupportResistanceWarning,
  SupportResistanceMissing,
  SupportResistanceDiagnostics,
  SupportResistanceAvailability,
  SupportResistanceConflict,
  SupportResistanceSnapshot,
  SupportResistanceNotReadyReason,
  SupportResistanceReadinessReasons,
  // Backward-compat aliases
  StructureZone,
  StructureWarning,
  StructureMissing,
  SrDiagnostics,
  StructureAvailability,
  SrConflict,
  StructureNotReadyReason,
  // Other types
  ContextZone,
  ConflictResolvedZone,
  ConflictResolvedReason,
  StructureZoneRole,
  ZoneLifecycle,
  ZoneOrigin,
  ZoneQuality,
  ZoneScore,
  ZoneTier,
  ZoneKind,
  ContextZoneKind,
  FreshnessState,
  AbsorptionRisk,
  ZoneOriginEvidence,
  ZoneTouchAccountingV2,
  ZoneAbsorptionEvidence,
  LiquidityRebuildEvidence,
  ZoneFormationType,
  ZoneFormationSummary,
  ClusterComponent,
  ZoneFormationTrace,
  ReactionStrength,
  ReactionQuality,
  ZoneObviousness,
  ZoneEvidence,
  RangeLocation,
  SrConflictType,
  SrBottleneck,
  PathToTargetQuality,
  TwoRPathBlocker,
  TwoRPathContext,
  StopQuality,
  RangeBoundaryRole,
  RangeBoundaryEvidence,
} from './sr.types.js';

export type { PriceSource, Candle, Timeframe } from './primitives.js';

// Algorithm modules (for advanced use / re-export shimming)
export { detectPivots } from './pivot-detector.js';
export type { PivotPoint } from './pivot-detector.js';

export { buildZoneCandidates } from './zone-builder.js';
export { clusterZones } from './zone-clustering.js';
export { classifyZoneLifecycle, intersectsZone } from './zone-state-engine.js';
export type { ZoneLifecycleResult } from './zone-state-engine.js';
export { evaluateZoneQuality } from './zone-quality.js';
export { resolveClosestZones } from './closest-zones-resolver.js';
export type { ClosestZonesResult } from './closest-zones-resolver.js';
export { resolveOppositeRoleConflicts } from './opposite-role-conflict-resolver.js';
export type { OppositeRoleConflictResolverInput, OppositeRoleConflictResolverResult } from './opposite-role-conflict-resolver.js';
export { enrichZoneFormation, buildClusterComponent } from './zone-formation.js';
export { markZoneKind, isActionableLevelZone, toContextZone, canResolveAsClosest, canUseAsCleanStop, canBlock2R, isRangeBox } from './zone-kind.js';
export { normalizeZoneWidth } from './zone-width.js';
export { evaluateReactionQuality } from './zone-reaction-quality.js';
export { evaluateZoneTouchAccountingV2 } from './zone-touch-accounting.js';
export { evaluateZoneOriginEvidence } from './zone-origin-evidence.js';
export { classifyFreshnessState } from './zone-freshness.js';
export { evaluateLiquidityRebuildEvidence } from './zone-liquidity-rebuild.js';
export { evaluateAbsorptionRisk } from './zone-absorption.js';

export { classifyRangeBoundary } from './range-boundary-classifier.js';

// Error types
export { SrError } from './sr-errors.js';
export type { SrErrorCode } from './sr-errors.js';
