import type { Candle, Timeframe } from './primitives.js';
import type { SupportResistanceInput } from './sr-engine.js';

export type SrValidationIssueCode =
  | 'EMPTY_CANDLES'
  | 'INVALID_TIMEFRAME'
  | 'UNSORTED_CANDLES'
  | 'DUPLICATE_CANDLE_TIMESTAMP'
  | 'OPEN_CANDLE_NOT_ALLOWED'
  | 'INVALID_OHLC'
  | 'INVALID_CANDLE_DURATION'
  | 'NON_FINITE_NUMBER'
  | 'NEGATIVE_VOLUME'
  | 'TIMEFRAME_GAP'
  | 'TIMEFRAME_MISMATCH'
  | 'SYMBOL_MISMATCH'
  | 'MISSING_ATR'
  | 'INVALID_ATR'
  | 'MISSING_TICK_SIZE'
  | 'INVALID_TICK_SIZE'
  | 'INVALID_CURRENT_PRICE';

export type SrValidationIssue = {
  code: SrValidationIssueCode;
  severity: 'ERROR' | 'WARNING';
  message: string;
  candleIndex?: number;
  field?: string;
  expected?: unknown;
  actual?: unknown;
};

export type SupportResistanceValidationOptions = {
  requireAtr?: boolean;
  requireTickSize?: boolean;
  enforceClosedCandles?: boolean;
  gapPolicy?: 'reject' | 'warn' | 'allow';
  maxAllowedGapCount?: number;
  maxAllowedGapMs?: number;
  allowLatestOpenCandleAsPriceContext?: boolean;
};

const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};
const VALID_TIMEFRAMES = Object.keys(TIMEFRAME_MS) as Timeframe[];

const DEFAULT_VALIDATION_OPTIONS: Required<SupportResistanceValidationOptions> = {
  requireAtr: true,
  requireTickSize: true,
  enforceClosedCandles: true,
  gapPolicy: 'reject',
  maxAllowedGapCount: 0,
  maxAllowedGapMs: 0,
  allowLatestOpenCandleAsPriceContext: false,
};

export function resolveSupportResistanceValidationOptions(
  options: SupportResistanceValidationOptions = {},
): Required<SupportResistanceValidationOptions> {
  return {
    ...DEFAULT_VALIDATION_OPTIONS,
    ...options,
  };
}

export function validateSupportResistanceInput(
  input: SupportResistanceInput,
  options: SupportResistanceValidationOptions = {},
): SrValidationIssue[] {
  const resolved = resolveSupportResistanceValidationOptions(options);
  const issues: SrValidationIssue[] = [];
  const timeframeMs = validateInputTimeframe(input.timeframe, issues);

  validateCurrentPrice(input.currentPrice, issues);
  validateAtr(input.atr, resolved.requireAtr, issues);
  validateTickSize(input.tickSize, input.currentPrice, resolved.requireTickSize, issues);

  if (input.candles.length === 0) {
    issues.push({
      code: 'EMPTY_CANDLES',
      severity: 'ERROR',
      message: 'At least one candle is required',
      field: 'candles',
      expected: 'non-empty array',
      actual: 0,
    });
    return issues;
  }

  const gapIssues = validateCandles(input, resolved, timeframeMs);
  issues.push(...gapIssues.issues);

  if (
    resolved.maxAllowedGapCount > 0 &&
    gapIssues.gapCount > resolved.maxAllowedGapCount &&
    resolved.gapPolicy !== 'allow'
  ) {
    issues.push({
      code: 'TIMEFRAME_GAP',
      severity: resolved.gapPolicy === 'reject' ? 'ERROR' : 'WARNING',
      message: 'Candle stream exceeded the configured maximum number of allowed gaps',
      field: 'candles',
      expected: `<= ${resolved.maxAllowedGapCount} gaps`,
      actual: gapIssues.gapCount,
    });
  }

  return dedupeIssues(issues);
}

function validateCurrentPrice(currentPrice: number, issues: SrValidationIssue[]): void {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    issues.push({
      code: 'INVALID_CURRENT_PRICE',
      severity: 'ERROR',
      message: 'currentPrice must be a finite number greater than 0',
      field: 'currentPrice',
      actual: currentPrice,
    });
  }
}

function validateAtr(
  atr: number | undefined,
  requireAtr: boolean,
  issues: SrValidationIssue[],
): void {
  if (atr === undefined) {
    if (requireAtr) {
      issues.push({
        code: 'MISSING_ATR',
        severity: 'ERROR',
        message: 'ATR is required in strict mode',
        field: 'atr',
      });
    }
    return;
  }

  if (!Number.isFinite(atr) || atr <= 0) {
    issues.push({
      code: 'INVALID_ATR',
      severity: 'ERROR',
      message: 'ATR must be a finite number greater than 0',
      field: 'atr',
      actual: atr,
    });
  }
}

