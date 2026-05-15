export class SrError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(params: {
    message: string;
    statusCode?: number;
    code?: string;
    details?: unknown;
  }) {
    super(params.message);
    this.name = 'SrError';
    this.statusCode = params.statusCode ?? 500;
    this.code = params.code ?? 'SR_ERROR';
    if (params.details !== undefined) {
      this.details = params.details;
    }
  }
}

export type SrErrorCode =
  | 'SR_INSUFFICIENT_CANDLES'
  | 'SR_INVALID_CANDLE'
  | 'SR_INVALID_TIMEFRAME'
  | 'SR_CALCULATION_FAILED'
  | 'SR_INVALID_SYMBOL'
  | 'SR_UNSUPPORTED_ZONE_POLICY';

export const SrErrors = {
  insufficientCandles(details?: unknown): SrError {
    return new SrError({
      statusCode: 422,
      code: 'SR_INSUFFICIENT_CANDLES',
      message: 'Not enough candles for structure analysis',
      ...(details !== undefined ? { details } : {}),
    });
  },

  invalidCandle(message: string, details?: unknown): SrError {
    return new SrError({
      statusCode: 422,
      code: 'SR_INVALID_CANDLE',
      message,
      ...(details !== undefined ? { details } : {}),
    });
  },

  invalidTimeframe(timeframe: string): SrError {
    return new SrError({
      statusCode: 400,
      code: 'SR_INVALID_TIMEFRAME',
      message: `Invalid timeframe: ${timeframe}`,
    });
  },

  calculationFailed(message: string, details?: unknown): SrError {
    return new SrError({
      statusCode: 500,
      code: 'SR_CALCULATION_FAILED',
      message,
      ...(details !== undefined ? { details } : {}),
    });
  },

  invalidSymbol(symbol: string): SrError {
    return new SrError({
      statusCode: 400,
      code: 'SR_INVALID_SYMBOL',
      message: `Invalid symbol: ${symbol}`,
    });
  },

  unsupportedZonePolicy(policy: string): SrError {
    return new SrError({
      statusCode: 400,
      code: 'SR_UNSUPPORTED_ZONE_POLICY',
      message: `Unsupported zone construction policy: ${policy}`,
    });
  },
} as const;
