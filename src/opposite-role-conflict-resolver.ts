import type { StructureZone, ConflictResolvedZone, ConflictResolvedReason } from './sr.types.js';
import type { SupportResistanceConfig } from './sr-config.js';

export type OppositeRoleConflictResolverInput = {
  zones: readonly StructureZone[];
  price: number;
  config: SupportResistanceConfig;
  atr?: number;
  tickSize?: number;
};

export type OppositeRoleConflictResolverResult = {
  accepted: StructureZone[];
  conflictResolvedZones: ConflictResolvedZone[];
};

export function resolveOppositeRoleConflicts(
  input: OppositeRoleConflictResolverInput
): OppositeRoleConflictResolverResult {
  const minCleanGap = calcMinCleanGap({
    price: input.price,
    ...(input.tickSize !== undefined ? { tickSize: input.tickSize } : {}),
    ...(input.atr !== undefined ? { atr: input.atr } : {}),
    config: input.config,
  });

  const sorted = [...input.zones].sort(
    (a, b) => computeZonePriority(b, input.price) - computeZonePriority(a, input.price)
  );

  const accepted: StructureZone[] = [];
  const conflictResolvedZones: ConflictResolvedZone[] = [];

  for (const candidate of sorted) {
    const conflict = accepted.find(
      (existing) => existing.role !== candidate.role && hasOppositeRoleConflict(candidate, existing, minCleanGap)
    );
    if (conflict === undefined) {
      accepted.push(candidate);
    } else {
      const support = candidate.role === 'SUPPORT' ? candidate : conflict;
      const resistance = candidate.role === 'RESISTANCE' ? candidate : conflict;
      const cleanGap = resistance.low - support.high;
      conflictResolvedZones.push({
        zone: candidate,
        suppressedByZoneId: conflict.id,
        reason: classifyConflictReason(cleanGap),
        cleanGap,
        minCleanGap,
        zonePriority: computeZonePriority(candidate, input.price),
        winnerPriority: computeZonePriority(conflict, input.price),
      });
    }
  }

  return { accepted, conflictResolvedZones };
}

function computeZonePriority(zone: StructureZone, price: number): number {
  let p = 0;
  p += zone.tier === 'ACTIONABLE' ? 1000 : zone.tier === 'WATCHABLE' ? 500 : zone.tier === 'CONTEXT' ? 100 : 0;
  p += zone.qualityScore ?? zone.score * 10;
  p += zone.lifecycle === 'FLIPPED' ? 40 : zone.lifecycle === 'TESTED' ? 30 : zone.lifecycle === 'FRESH' ? 20 : 0;
  p += Math.min(zone.cleanTouchSessions ?? 0, 5) * 2;
  p += zone.structuredEvidence?.recentlyRespected === true ? 5 : 0;
  p -= Math.min(zone.structuredEvidence?.noisyTouchSessions ?? zone.noisyTouchSessions ?? 0, 5) * 2;
  p -= Math.min(zone.structuredEvidence?.passThroughCount ?? zone.passThroughCount ?? 0, 3) * 2;
  p -= zone.widthPct * 100;
  p -= (zone.distanceFromPricePct ?? Math.abs(zone.mid - price) / price * 100) * 0.5;
  p += zone.originIndex * 0.001;
  return p;
}

function calcMinCleanGap(input: {
  price: number;
  tickSize?: number;
  atr?: number;
  config: SupportResistanceConfig;
}): number {
  const effectiveTickSize = input.tickSize ?? input.price * 0.0001;
  return Math.max(
    effectiveTickSize * input.config.oppositeRoleMinGapTicks,
    input.price * input.config.oppositeRoleMinGapPct,
    input.atr !== undefined ? input.atr * input.config.oppositeRoleMinGapAtr : 0
  );
}

function hasOppositeRoleConflict(a: StructureZone, b: StructureZone, minCleanGap: number): boolean {
  const support = a.role === 'SUPPORT' ? a : b;
  const resistance = a.role === 'RESISTANCE' ? a : b;
  return resistance.low - support.high <= minCleanGap;
}

function classifyConflictReason(cleanGap: number): ConflictResolvedReason {
  return cleanGap < 0 ? 'OVERLAPS_STRONGER_OPPOSITE_ROLE' : 'TOO_CLOSE_TO_STRONGER_OPPOSITE_ROLE';
}
