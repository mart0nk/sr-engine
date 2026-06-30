import type {
  StructureZone,
  ContextZone,
  ZoneTier,
  ZoneKind,
  ContextZoneKind,
  RangeLocation,
} from './sr.types.js';
import type {
  DescriptiveRangeContext,
  DescriptiveRangeLocation,
  DescriptiveRangeSource,
} from './sr.types.js';
import { canResolveAsClosest } from './zone-kind.js';

type ZoneSummary = {
  id: string;
  low: number;
  high: number;
  mid: number;
  tier?: ZoneTier;
  kind?: ZoneKind | ContextZoneKind;
  source: 'ACTIONABLE' | 'WATCHABLE' | 'CONTEXT';
};

function isInsideZone(zone: StructureZone, price: number): boolean {
  return price >= zone.low && price <= zone.high;
}

function structureZoneToSummary(zone: StructureZone): ZoneSummary {
  let source: 'ACTIONABLE' | 'WATCHABLE' | 'CONTEXT';
  if (zone.tier === 'WATCHABLE') source = 'WATCHABLE';
  else if (zone.tier === 'CONTEXT') source = 'CONTEXT';
  else source = 'ACTIONABLE';

  const summary: ZoneSummary = {
    id: zone.id,
    low: zone.low,
    high: zone.high,
    mid: zone.mid,
    source,
  };
  if (zone.tier !== undefined) summary.tier = zone.tier;
  if (zone.kind !== undefined) summary.kind = zone.kind;
  return summary;
}

function contextZoneToSummary(zone: ContextZone): ZoneSummary {
  return {
    id: zone.id,
    low: zone.low,
    high: zone.high,
    mid: zone.mid,
    kind: zone.kind,
    source: 'CONTEXT',
  };
}

function transitionZoneToSummary(zone: StructureZone): ZoneSummary {
  // BROKEN lifecycle zones are context-only for descriptive purposes
  const summary: ZoneSummary = {
    id: zone.id,
    low: zone.low,
    high: zone.high,
    mid: zone.mid,
    source: 'CONTEXT',
  };
  if (zone.tier !== undefined) summary.tier = zone.tier;
  if (zone.kind !== undefined) summary.kind = zone.kind;
  return summary;
}

function determinePairSource(
  supportSource: 'ACTIONABLE' | 'WATCHABLE' | 'CONTEXT',
  resistanceSource: 'ACTIONABLE' | 'WATCHABLE' | 'CONTEXT',
): DescriptiveRangeSource {
  const supportNonContext = supportSource === 'ACTIONABLE' || supportSource === 'WATCHABLE';
  const resistanceNonContext = resistanceSource === 'ACTIONABLE' || resistanceSource === 'WATCHABLE';

  if (supportNonContext && resistanceNonContext) {
    if (supportSource === 'ACTIONABLE' && resistanceSource === 'ACTIONABLE') {
      return 'ACTIONABLE_PAIR';
    }
    return 'WATCHABLE_PAIR';
  }

  if (supportNonContext || resistanceNonContext) {
    return 'MIXED_ACTIONABLE_CONTEXT_PAIR';
  }

  return 'CONTEXT_PAIR';
}

function pairConfidence(source: DescriptiveRangeSource): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (source === 'ACTIONABLE_PAIR' || source === 'WATCHABLE_PAIR') return 'HIGH';
  if (source === 'MIXED_ACTIONABLE_CONTEXT_PAIR') return 'MEDIUM';
  return 'LOW';
}

function computeRangeLocation(
  price: number,
  supportMid: number,
  resistanceMid: number,
): DescriptiveRangeLocation {
  const rangeSize = resistanceMid - supportMid;
  if (rangeSize <= 0) return 'COMPRESSED_OR_OVERLAPPING_RANGE';
  const position = (price - supportMid) / rangeSize;
  if (position < 0 || position > 1) return 'OUTSIDE_RANGE';
  if (position <= 0.33) return 'NEAR_SUPPORT';
  if (position <= 0.66) return 'MIDDLE';
  return 'NEAR_RESISTANCE';
}

