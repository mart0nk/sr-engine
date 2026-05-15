import type {
  FreshnessState,
  ZoneLifecycle,
  ZoneOriginEvidence,
  ZoneTouchAccountingV2,
  ZoneAbsorptionEvidence,
} from './sr.types.js';
import type { SupportResistanceConfig } from './sr-config.js';

export function classifyFreshnessState(args: {
  lifecycle: ZoneLifecycle;
  originEvidence: ZoneOriginEvidence;
  touchAccounting: ZoneTouchAccountingV2;
  absorptionEvidence: ZoneAbsorptionEvidence;
  zoneAgeCandles: number;
  config: SupportResistanceConfig;
}): FreshnessState {
  const { lifecycle, originEvidence, touchAccounting, zoneAgeCandles, config } = args;

  // 1. INVALIDATED lifecycle → EXHAUSTED
  if (lifecycle === 'INVALIDATED') {
    return 'EXHAUSTED';
  }

  // 2. passThroughCount >= 2 OR noisyTouchSessions >= 3 → EXHAUSTED
  if (touchAccounting.passThroughCount >= 2 || touchAccounting.noisyTouchSessions >= 3) {
    return 'EXHAUSTED';
  }

  // 3. trueTestSessions >= 2 → MULTI_TESTED
  if (touchAccounting.trueTestSessions >= 2) {
    return 'MULTI_TESTED';
  }

  // 4. trueTestSessions === 1 → TRUE_TESTED
  if (touchAccounting.trueTestSessions === 1) {
    return 'TRUE_TESTED';
  }

  // 5. mitigationSessions > 0 → MITIGATED_NO_REACTION
  if (touchAccounting.mitigationSessions > 0) {
    return 'MITIGATED_NO_REACTION';
  }

  // 6. zoneAgeCandles >= staleUntouchedCandles → STALE_UNTOUCHED
  if (zoneAgeCandles >= config.staleUntouchedCandles) {
    return 'STALE_UNTOUCHED';
  }

  // 7. originEvidence.significantOrigin → FRESH_VALIDATED_ORIGIN
  if (originEvidence.significantOrigin) {
    return 'FRESH_VALIDATED_ORIGIN';
  }

  // 8. otherwise → FRESH_WEAK_ORIGIN
  return 'FRESH_WEAK_ORIGIN';
}
