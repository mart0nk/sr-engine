import type {
  ContextZone,
  SupportResistanceSnapshot,
  SupportResistanceWarning,
  SupportResistanceZone,
  ZoneLifecycle,
  ZoneTier,
} from './sr.types.js';
import type { Timeframe } from './primitives.js';

export type ChartOverlayState = 'ACTIONABLE' | 'WATCHABLE' | 'CONTEXT' | 'TRANSITION';

export type ChartOverlayKind =
  | 'SUPPORT_ZONE'
  | 'RESISTANCE_ZONE'
  | 'CONTEXT_ZONE'
  | 'TRANSITION_ZONE';

export type ChartOverlay = {
  id: string;
  kind: ChartOverlayKind;
  state: ChartOverlayState;
  symbol: string;
  timeframe: Timeframe;
  low: number;
  high: number;
  mid: number;
  fromTime: Date;
  toTime: Date;
  label: string;
  lifecycle: ZoneLifecycle;
  tier?: ZoneTier;
  warnings: SupportResistanceWarning[];
  evidence: string[];
  sourceZoneId?: string;
};

export type ChartOverlayOptions = {
  includeContext?: boolean;
  includeTransition?: boolean;
};

export function toChartOverlays(
  snapshot: SupportResistanceSnapshot,
  options: ChartOverlayOptions = {},
): ChartOverlay[] {
  const includeContext = options.includeContext ?? true;
  const includeTransition = options.includeTransition ?? true;

  const overlays: ChartOverlay[] = [
    ...snapshot.supportZones.map((zone) =>
      zoneToOverlay(snapshot, zone, 'SUPPORT_ZONE', tierToOverlayState(zone.tier), zone.originAt),
    ),
    ...snapshot.resistanceZones.map((zone) =>
      zoneToOverlay(snapshot, zone, 'RESISTANCE_ZONE', tierToOverlayState(zone.tier), zone.originAt),
    ),
  ];

  if (includeContext) {
    overlays.push(
      ...(snapshot.contextZones ?? []).map((zone) => contextZoneToOverlay(snapshot, zone)),
    );
  }

  if (includeTransition) {
    overlays.push(
      ...(snapshot.transitionZones ?? []).map((zone) =>
        zoneToOverlay(snapshot, zone, 'TRANSITION_ZONE', 'TRANSITION', zone.originAt),
      ),
    );
  }

  return overlays;
}

function zoneToOverlay(
  snapshot: SupportResistanceSnapshot,
  zone: SupportResistanceZone,
  kind: ChartOverlayKind,
  state: ChartOverlayState,
  fromTime: Date,
): ChartOverlay {
  return {
    id: zone.id,
    kind,
    state,
    symbol: zone.symbol,
    timeframe: zone.timeframe,
    low: zone.low,
    high: zone.high,
    mid: zone.mid,
    fromTime,
    toTime: snapshot.timestamp,
    label: [zone.role, zone.lifecycle, zone.tier].filter(Boolean).join(' '),
    lifecycle: zone.lifecycle,
    ...(zone.tier !== undefined ? { tier: zone.tier } : {}),
    warnings: [...zone.warnings],
    evidence: [...zone.evidence],
  };
}

function contextZoneToOverlay(
  snapshot: SupportResistanceSnapshot,
  zone: ContextZone,
): ChartOverlay {
  return {
    id: zone.id,
    kind: 'CONTEXT_ZONE',
    state: 'CONTEXT',
    symbol: zone.symbol,
    timeframe: zone.timeframe,
    low: zone.low,
    high: zone.high,
    mid: zone.mid,
    fromTime: snapshot.timestamp,
    toTime: snapshot.timestamp,
    label: `${zone.kind} ${zone.lifecycle}`,
    lifecycle: zone.lifecycle,
    warnings: [...zone.warnings],
    evidence: [...zone.evidence],
    sourceZoneId: zone.sourceZoneId,
  };
}

function tierToOverlayState(tier?: ZoneTier): ChartOverlayState {
  switch (tier) {
    case 'WATCHABLE':
      return 'WATCHABLE';
    case 'CONTEXT':
    case 'DROP':
      return 'CONTEXT';
    case 'ACTIONABLE':
    default:
      return 'ACTIONABLE';
  }
}
