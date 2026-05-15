import type { Candle } from './primitives.js';
import type {
  ClusterComponent,
  StructureZone,
  ZoneFormationSummary,
  ZoneFormationTrace,
  ZoneFormationType,
} from './sr.types.js';

export function enrichZoneFormation(input: {
  zone: StructureZone;
  candles: readonly Candle[];
  currentPrice: number;
}): StructureZone {
  const { zone, candles, currentPrice } = input;
  const formationTrace = buildFormationTrace(zone, candles);
  const formationSummary = buildFormationSummary(zone, currentPrice);

  return {
    ...zone,
    formationSummary,
    formationTrace,
    ...(zone.clusterComponents !== undefined ? { clusterComponents: zone.clusterComponents } : {}),
  };
}

function buildFormationSummary(zone: StructureZone, currentPrice: number): ZoneFormationSummary {
  const formationType = getFormationType(zone);
  const range = `${formatPrice(zone.low)}-${formatPrice(zone.high)}`;
  const roleWord = zone.role === 'RESISTANCE' ? 'resistance' : 'support';
  const inside = currentPrice >= zone.low && currentPrice <= zone.high;

  if (formationType === 'FLIPPED') {
    const previousRole = zone.originalRole === 'RESISTANCE' ? 'resistance' : 'support';
    const newRole = zone.role === 'SUPPORT' ? 'support' : 'resistance';
    return {
      shortLabel: `Former ${previousRole} flipped into ${newRole}`,
      formationType,
      formedFrom: `This zone started as ${previousRole}, was broken, then retested and held as ${newRole}.`,
      priceLogic: priceLogicForZone(zone),
      lifecycleLogic: `Marked FLIPPED after price respected the old ${previousRole} from the other side.`,
      qualityReason: qualityReason(zone, inside),
      traderMeaning: inside
        ? `Decision zone inside ${range}. Wait for breakout/retest or rejection.`
        : `Role-reversal ${newRole} context around ${range}.`,
    };
  }

  if (formationType === 'CLUSTER') {
    const componentCount = zone.clusterComponents?.length;
    return {
      shortLabel: `Formed from ${zone.timeframe.toUpperCase()} ${roleWord} cluster`,
      formationType,
      formedFrom: componentCount !== undefined && componentCount > 0
        ? `${componentCount} nearby same-role ${roleWord} candidates were merged into one ${roleWord} zone.`
        : `Nearby same-role ${roleWord} candidates were merged into one ${roleWord} zone.`,
      priceLogic: `Cluster boundaries span the merged candle body and wick areas: low=${formatPrice(zone.low)}, high=${formatPrice(zone.high)}.`,
      lifecycleLogic: lifecycleLogic(zone),
      qualityReason: qualityReason(zone, inside),
      traderMeaning: inside
        ? `Decision zone inside ${range}. Wait for breakout/retest or rejection.`
        : `${roleWord[0]!.toUpperCase()}${roleWord.slice(1)} area around ${range}.`,
    };
  }

  if (formationType === 'SWING_HIGH') {
    return {
      shortLabel: `Formed from confirmed ${zone.timeframe.toUpperCase()} swing-high resistance`,
      formationType,
      formedFrom: `Confirmed swing high at originIndex=${zone.originIndex} created this resistance area.`,
      priceLogic: `Zone high is the swing candle wick high (${formatPrice(zone.high)}); zone low is the upper candle body edge before any width adjustment.`,
      lifecycleLogic: lifecycleLogic(zone),
      qualityReason: qualityReason(zone, inside),
      traderMeaning: inside
        ? `Decision zone inside ${range}. Wait for breakout/retest or rejection.`
        : `Resistance context around ${range}.`,
    };
  }

  return {
    shortLabel: `Formed from confirmed ${zone.timeframe.toUpperCase()} swing-low support`,
    formationType: 'SWING_LOW',
    formedFrom: `Confirmed swing low at originIndex=${zone.originIndex} created this support area.`,
    priceLogic: `Zone low is the swing candle wick low (${formatPrice(zone.low)}); zone high is the lower candle body edge before any width adjustment.`,
    lifecycleLogic: lifecycleLogic(zone),
    qualityReason: qualityReason(zone, inside),
    traderMeaning: inside
      ? `Decision zone inside ${range}. Wait for breakout/retest or rejection.`
      : `Support context around ${range}.`,
  };
}

