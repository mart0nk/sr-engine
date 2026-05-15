import type { StructureZone, ContextZone, ZoneKind, ContextZoneKind, ZoneLifecycle } from './sr.types.js';
import type { SupportResistanceConfig } from './sr-config.js';

export function isRangeBox(zone: StructureZone, config: SupportResistanceConfig): boolean {
  return zone.widthPct > config.rangeBoxWidthPct;
}

export function markZoneKind(
  zone: StructureZone,
  config: SupportResistanceConfig
): StructureZone | undefined {
  // Returns undefined only if policy is DROP
  const rangeBox = isRangeBox(zone, config);

  if (rangeBox && config.wideZonePolicy === 'DROP') {
    return undefined;
  }

  if (rangeBox && config.wideZonePolicy === 'CONTEXT_ONLY') {
    return {
      ...zone,
      kind: 'RANGE_BOX' as ZoneKind,
      usableAsS1R1: false,
      usableAsCleanStop: false,
      usableAs2RBlocker: false,
      warnings: [...new Set([...zone.warnings, 'ZONE_TOO_WIDE' as const, 'RANGE_BOX_NOT_ACTIONABLE_SR' as const])],
      evidence: [...new Set([...zone.evidence, 'Wide zone classified as context-only range box.'])],
    };
  }

  // LEVEL_ZONE (either KEEP_AS_SR policy or not a range box)
  return {
    ...zone,
    kind: 'LEVEL_ZONE' as ZoneKind,
    usableAsS1R1: true,
    usableAsCleanStop: true,
    usableAs2RBlocker: true,
  };
}

export function isActionableLevelZone(zone: StructureZone): boolean {
  return (
    zone.kind !== 'RANGE_BOX' &&
    zone.usableAsS1R1 !== false &&
    zone.lifecycle !== 'BROKEN' &&
    zone.lifecycle !== 'INVALIDATED'
  );
}

export function toContextZone(zone: StructureZone): ContextZone {
  const roleHint: ContextZone['roleHint'] =
    zone.role === 'SUPPORT'
      ? 'SUPPORT_CONTEXT'
      : zone.role === 'RESISTANCE'
        ? 'RESISTANCE_CONTEXT'
        : 'NEUTRAL_RANGE';

  return {
    id: `${zone.id}:context`,
    symbol: zone.symbol,
    timeframe: zone.timeframe,
    kind: 'RANGE_BOX' as ContextZoneKind,
    low: zone.low,
    high: zone.high,
    mid: zone.mid,
    widthPct: zone.widthPct,
    roleHint,
    lifecycle: zone.lifecycle as ZoneLifecycle,
    quality: zone.quality,
    score: zone.score,
    sourceZoneId: zone.id,
    actionable: false,
    usableAsS1R1: false,
    usableAsCleanStop: false,
    usableAs2RBlocker: false,
    warnings: [...new Set([...zone.warnings, 'RANGE_BOX_NOT_ACTIONABLE_SR' as const])],
    evidence: [...new Set([...zone.evidence, 'Context zone only; excluded from actionable SR resolver.'])],
  };
}

export function canResolveAsClosest(zone: StructureZone): boolean {
  return (
    zone.kind !== 'RANGE_BOX' &&
    zone.usableAsS1R1 !== false &&
    zone.lifecycle !== 'BROKEN' &&
    zone.lifecycle !== 'INVALIDATED'
  );
}

export function canUseAsCleanStop(zone: StructureZone): boolean {
  return (
    zone.kind !== 'RANGE_BOX' &&
    zone.usableAsCleanStop !== false &&
    zone.lifecycle !== 'INVALIDATED'
  );
}

export function canBlock2R(zone: StructureZone): boolean {
  return (
    zone.kind !== 'RANGE_BOX' &&
    zone.usableAs2RBlocker !== false &&
    zone.lifecycle !== 'INVALIDATED'
  );
}
