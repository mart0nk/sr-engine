import type { StructureZone, StructureWarning } from './sr.types.js';
import type { SupportResistanceConfig } from './sr-config.js';
import { resolveSupportResistanceConfig } from './sr-config.js';

export function normalizeZoneWidth(input: {
  zone: StructureZone;
  price?: number;
  atr?: number;
  tickSize?: number;
  config?: Partial<SupportResistanceConfig>;
}): StructureZone {
  const config = resolveSupportResistanceConfig(input.config);
  const price = input.price ?? input.zone.mid;
  const fallbackTickSize = price * 0.0001;
  const effectiveTickSize = input.tickSize ?? fallbackTickSize;

  const minWidth = Math.max(
    config.minWidthTicks * effectiveTickSize,
    price * config.minWidthPct
  );
  const atrMaxWidth =
    input.atr != null
      ? config.maxWidthAtrMultiplier * input.atr
      : Number.POSITIVE_INFINITY;
  const pctMaxWidth = price * config.maxWidthPct;
  const maxWidth = Math.max(minWidth, Math.min(pctMaxWidth, atrMaxWidth));

  let low = input.zone.low;
  let high = input.zone.high;
  if (high < low) {
    [high, low] = [low, high];
  }

  const warnings = new Set<StructureWarning>(input.zone.warnings);
  const computedWidth = high - low;

  if (computedWidth < minWidth) {
    const center = (high + low) / 2;
    high = center + minWidth / 2;
    low = center - minWidth / 2;
    warnings.add('ZONE_TOO_NARROW_EXPANDED');
  } else if (computedWidth > maxWidth) {
    warnings.add('ZONE_TOO_WIDE');
  }

  const mid = (low + high) / 2;
  const widthPct = (high - low) / mid * 100;

  const normalized: StructureZone = {
    ...input.zone,
    low,
    high,
    mid,
    widthPct,
    warnings: [...warnings],
  };

  if (input.atr != null) {
    normalized.widthAtr = (high - low) / input.atr;
  } else {
    delete normalized.widthAtr;
  }

  return normalized;
}