// Structural zone fallback — mirrors resolveClosestZones gating (canResolveAsClosest + position check)
function findBestStructuralSupport(
  zones: readonly StructureZone[],
  price: number,
): StructureZone | undefined {
  return zones
    .filter(z => canResolveAsClosest(z) && z.role === 'SUPPORT' && (z.high <= price || isInsideZone(z, price)))
    .sort((a, b) => b.mid - a.mid)[0];
}

function findBestStructuralResistance(
  zones: readonly StructureZone[],
  price: number,
): StructureZone | undefined {
  return zones
    .filter(z => canResolveAsClosest(z) && z.role === 'RESISTANCE' && (z.low >= price || isInsideZone(z, price)))
    .sort((a, b) => a.mid - b.mid)[0];
}

function findBestContextSupport(zones: readonly ContextZone[], price: number): ContextZone | undefined {
  return zones
    .filter(
      z =>
        z.mid < price &&
        (z.roleHint === undefined ||
          z.roleHint === 'SUPPORT_CONTEXT' ||
          z.roleHint === 'NEUTRAL_RANGE'),
    )
    .sort((a, b) => b.mid - a.mid)[0];
}

function findBestContextResistance(zones: readonly ContextZone[], price: number): ContextZone | undefined {
  return zones
    .filter(
      z =>
        z.mid > price &&
        (z.roleHint === undefined ||
          z.roleHint === 'RESISTANCE_CONTEXT' ||
          z.roleHint === 'NEUTRAL_RANGE'),
    )
    .sort((a, b) => a.mid - b.mid)[0];
}