function buildFormationTrace(zone: StructureZone, candles: readonly Candle[]): ZoneFormationTrace {
  const originCandle = candles[zone.originIndex];
  const existing = zone.formationTrace;
  const initialZone = existing?.initialZone ?? {
    low: zone.low,
    high: zone.high,
    formula: formulaForZone(zone),
  };

  const lifecycleEvents = mergeLifecycleEvents([
    ...(existing?.lifecycleEvents ?? []),
    {
      type: 'CREATED' as const,
      at: zone.createdAt,
      reason: `Zone became available after confirmation at index ${zone.confirmedIndex}.`,
    },
    ...(zone.lastRespectedAt !== undefined
      ? [{
          type: 'TESTED' as const,
          at: zone.lastRespectedAt,
          reason: 'Price respected the zone after formation.',
        }]
      : []),
    ...(zone.brokenAt !== undefined
      ? [{
          type: 'BROKEN' as const,
          at: zone.brokenAt,
          reason: 'Price closed beyond the zone boundary.',
        }]
      : []),
    ...(zone.flippedAt !== undefined
      ? [{
          type: 'FLIPPED' as const,
          at: zone.flippedAt,
          reason: 'Broken zone was retested and respected from the opposite side.',
        }]
      : []),
    ...(zone.invalidatedAt !== undefined
      ? [{
          type: 'INVALIDATED' as const,
          at: zone.invalidatedAt,
          reason: 'Zone was invalidated by later price action.',
        }]
      : []),
  ]);

  return {
    ...(existing?.detectedPivot !== undefined
      ? { detectedPivot: existing.detectedPivot }
      : originCandle !== undefined && (zone.origin === 'SWING_HIGH' || zone.origin === 'SWING_LOW')
        ? {
            detectedPivot: {
              type: zone.origin,
              originIndex: zone.originIndex,
              originAt: zone.originAt,
              open: originCandle.open,
              high: originCandle.high,
              low: originCandle.low,
              close: originCandle.close,
            },
          }
        : {}),
    initialZone,
    ...(existing?.widthAdjustment !== undefined ? { widthAdjustment: existing.widthAdjustment } : {}),
    ...(existing?.clustering !== undefined
      ? { clustering: existing.clustering }
      : zone.clusterComponents !== undefined
        ? { clustering: { applied: true, components: zone.clusterComponents } }
        : {}),
    lifecycleEvents,
  };
}

function mergeLifecycleEvents(
  events: ZoneFormationTrace['lifecycleEvents']
): ZoneFormationTrace['lifecycleEvents'] {
  const seen = new Set<string>();
  const result: ZoneFormationTrace['lifecycleEvents'] = [];
  for (const event of events) {
    const key = `${event.type}:${event.at.toISOString()}:${event.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }
  return result.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function getFormationType(zone: StructureZone): ZoneFormationType {
  if (zone.lifecycle === 'FLIPPED') return 'FLIPPED';
  if (zone.origin === 'SWING_HIGH') return 'SWING_HIGH';
  if (zone.origin === 'SWING_LOW') return 'SWING_LOW';
  return 'CLUSTER';
}

function formulaForZone(zone: StructureZone): string {
  if (zone.origin === 'SWING_HIGH') {
    return 'RESISTANCE: zone.high = swing candle high; zone.low = max(open, close)';
  }
  if (zone.origin === 'SWING_LOW') {
    return 'SUPPORT: zone.low = swing candle low; zone.high = min(open, close)';
  }
  return 'CLUSTER: merged same-role candidate zones';
}

function priceLogicForZone(zone: StructureZone): string {
  if (zone.originalRole === 'RESISTANCE') {
    return `Original resistance came from a wick-to-body swing-high area; current bounds are ${formatPrice(zone.low)}-${formatPrice(zone.high)}.`;
  }
  return `Original support came from a wick-to-body swing-low area; current bounds are ${formatPrice(zone.low)}-${formatPrice(zone.high)}.`;
}

function lifecycleLogic(zone: StructureZone): string {
  if (zone.lifecycle === 'FRESH') return 'Zone is untested because no clean respect has been confirmed yet.';
  if (zone.lifecycle === 'TESTED') return 'Zone is respected because price has produced a clean reaction from it.';
  if (zone.lifecycle === 'BROKEN') return 'Zone is broken transition context and is not active S1/R1 support/resistance.';
  if (zone.lifecycle === 'INVALIDATED') return 'Zone is invalidated and should not be treated as active structure.';
  return 'Zone has flipped after break, retest, and respect from the opposite side.';
}

function qualityReason(zone: StructureZone, inside: boolean): string {
  const reaction = zone.reactionQuality?.reactionStrength ?? 'NONE';
  const evidence = zone.structuredEvidence;
  const reasons: string[] = [];

  reasons.push(`${zone.quality.toLowerCase()} quality with score ${round(zone.score)}/10`);
  reasons.push(`reaction=${reaction}`);
  if (evidence?.recentlyRespected === true) reasons.push('recently respected');
  if (evidence?.recentlyRespected === false) reasons.push('no recent respect');
  if (evidence?.noisy === true) reasons.push('noisy interaction');
  if (evidence?.hasPassThrough === true) reasons.push('has pass-through');
  if (inside) reasons.push('price is inside the zone');

  return `${reasons.join('; ')}.`;
}

function formatPrice(value: number): string {
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (value >= 10) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toPrecision(4);
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function buildClusterComponent(input: {
  zone: StructureZone;
  mergeReason: ClusterComponent['mergeReason'];
}): ClusterComponent {
  const { zone, mergeReason } = input;
  return {
    sourceZoneId: zone.id,
    sourceType: zone.origin === 'SWING_LOW' ? 'SWING_LOW' : 'SWING_HIGH',
    originAt: zone.originAt,
    low: zone.low,
    high: zone.high,
    mid: zone.mid,
    mergeReason,
  };
}