function validateTickSize(
  tickSize: number | undefined,
  currentPrice: number,
  requireTickSize: boolean,
  issues: SrValidationIssue[],
): void {
  if (tickSize === undefined) {
    if (requireTickSize) {
      issues.push({
        code: 'MISSING_TICK_SIZE',
        severity: 'ERROR',
        message: 'tickSize is required in strict mode',
        field: 'tickSize',
      });
    }
    return;
  }

  if (!Number.isFinite(tickSize) || tickSize <= 0 || tickSize >= currentPrice) {
    issues.push({
      code: 'INVALID_TICK_SIZE',
      severity: 'ERROR',
      message: 'tickSize must be a finite number greater than 0 and less than currentPrice',
      field: 'tickSize',
      actual: tickSize,
      expected: `0 < tickSize < ${currentPrice}`,
    });
  }
}

function validateCandles(
  input: SupportResistanceInput,
  options: Required<SupportResistanceValidationOptions>,
  timeframeMs: number | undefined,
): { issues: SrValidationIssue[]; gapCount: number } {
  const issues: SrValidationIssue[] = [];
  let previousOpenTime: number | undefined;
  let gapCount = 0;
  let trailingOpenCandleConsumed = false;

  for (let index = 0; index < input.candles.length; index++) {
    const candle = input.candles[index];
    if (candle === undefined) continue;

    if (candle.symbol !== input.symbol) {
      issues.push({
        code: 'SYMBOL_MISMATCH',
        severity: 'ERROR',
        message: 'Candle symbol must match input symbol',
        candleIndex: index,
        field: 'symbol',
        expected: input.symbol,
        actual: candle.symbol,
      });
    }

    const candleTimeframeValid = isValidTimeframe(candle.timeframe);
    if (!candleTimeframeValid) {
      issues.push({
        code: 'INVALID_TIMEFRAME',
        severity: 'ERROR',
        message: 'Candle timeframe must be one of the supported timeframe literals',
        candleIndex: index,
        field: 'timeframe',
        expected: VALID_TIMEFRAMES,
        actual: candle.timeframe,
      });
    }

    if (candle.timeframe !== input.timeframe) {
      issues.push({
        code: 'TIMEFRAME_MISMATCH',
        severity: 'ERROR',
        message: 'Candle timeframe must match input timeframe',
        candleIndex: index,
        field: 'timeframe',
        expected: input.timeframe,
        actual: candle.timeframe,
      });
    }

    validateCandleNumbers(candle, index, issues);

    const openTime = candle.openTime.getTime();
    if (!Number.isFinite(openTime)) {
      issues.push({
        code: 'NON_FINITE_NUMBER',
        severity: 'ERROR',
        message: 'openTime must be a valid Date',
        candleIndex: index,
        field: 'openTime',
        actual: candle.openTime,
      });
    }

    if (candle.closeTime !== undefined) {
      const closeTime = candle.closeTime.getTime();
      if (!Number.isFinite(closeTime)) {
        issues.push({
          code: 'NON_FINITE_NUMBER',
          severity: 'ERROR',
          message: 'closeTime must be a valid Date',
          candleIndex: index,
          field: 'closeTime',
          actual: candle.closeTime,
        });
      } else if (closeTime <= openTime) {
        issues.push({
          code: 'INVALID_OHLC',
          severity: 'ERROR',
          message: 'closeTime must be greater than openTime',
          candleIndex: index,
          field: 'closeTime',
          expected: `> ${openTime}`,
          actual: closeTime,
        });
      } else if (timeframeMs !== undefined) {
        const expectedDuration = timeframeMs - 1;
        const actualDuration = closeTime - openTime;
        if (actualDuration !== expectedDuration) {
          issues.push({
            code: 'INVALID_CANDLE_DURATION',
            severity: 'ERROR',
            message:
              'closeTime - openTime must match the inclusive candle duration for the declared timeframe',
            candleIndex: index,
            field: 'closeTime',
            expected: expectedDuration,
            actual: actualDuration,
          });
        }
      }
    }

    if (options.enforceClosedCandles && candle.closed !== true) {
      const isTrailingAllowed =
        options.allowLatestOpenCandleAsPriceContext &&
        index === input.candles.length - 1 &&
        !trailingOpenCandleConsumed;

      if (isTrailingAllowed) {
        trailingOpenCandleConsumed = true;
      } else {
        issues.push({
          code: 'OPEN_CANDLE_NOT_ALLOWED',
          severity: 'ERROR',
          message: 'Structure candles must be closed in strict mode',
          candleIndex: index,
          field: 'closed',
          expected: true,
          actual: candle.closed,
        });
      }
    }

    if (previousOpenTime !== undefined) {
      if (openTime < previousOpenTime) {
        issues.push({
          code: 'UNSORTED_CANDLES',
          severity: 'ERROR',
          message: 'Candles must be sorted oldest to newest',
          candleIndex: index,
          field: 'openTime',
          expected: `>= ${previousOpenTime}`,
          actual: openTime,
        });
      } else if (openTime === previousOpenTime) {
        issues.push({
          code: 'DUPLICATE_CANDLE_TIMESTAMP',
          severity: 'ERROR',
          message: 'Duplicate candle timestamps are not allowed',
          candleIndex: index,
          field: 'openTime',
          actual: openTime,
        });
      } else {
        const delta = openTime - previousOpenTime;
        if (timeframeMs !== undefined && delta !== timeframeMs) {
          const gapDelta = Math.abs(delta - timeframeMs);
          if (options.maxAllowedGapMs === 0 || gapDelta > options.maxAllowedGapMs) {
            gapCount += 1;
            if (options.gapPolicy !== 'allow') {
              issues.push({
                code: 'TIMEFRAME_GAP',
                severity: options.gapPolicy === 'reject' ? 'ERROR' : 'WARNING',
                message: 'Candle stream contains a timeframe gap',
                candleIndex: index,
                field: 'openTime',
                expected: previousOpenTime + timeframeMs,
                actual: openTime,
              });
            }
          }
        }
      }
    }

    previousOpenTime = openTime;
  }

  return { issues, gapCount };
}

