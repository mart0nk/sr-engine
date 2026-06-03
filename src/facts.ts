import type { SupportResistanceSnapshot } from './sr.types.js';

export type ScannerFactSeverity = 'INFO' | 'WARNING';

export type ScannerFactCode =
  | 'NOT_READY'
  | 'ACTIONABLE_STRUCTURE_READY'
  | 'ACTIONABLE_SUPPORT_PRESENT'
  | 'ACTIONABLE_RESISTANCE_PRESENT'
  | 'TRANSITION_ONLY_STRUCTURE'
  | 'BOUNDED_RANGE'
  | 'PRICE_NEAR_SUPPORT'
  | 'PRICE_NEAR_RESISTANCE'
  | 'PRICE_IN_MIDDLE'
  | 'PRICE_OUTSIDE_RANGE'
  | 'PRICE_INSIDE_ACTIONABLE_ZONE'
  | 'PRICE_INSIDE_CONTEXT_ZONE'
  | 'NO_CLEAN_LOCATION'
  | 'RANGE_CONFLICT'
  | 'WATCHABLE_OR_CONTEXT_ONLY';

export type ScannerFact = {
  code: ScannerFactCode;
  severity: ScannerFactSeverity;
  message: string;
  zoneId?: string;
  value?: string | number | boolean;
};

export function toScannerFacts(snapshot: SupportResistanceSnapshot): ScannerFact[] {
  const facts: ScannerFact[] = [];

  if (!snapshot.ready) {
    facts.push({
      code: 'NOT_READY',
      severity: 'WARNING',
      message: snapshot.notReadyReason ?? 'Snapshot is not ready.',
      ...(snapshot.notReadyReason !== undefined ? { value: snapshot.notReadyReason } : {}),
    });
  }

  if (snapshot.actionableStructureReady) {
    facts.push({
      code: 'ACTIONABLE_STRUCTURE_READY',
      severity: 'INFO',
      message: 'At least one actionable SR zone is available.',
      value: true,
    });
  }

  if (snapshot.supportZones.length > 0) {
    const zoneId = snapshot.supportZones[0]?.id;
    facts.push({
      code: 'ACTIONABLE_SUPPORT_PRESENT',
      severity: 'INFO',
      message: 'At least one actionable support zone is present.',
      value: snapshot.supportZones.length,
      ...(zoneId !== undefined ? { zoneId } : {}),
    });
  }

  if (snapshot.resistanceZones.length > 0) {
    const zoneId = snapshot.resistanceZones[0]?.id;
    facts.push({
      code: 'ACTIONABLE_RESISTANCE_PRESENT',
      severity: 'INFO',
      message: 'At least one actionable resistance zone is present.',
      value: snapshot.resistanceZones.length,
      ...(zoneId !== undefined ? { zoneId } : {}),
    });
  }

  if (
    snapshot.supportZones.length === 0 &&
    snapshot.resistanceZones.length === 0 &&
    (snapshot.transitionZones?.length ?? 0) > 0
  ) {
    facts.push({
      code: 'TRANSITION_ONLY_STRUCTURE',
      severity: 'WARNING',
      message: 'Only transition/broken structure is present.',
      value: snapshot.transitionZones?.length ?? 0,
    });
  }

  if (snapshot.boundedRangeReady) {
    facts.push({
      code: 'BOUNDED_RANGE',
      severity: 'INFO',
      message: 'Nearest support and resistance form a bounded range.',
      value: true,
    });
  }

  switch (snapshot.structureState.rangeLocation) {
    case 'NEAR_SUPPORT':
      {
        const zoneId = snapshot.s1?.id;
      facts.push({
        code: 'PRICE_NEAR_SUPPORT',
        severity: 'INFO',
        message: 'Price is near the nearest support boundary.',
        ...(zoneId !== undefined ? { zoneId } : {}),
      });
      }
      break;
    case 'NEAR_RESISTANCE':
      {
        const zoneId = snapshot.r1?.id;
      facts.push({
        code: 'PRICE_NEAR_RESISTANCE',
        severity: 'INFO',
        message: 'Price is near the nearest resistance boundary.',
        ...(zoneId !== undefined ? { zoneId } : {}),
      });
      }
      break;
    case 'MIDDLE':
      facts.push({
        code: 'PRICE_IN_MIDDLE',
        severity: 'INFO',
        message: 'Price is in the middle of the active range.',
      });
      break;
    case 'OUTSIDE_RANGE':
      facts.push({
        code: 'PRICE_OUTSIDE_RANGE',
        severity: 'INFO',
        message: 'Price is outside the nearest SR range.',
      });
      break;
  }

  if (snapshot.structureState.insideZone) {
    const zoneId = snapshot.structureState.insideZoneId;
    facts.push({
      code: 'PRICE_INSIDE_ACTIONABLE_ZONE',
      severity: 'INFO',
      message: 'Price is currently inside an actionable SR zone.',
      ...(zoneId !== undefined ? { zoneId } : {}),
    });
  }

  if (snapshot.structureState.insideContextZone) {
    const zoneId = snapshot.structureState.insideContextZoneId;
    const value = snapshot.structureState.insideContextZoneKind;
    facts.push({
      code: 'PRICE_INSIDE_CONTEXT_ZONE',
      severity: 'WARNING',
      message: 'Price is currently inside a context-only zone.',
      ...(zoneId !== undefined ? { zoneId } : {}),
      ...(value !== undefined ? { value } : {}),
    });
  }

  if (!snapshot.locationContextUsable) {
    facts.push({
      code: 'NO_CLEAN_LOCATION',
      severity: 'WARNING',
      message: 'Location context is not clean enough for SR interpretation.',
      value: snapshot.readinessReasons.location.join(', '),
    });
  }

  if (snapshot.srConflict !== undefined) {
    facts.push({
      code: 'RANGE_CONFLICT',
      severity: 'WARNING',
      message: `SR conflict: ${snapshot.srConflict.type}`,
      value: snapshot.srConflict.type,
    });
  }

  if (!snapshot.actionableStructureReady && snapshot.structureReady) {
    facts.push({
      code: 'WATCHABLE_OR_CONTEXT_ONLY',
      severity: 'INFO',
      message: 'Structure exists, but no actionable SR zone is currently available.',
      value: snapshot.structureAvailability?.level ?? 'NONE',
    });
  }

  return facts;
}
