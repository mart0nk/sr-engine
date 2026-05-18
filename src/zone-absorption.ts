import type {
  ZoneAbsorptionEvidence,
  AbsorptionRisk,
  LiquidityRebuildEvidence,
} from './sr.types.js';
import type { SupportResistanceConfig } from './sr-config.js';

export function evaluateAbsorptionRisk(args: {
  trueTestSessions: number;
  liquidityRebuildEvidence: LiquidityRebuildEvidence;
  config: SupportResistanceConfig;
}): ZoneAbsorptionEvidence {
  const { trueTestSessions, liquidityRebuildEvidence, config } = args;
  const { reloadLikely } = liquidityRebuildEvidence;
  const { multiTestAbsorptionThreshold } = config;

  // trueTestSessions === 0 → LOW
  if (trueTestSessions === 0) {
    return {
      trueTestSessions,
      absorptionRisk: 'LOW' as AbsorptionRisk,
      repeatedTestPenalty: 0,
      likelyOrdersConsumed: false,
      notes: [],
    };
  }

  // trueTestSessions === 1 → MEDIUM
  if (trueTestSessions === 1) {
    return {
      trueTestSessions,
      absorptionRisk: 'MEDIUM' as AbsorptionRisk,
      repeatedTestPenalty: 0.25,
      likelyOrdersConsumed: false,
      notes: [],
    };
  }

  // trueTestSessions >= multiTestAbsorptionThreshold AND reloadLikely → HIGH_BUT_REBUILDING
  if (trueTestSessions >= multiTestAbsorptionThreshold && reloadLikely) {
    return {
      trueTestSessions,
      absorptionRisk: 'HIGH_BUT_REBUILDING' as AbsorptionRisk,
      repeatedTestPenalty: 0.25,
      likelyOrdersConsumed: true,
      notes: ['Multiple true tests detected, but reload evidence is present.'],
    };
  }

  // trueTestSessions >= multiTestAbsorptionThreshold AND NOT reloadLikely → HIGH
  if (trueTestSessions >= multiTestAbsorptionThreshold && !reloadLikely) {
    return {
      trueTestSessions,
      absorptionRisk: 'HIGH' as AbsorptionRisk,
      repeatedTestPenalty: 1.0,
      likelyOrdersConsumed: true,
      warning: 'ZONE_MULTI_TESTED_ORDER_ABSORPTION_RISK',
      notes: [],
    };
  }

  // Fallback for trueTestSessions >= 2 but below threshold (shouldn't normally occur
  // with default threshold of 2, but handles configs where threshold > 2)
  return {
    trueTestSessions,
    absorptionRisk: 'MEDIUM' as AbsorptionRisk,
    repeatedTestPenalty: 0.25,
    likelyOrdersConsumed: false,
    notes: [],
  };
}
