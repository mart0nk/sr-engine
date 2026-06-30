import type { StructureZone, ContextZone, ZoneTier, ZoneKind } from './sr.types.js';
import type {
  DescriptiveRangeContext,
  DescriptiveRangeLocation,
  DescriptiveRangeSource,
} from './sr.types.js';

type ZoneSummary = {
  id: string;
  low: number;
  high: number;
  mid: number;
  tier?: ZoneTier;
  kind?: string;
  source: 'ACTIONABLE' | 'WATCHABLE' | 'CONTEXT';
};

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

export function resolveDescriptiveRangeContext(input: {
  price: number;
  s1?: StructureZone;
  r1?: StructureZone;
  supportZones: readonly StructureZone[];
  resistanceZones: readonly StructureZone[];
  contextZones: readonly ContextZone[];
  transitionZones?: readonly StructureZone[];
  tickSize?: number;
  atr?: number;
}): DescriptiveRangeContext {
  const { price, s1, r1, supportZones, resistanceZones, contextZones } = input;

  // Best support candidate: s1 → closest supportZone below price → context zone below price
  let supportCandidate: ZoneSummary | undefined;
  if (s1 !== undefined) {
    supportCandidate = structureZoneToSummary(s1);
  } else {
    const best = supportZones
      .filter(z => z.mid <= price)
      .sort((a, b) => b.mid - a.mid)[0];
    if (best !== undefined) {
      supportCandidate = structureZoneToSummary(best);
    } else {
      const ctx = contextZones
        .filter(
          z =>
            z.mid < price &&
            (z.roleHint === undefined ||
              z.roleHint === 'SUPPORT_CONTEXT' ||
              z.roleHint === 'NEUTRAL_RANGE'),
        )
        .sort((a, b) => b.mid - a.mid)[0];
      if (ctx !== undefined) supportCandidate = contextZoneToSummary(ctx);
    }
  }

  // Best resistance candidate: r1 → closest resistanceZone above price → context zone above price
  let resistanceCandidate: ZoneSummary | undefined;
  if (r1 !== undefined) {
    resistanceCandidate = structureZoneToSummary(r1);
  } else {
    const best = resistanceZones
      .filter(z => z.mid >= price)
      .sort((a, b) => a.mid - b.mid)[0];
    if (best !== undefined) {
      resistanceCandidate = structureZoneToSummary(best);
    } else {
      const ctx = contextZones
        .filter(
          z =>
            z.mid > price &&
            (z.roleHint === undefined ||
              z.roleHint === 'RESISTANCE_CONTEXT' ||
              z.roleHint === 'NEUTRAL_RANGE'),
        )
        .sort((a, b) => a.mid - b.mid)[0];
      if (ctx !== undefined) resistanceCandidate = contextZoneToSummary(ctx);
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
    // resistanceCandidate is defined here (checked above)
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

  // Compressed: support high reaches or exceeds resistance low
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

  const rangeLocation = computeRangeLocation(
    price,
    supportCandidate.mid,
    resistanceCandidate.mid,
  );

  return {
    rangeLocation,
    source,
    confidence,
    nearestSupport: supportCandidate,
    nearestResistance: resistanceCandidate,
  };
}