function validateInputTimeframe(
  timeframe: SupportResistanceInput['timeframe'],
  issues: SrValidationIssue[],
): number | undefined {
  if (!isValidTimeframe(timeframe)) {
    issues.push({
      code: 'INVALID_TIMEFRAME',
      severity: 'ERROR',
      message: 'timeframe must be one of the supported timeframe literals',
      field: 'timeframe',
      expected: VALID_TIMEFRAMES,
      actual: timeframe,
    });
    return undefined;
  }

  return TIMEFRAME_MS[timeframe];
}

function isValidTimeframe(value: unknown): value is Timeframe {
  return typeof value === 'string' && VALID_TIMEFRAMES.includes(value as Timeframe);
}

function validateCandleNumbers(
  candle: Candle,
  candleIndex: number,
  issues: SrValidationIssue[],
): void {
  const numericFields = {
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  } as const;

  for (const [field, value] of Object.entries(numericFields)) {
    if (!Number.isFinite(value)) {
      issues.push({
        code: 'NON_FINITE_NUMBER',
        severity: 'ERROR',
        message: `${field} must be a finite number`,
        candleIndex,
        field,
        actual: value,
      });
    }
  }

  for (const field of ['open', 'high', 'low', 'close'] as const) {
    if (!(candle[field] > 0)) {
      issues.push({
        code: 'INVALID_OHLC',
        severity: 'ERROR',
        message: `${field} must be greater than 0`,
        candleIndex,
        field,
        actual: candle[field],
      });
    }
  }

  if (candle.volume < 0) {
    issues.push({
      code: 'NEGATIVE_VOLUME',
      severity: 'ERROR',
      message: 'volume must be greater than or equal to 0',
      candleIndex,
      field: 'volume',
      actual: candle.volume,
    });
  }

  if (!(candle.high >= Math.max(candle.open, candle.close, candle.low))) {
    issues.push({
      code: 'INVALID_OHLC',
      severity: 'ERROR',
      message: 'high must be greater than or equal to open, close, and low',
      candleIndex,
      field: 'high',
      actual: candle.high,
    });
  }

  if (!(candle.low <= Math.min(candle.open, candle.close, candle.high))) {
    issues.push({
      code: 'INVALID_OHLC',
      severity: 'ERROR',
      message: 'low must be less than or equal to open, close, and high',
      candleIndex,
      field: 'low',
      actual: candle.low,
    });
  }
}

function dedupeIssues(issues: SrValidationIssue[]): SrValidationIssue[] {
  const seen = new Set<string>();
  const deduped: SrValidationIssue[] = [];
  for (const issue of issues) {
    const key = JSON.stringify(issue);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(issue);
  }
  return deduped;
}
