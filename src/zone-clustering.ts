import type { ClusterComponent, StructureZone } from './sr.types.js';
import type { SupportResistanceConfig } from './sr-config.js';
import { resolveSupportResistanceConfig } from './sr-config.js';
import { normalizeZoneWidth } from './zone-width.js';

export function clusterZones(input: {
  zones: readonly StructureZone[];
  mergeDistancePct?: number;
  atr?: number;
  tickSize?: number;
  config?: Partial<SupportResistanceConfig>;
}): StructureZone[] {
  const config = resolveSupportResistanceConfig({
    ...input.config,
    ...(input.mergeDistancePct !== undefined ? { mergeDistancePct: input.mergeDistancePct } : {}),
  });

  const result: StructureZone[] = [];
  const roles = ['SUPPORT', 'RESISTANCE'] as const;

  for (const role of roles) {
    const roleZones = input.zones
      .filter((zone) => zone.role === role)
      .map((zone) => ({ ...zone, warnings: [...zone.warnings], evidence: [...zone.evidence] }))
      .sort((a, b) => a.mid - b.mid || a.createdAt.getTime() - b.createdAt.getTime());

    const clusters: StructureZone[][] = [];
    for (const zone of roleZones) {
      const lastCluster = clusters.at(-1);
      if (lastCluster === undefined) {
        clusters.push([zone]);
        continue;
      }

      if (lastCluster.some((member) => shouldMerge(member, zone, config, input.atr))) {
        lastCluster.push(zone);
      } else {
        clusters.push([zone]);
      }
    }

    for (const cluster of clusters) {
      result.push(mergeCluster({
        cluster,
        ...(input.atr !== undefined ? { atr: input.atr } : {}),
        ...(input.tickSize !== undefined ? { tickSize: input.tickSize } : {}),
        config,
      }));
    }
  }

  return result.sort((a, b) => a.mid - b.mid || a.id.localeCompare(b.id));
}

function shouldMerge(
  a: StructureZone,
  b: StructureZone,
  config: SupportResistanceConfig,
  atr: number | undefined
): boolean {
  if (a.role !== b.role) return false;
  if (a.lifecycle === 'INVALIDATED' || b.lifecycle === 'INVALIDATED') return false;

  const overlaps = a.low <= b.high && b.low <= a.high;
  if (overlaps) return true;

  const midDistancePct = Math.abs(a.mid - b.mid) / ((a.mid + b.mid) / 2);
  if (midDistancePct <= config.mergeDistancePct) return true;

  if (atr !== undefined && Math.abs(a.mid - b.mid) <= config.mergeDistanceAtrMultiplier * atr) {
    return true;
  }

  return false;
}

function mergeReason(
  a: StructureZone,
  b: StructureZone,
  config: SupportResistanceConfig,
  atr: number | undefined
): ClusterComponent['mergeReason'] | undefined {
  if (a.role !== b.role) return undefined;
  if (a.lifecycle === 'INVALIDATED' || b.lifecycle === 'INVALIDATED') return undefined;

  const overlaps = a.low <= b.high && b.low <= a.high;
  if (overlaps) return 'OVERLAP';

  const midDistancePct = Math.abs(a.mid - b.mid) / ((a.mid + b.mid) / 2);
  if (midDistancePct <= config.mergeDistancePct) return 'PCT_PROXIMITY';

  if (atr !== undefined && Math.abs(a.mid - b.mid) <= config.mergeDistanceAtrMultiplier * atr) {
    return 'ATR_PROXIMITY';
  }

  return undefined;
}

function mergeCluster(input: {
  cluster: StructureZone[];
  atr?: number;
  tickSize?: number;
  config: SupportResistanceConfig;
}): StructureZone {
  const { cluster, atr, tickSize, config } = input;
  if (cluster.length === 1) {
    const single = cluster[0]!;
    return normalizeZoneWidth({
      zone: single,
      price: single.mid,
      ...(atr !== undefined ? { atr } : {}),
      ...(tickSize !== undefined ? { tickSize } : {}),
      config,
    });
  }

  const first = cluster[0]!;
  const low = Math.min(...cluster.map((zone) => zone.low));
  const high = Math.max(...cluster.map((zone) => zone.high));
  const mid = (low + high) / 2;
  const widthPct = (high - low) / mid * 100;
  const earliestCreated = cluster.reduce((earliest, zone) =>
    zone.createdAt.getTime() < earliest.getTime() ? zone.createdAt : earliest,
    first.createdAt
  );
  const earliestOrigin = cluster.reduce((earliest, zone) =>
    zone.originAt.getTime() < earliest.getTime() ? zone.originAt : earliest,
    first.originAt
  );

  const merged: StructureZone = {
    ...first,
    id: first.id,
    origin: 'CLUSTER',
    low,
    high,
    mid,
    widthPct,
    originIndex: Math.min(...cluster.map((zone) => zone.originIndex)),
    confirmedIndex: Math.max(...cluster.map((zone) => zone.confirmedIndex)),
    availableFromIndex: Math.max(...cluster.map((zone) => zone.availableFromIndex)),
    originAt: earliestOrigin,
    createdAt: earliestCreated,
    touchCount: cluster.reduce((sum, zone) => sum + zone.touchCount, 0),
    rejectionCount: cluster.reduce((sum, zone) => sum + zone.rejectionCount, 0),
    breakCount: cluster.reduce((sum, zone) => sum + zone.breakCount, 0),
    noisyCrossCount: cluster.reduce((sum, zone) => sum + zone.noisyCrossCount, 0),
    quality: 'LOW',
    score: 0,
    warnings: [...new Set(cluster.flatMap((zone) => zone.warnings))],
    evidence: [...new Set(cluster.flatMap((zone) => zone.evidence))],
  };

  merged.clusterComponents = cluster.map((zone, index) => {
    const reason = index === 0
      ? 'OVERLAP'
      : cluster.slice(0, index)
          .map((previous) => mergeReason(previous, zone, config, atr))
          .find((value): value is ClusterComponent['mergeReason'] => value !== undefined) ?? 'MID_PROXIMITY';

    return {
      sourceZoneId: zone.id,
      sourceType: zone.origin === 'SWING_LOW' ? 'SWING_LOW' : 'SWING_HIGH',
      originAt: zone.originAt,
      low: zone.low,
      high: zone.high,
      mid: zone.mid,
      mergeReason: reason,
    };
  });

  merged.formationTrace = {
    ...(first.formationTrace ?? {
      initialZone: {
        low,
        high,
        formula: 'CLUSTER: merged same-role candidate zones',
      },
      lifecycleEvents: [],
    }),
    clustering: {
      applied: true,
      components: merged.clusterComponents,
    },
  };

  if (atr !== undefined) {
    merged.widthAtr = (high - low) / atr;
  }

  return normalizeZoneWidth({
    zone: merged,
    price: mid,
    ...(atr !== undefined ? { atr } : {}),
    ...(tickSize !== undefined ? { tickSize } : {}),
    config,
  });
}
