import type { StructureZone, StructureWarning } from './sr.types.js';
import { canResolveAsClosest } from './zone-kind.js';

export type ClosestZonesResult = {
  s1?: StructureZone;
  s2?: StructureZone;
  r1?: StructureZone;
  r2?: StructureZone;
  closestSupport?: StructureZone;
  closestResistance?: StructureZone;
  s1SelectionReason?: 'BEST_VALID_SUPPORT' | 'LOW_QUALITY_FALLBACK' | 'NONE';
  r1SelectionReason?: 'BEST_VALID_RESISTANCE' | 'LOW_QUALITY_FALLBACK' | 'NONE';
  warnings: StructureWarning[];
  evidence: string[];
};

export function resolveClosestZones(input: {
  zones: readonly StructureZone[];
  price: number;
}): ClosestZonesResult {
  const { zones, price } = input;
  const warnings: StructureWarning[] = [];
  const evidence: string[] = [];

  const validSupports = zones.filter(
    (z) =>
      canResolveAsClosest(z) &&
      z.role === 'SUPPORT' &&
      (z.high <= price || isInsideZone(z, price))
  );

  const validResistances = zones.filter(
    (z) =>
      canResolveAsClosest(z) &&
      z.role === 'RESISTANCE' &&
      (z.low >= price || isInsideZone(z, price))
  );

  const sortedSupports = sortZonesByProximityQualityAndLifecycle(validSupports, price);
  const sortedResistances = sortZonesByProximityQualityAndLifecycle(validResistances, price);

  const result: ClosestZonesResult = { warnings, evidence };

  const s1Support = sortedSupports[0];
  if (s1Support !== undefined) {
    result.s1 = s1Support;
    result.s1SelectionReason = s1Support.quality === 'LOW' ? 'LOW_QUALITY_FALLBACK' : 'BEST_VALID_SUPPORT';
    if (s1Support.quality === 'LOW') warnings.push('USING_LOW_QUALITY_SUPPORT_FALLBACK');
    const s2Support = sortedSupports[1];
    if (s2Support !== undefined) result.s2 = s2Support;
  } else {
    result.s1SelectionReason = 'NONE';
    warnings.push('NO_VALID_SUPPORT');
  }

  const r1Resistance = sortedResistances[0];
  if (r1Resistance !== undefined) {
    result.r1 = r1Resistance;
    result.r1SelectionReason = r1Resistance.quality === 'LOW' ? 'LOW_QUALITY_FALLBACK' : 'BEST_VALID_RESISTANCE';
    if (r1Resistance.quality === 'LOW') warnings.push('USING_LOW_QUALITY_RESISTANCE_FALLBACK');
    const r2Resistance = sortedResistances[1];
    if (r2Resistance !== undefined) result.r2 = r2Resistance;
  } else {
    result.r1SelectionReason = 'NONE';
    warnings.push('NO_VALID_RESISTANCE');
  }

  const cs = sortedSupports[0];
  if (cs !== undefined) result.closestSupport = cs;
  const cr = sortedResistances[0];
  if (cr !== undefined) result.closestResistance = cr;

  return result;
}

function isInsideZone(zone: StructureZone, price: number): boolean {
  return price >= zone.low && price <= zone.high;
}

function qualityRank(zone: StructureZone): number {
  if (zone.quality === 'HIGH') return 3;
  if (zone.quality === 'MEDIUM') return 2;
  return 1;
}

function lifecycleBonus(zone: StructureZone): number {
  if (zone.lifecycle === 'FLIPPED' || zone.lifecycle === 'TESTED') return 1;
  return 0;
}

function sortZonesByProximityQualityAndLifecycle(zones: StructureZone[], price: number): StructureZone[] {
  return [...zones].sort((a, b) => {
    const aDist = distanceFromZoneBoundary(a, price);
    const bDist = distanceFromZoneBoundary(b, price);
    const distanceDiffBps = (aDist - bDist) / price * 10000;

    if (Math.abs(distanceDiffBps) > 10) {
      return aDist - bDist;
    }

    const aQuality = qualityRank(a);
    const bQuality = qualityRank(b);
    if (aQuality !== bQuality) return bQuality - aQuality;

    const aBonus = lifecycleBonus(a);
    const bBonus = lifecycleBonus(b);
    if (aBonus !== bBonus) return bBonus - aBonus;

    return aDist - bDist;
  });
}

function distanceFromZoneBoundary(zone: StructureZone, price: number): number {
  if (price < zone.low) return zone.low - price;
  if (price > zone.high) return price - zone.high;
  return 0;
}
