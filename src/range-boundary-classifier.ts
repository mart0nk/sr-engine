import type { SupportResistanceZone, RangeBoundaryEvidence, RangeBoundaryRole } from './sr.types.js';

export function classifyRangeBoundary(zone: SupportResistanceZone): RangeBoundaryEvidence {
  const touchCount = zone.touchCount ?? 0;
  const cleanTouches = zone.touchAccounting?.cleanTouchSessions ?? zone.cleanTouchSessions ?? 0;
  const passThrough = zone.touchAccounting?.passThroughCount ?? zone.passThroughCount ?? 0;
  const causedBos = zone.originEvidence?.causedBos === true;

  const hasMultiTouch = touchCount >= 2 || cleanTouches >= 1;
  const notBosOrigin = !causedBos;
  const notTooNoisy = passThrough <= 1;

  const reasons: string[] = [];
  if (hasMultiTouch) reasons.push('MULTI_TOUCH_ZONE');
  if (notBosOrigin) reasons.push('NO_BOS_CAUSED');
  if (notTooNoisy) reasons.push('LOW_PASS_THROUGH');

  const isRangeBoundary = hasMultiTouch && notBosOrigin && notTooNoisy;

  if (!isRangeBoundary) {
    return {
      role: 'NOT_RANGE_BOUNDARY',
      confidence: 'LOW',
      touchCount,
      cleanTouchSessions: cleanTouches,
      causedBos,
      passThroughCount: passThrough,
      reasons,
    };
  }

  const role: RangeBoundaryRole =
    zone.origin === 'SWING_HIGH' ? 'RANGE_HIGH'
    : zone.origin === 'SWING_LOW' ? 'RANGE_LOW'
    : 'NOT_RANGE_BOUNDARY';

  if (role === 'NOT_RANGE_BOUNDARY') {
    return {
      role: 'NOT_RANGE_BOUNDARY',
      confidence: 'LOW',
      touchCount,
      cleanTouchSessions: cleanTouches,
      causedBos,
      passThroughCount: passThrough,
      reasons,
    };
  }

  return {
    role,
    confidence: touchCount >= 3 ? 'HIGH' : 'MEDIUM',
    touchCount,
    cleanTouchSessions: cleanTouches,
    causedBos,
    passThroughCount: passThrough,
    reasons,
  };
}
