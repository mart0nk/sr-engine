import type { Candle } from './primitives.js';

export type PivotPoint = {
  type: 'HIGH' | 'LOW';

  originIndex: number;
  confirmedIndex: number;
  availableFromIndex: number;

  originAt: Date;
  confirmedAt: Date;

  price: number;
  candleHigh: number;
  candleLow: number;

  leftBars: number;
  rightBars: number;

  strength: number;
};

export function detectPivots(input: {
  candles: readonly Candle[];
  leftBars?: number;
  rightBars?: number;
}): PivotPoint[] {
  const { candles } = input;
  const leftBars = input.leftBars ?? 2;
  const rightBars = input.rightBars ?? 2;
  const minLength = leftBars + rightBars + 1;

  if (candles.length < minLength) return [];

  const pivots: PivotPoint[] = [];

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const candle = candles[i];
    if (candle === undefined) continue;
    const confirmedIndex = i + rightBars;
    const confirmedCandle = candles[confirmedIndex];
    if (confirmedCandle === undefined) continue;

    const isPivotHigh = checkPivotHigh(candles, i, leftBars, rightBars);
    const isPivotLow = checkPivotLow(candles, i, leftBars, rightBars);

    if (isPivotHigh) {
      pivots.push({
        type: 'HIGH',
        originIndex: i,
        confirmedIndex,
        availableFromIndex: confirmedIndex + 1,
        originAt: candle.openTime,
        confirmedAt: confirmedCandle.openTime,
        price: candle.high,
        candleHigh: candle.high,
        candleLow: candle.low,
        leftBars,
        rightBars,
        strength: computeStrength(candles, i, leftBars, rightBars, 'HIGH'),
      });
    }

    if (isPivotLow) {
      pivots.push({
        type: 'LOW',
        originIndex: i,
        confirmedIndex,
        availableFromIndex: confirmedIndex + 1,
        originAt: candle.openTime,
        confirmedAt: confirmedCandle.openTime,
        price: candle.low,
        candleHigh: candle.high,
        candleLow: candle.low,
        leftBars,
        rightBars,
        strength: computeStrength(candles, i, leftBars, rightBars, 'LOW'),
      });
    }
  }

  return pivots;
}

function checkPivotHigh(
  candles: readonly Candle[],
  index: number,
  leftBars: number,
  rightBars: number
): boolean {
  const pivot = candles[index];
  if (pivot === undefined) return false;

  for (let j = index - leftBars; j < index; j++) {
    const c = candles[j];
    if (c === undefined || c.high >= pivot.high) return false;
  }

  for (let j = index + 1; j <= index + rightBars; j++) {
    const c = candles[j];
    if (c === undefined || c.high >= pivot.high) return false;
  }

  return true;
}

function checkPivotLow(
  candles: readonly Candle[],
  index: number,
  leftBars: number,
  rightBars: number
): boolean {
  const pivot = candles[index];
  if (pivot === undefined) return false;

  for (let j = index - leftBars; j < index; j++) {
    const c = candles[j];
    if (c === undefined || c.low <= pivot.low) return false;
  }

  for (let j = index + 1; j <= index + rightBars; j++) {
    const c = candles[j];
    if (c === undefined || c.low <= pivot.low) return false;
  }

  return true;
}

function computeStrength(
  candles: readonly Candle[],
  index: number,
  leftBars: number,
  rightBars: number,
  type: 'HIGH' | 'LOW'
): number {
  const candle = candles[index];
  if (candle === undefined) return 0;

  const bodySize = Math.abs(candle.close - candle.open);
  const totalRange = candle.high - candle.low;
  const referenceRange = Math.max(totalRange, candle.close * 0.001, Number.EPSILON);

  const wickRejection = clamp(1 - bodySize / referenceRange, 0, 1);

  const totalBars = leftBars + rightBars;
  let respectedBars = 0;

  let marginSum = 0;
  for (let j = index - leftBars; j < index; j++) {
    const c = candles[j];
    if (c === undefined) continue;
    const margin = type === 'HIGH' ? candle.high - c.high : c.low - candle.low;
    if (margin > 0) respectedBars += 1;
    marginSum += Math.max(0, margin);
  }
  for (let j = index + 1; j <= index + rightBars; j++) {
    const c = candles[j];
    if (c === undefined) continue;
    const margin = type === 'HIGH' ? candle.high - c.high : c.low - candle.low;
    if (margin > 0) respectedBars += 1;
    marginSum += Math.max(0, margin);
  }
  const averageMargin = totalBars > 0 ? marginSum / totalBars : 0;
  const avgMarginScore = clamp(averageMargin / referenceRange, 0, 1);

  const barScore = clamp(respectedBars / totalBars, 0, 1);

  const raw = wickRejection * 4 + avgMarginScore * 4 + barScore * 2;
  return clamp(Math.round(raw * 10) / 10, 0, 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