export function resolveDescriptiveRangeContext(input: {
  price: number;
  s1?: StructureZone;
  r1?: StructureZone;
  // Engine's already-computed range location — must be passed when s1+r1 are both present
  // to avoid divergence with classifyS1R1Conflict/getMinCleanRangeGap logic.
  engineRangeLocation?: RangeLocation;
  supportZones: readonly StructureZone[];
  resistanceZones: readonly StructureZone[];
  contextZones: readonly ContextZone[];
  transitionZones?: readonly StructureZone[];
}): DescriptiveRangeContext {
  const {
    price,
    s1,
    r1,
    engineRangeLocation,
    supportZones,
    resistanceZones,
    contextZones,
    transitionZones,
  } = input;

  // Case A: s1 + r1 both present — translate the engine's already-computed result.
  // Do NOT re-derive compression here; classifyS1R1Conflict already ran getMinCleanRangeGap
  // with tick/%/ATR-based thresholds that we do not duplicate.
  if (s1 !== undefined && r1 !== undefined) {
    const supportSource = s1.tier === 'WATCHABLE' ? 'WATCHABLE' : s1.tier === 'CONTEXT' ? 'CONTEXT' : 'ACTIONABLE' as const;
    const resistanceSource = r1.tier === 'WATCHABLE' ? 'WATCHABLE' : r1.tier === 'CONTEXT' ? 'CONTEXT' : 'ACTIONABLE' as const;
    const source = determinePairSource(supportSource, resistanceSource);
    const confidence = pairConfidence(source);
    const nearestSupport = structureZoneToSummary(s1);
    const nearestResistance = structureZoneToSummary(r1);

    if (engineRangeLocation === 'COMPRESSED_OR_OVERLAPPING_RANGE') {
      return {
        rangeLocation: 'COMPRESSED_OR_OVERLAPPING_RANGE',
        source,
        confidence: 'LOW',
        nearestSupport,
        nearestResistance,
        missingReason: 'COMPRESSED_OR_OVERLAPPING_RANGE',
      };
    }

    const rangeLocation: DescriptiveRangeLocation =
      engineRangeLocation === 'NEAR_SUPPORT' ||
      engineRangeLocation === 'MIDDLE' ||
      engineRangeLocation === 'NEAR_RESISTANCE' ||
      engineRangeLocation === 'OUTSIDE_RANGE'
        ? engineRangeLocation
        : 'UNDEFINED';

    return { rangeLocation, source, confidence, nearestSupport, nearestResistance };
  }

  // Case B/C: s1 or r1 (or both) absent.
  // For structural zone fallback, mirror resolveClosestZones gating (canResolveAsClosest + position).
  // Context zones use mid-based filter (they have no canResolveAsClosest concept).
  // Transition (BROKEN lifecycle) zones used as last resort, treated as CONTEXT source.

  let supportCandidate: ZoneSummary | undefined;
  if (s1 !== undefined) {
    supportCandidate = structureZoneToSummary(s1);
  } else {
    const structural = findBestStructuralSupport(supportZones, price);
    if (structural !== undefined) {
      supportCandidate = structureZoneToSummary(structural);
    } else {
      const ctx = findBestContextSupport(contextZones, price);
      if (ctx !== undefined) {
        supportCandidate = contextZoneToSummary(ctx);
      } else {
        const transition = (transitionZones ?? [])
          .filter(z => z.role === 'SUPPORT' && (z.high <= price || isInsideZone(z, price)))
          .sort((a, b) => b.mid - a.mid)[0];
        if (transition !== undefined) supportCandidate = transitionZoneToSummary(transition);
      }
    }
  }

  let resistanceCandidate: ZoneSummary | undefined;
  if (r1 !== undefined) {
    resistanceCandidate = structureZoneToSummary(r1);
  } else {
    const structural = findBestStructuralResistance(resistanceZones, price);
    if (structural !== undefined) {
      resistanceCandidate = structureZoneToSummary(structural);
    } else {
      const ctx = findBestContextResistance(contextZones, price);
      if (ctx !== undefined) {
        resistanceCandidate = contextZoneToSummary(ctx);
      } else {
        const transition = (transitionZones ?? [])
          .filter(z => z.role === 'RESISTANCE' && (z.low >= price || isInsideZone(z, price)))
          .sort((a, b) => a.mid - b.mid)[0];
        if (transition !== undefined) resistanceCandidate = transitionZoneToSummary(transition);
      }
    }
  }

  if (supportCandidate === undefined && resistanceCandidate === undefined) {
    return {
      rangeLocation: 'UNDEFINED',
      source: 'INSUFFICIENT_STRUCTURE',
      confidence: 'LOW',
      missingReason: 'NO_VALID_BOUNDARIES',
    };
  }

  if (supportCandidate === undefined) {
    return {
      rangeLocation: 'ONE_SIDED_RESISTANCE',
      source: 'ONE_SIDED_RESISTANCE',
      confidence: 'LOW',
      nearestResistance: resistanceCandidate!,
      missingReason: 'NO_VALID_SUPPORT_BOUNDARY',
    };
  }

  if (resistanceCandidate === undefined) {
    return {
      rangeLocation: 'ONE_SIDED_SUPPORT',
      source: 'ONE_SIDED_SUPPORT',
      confidence: 'LOW',
      nearestSupport: supportCandidate,
      missingReason: 'NO_VALID_RESISTANCE_BOUNDARY',
    };
  }

  const source = determinePairSource(supportCandidate.source, resistanceCandidate.source);
  const confidence = pairConfidence(source);

  // Literal overlap/touch check for non-strict pairs (context/mixed).
  // minCleanGap logic is only applicable to the ACTIONABLE_PAIR path, which is handled above
  // via engineRangeLocation — so the compressed check here covers only genuine overlap.
  if (supportCandidate.high >= resistanceCandidate.low) {
    return {
      rangeLocation: 'COMPRESSED_OR_OVERLAPPING_RANGE',
      source,
      confidence: 'LOW',
      nearestSupport: supportCandidate,
      nearestResistance: resistanceCandidate,
      missingReason: 'COMPRESSED_OR_OVERLAPPING_RANGE',
    };
  }

  const rangeLocation = computeRangeLocation(price, supportCandidate.mid, resistanceCandidate.mid);

  return { rangeLocation, source, confidence, nearestSupport: supportCandidate, nearestResistance: resistanceCandidate };
}
