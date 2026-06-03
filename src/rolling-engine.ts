import { SupportResistanceEngine } from './sr-engine.js';
import { StrictSupportResistanceEngine } from './strict-engine.js';
import { resolveSupportResistanceConfig } from './sr-config.js';
import { SrErrors } from './sr-errors.js';

import type { Candle, Timeframe, PriceSource } from './primitives.js';
import type { SupportResistanceSnapshot } from './sr.types.js';
import type { SupportResistanceConfig } from './sr-config.js';
import type { SupportResistanceValidationOptions } from './strict-validation.js';

export type SupportResistanceRollingEngineOptions = {
  symbol: string;
  timeframe: Timeframe;
  config?: Partial<SupportResistanceConfig>;
  maxCandles?: number;
  strict?: boolean;
  validationOptions?: SupportResistanceValidationOptions;
};

export type SupportResistanceRollingEvaluateInput = {
  currentPrice: number;
  priceSource: PriceSource;
  timestamp: Date;
  atr?: number;
  tickSize?: number;
  config?: Partial<SupportResistanceConfig>;
  validationOptions?: SupportResistanceValidationOptions;
};

export class SupportResistanceRollingEngine {
  private readonly symbol: string;
  private readonly timeframe: Timeframe;
  private readonly strict: boolean;
  private readonly maxCandles: number | undefined;
  private readonly baseConfig: Partial<SupportResistanceConfig> | undefined;
  private readonly baseValidationOptions: SupportResistanceValidationOptions | undefined;
  private readonly permissiveEngine = new SupportResistanceEngine();
  private readonly strictEngine: StrictSupportResistanceEngine;
  private candles: Candle[] = [];

  constructor(options: SupportResistanceRollingEngineOptions) {
    this.symbol = options.symbol;
    this.timeframe = options.timeframe;
    this.strict = options.strict ?? false;
    this.baseConfig = options.config;
    this.baseValidationOptions = options.validationOptions;
    this.maxCandles = options.maxCandles;
    this.strictEngine = new StrictSupportResistanceEngine(options.validationOptions);

    if (this.maxCandles !== undefined && (!Number.isInteger(this.maxCandles) || this.maxCandles < 1)) {
      throw new RangeError('Rolling engine maxCandles must be a positive integer.');
    }
  }

  pushClosedCandle(candle: Candle): number {
    this.assertRollingCandle(candle);
    this.candles.push(candle);
    this.trimToMaxCandles();
    return this.candles.length;
  }

  pushClosedCandles(candles: readonly Candle[]): number {
    for (const candle of candles) {
      this.pushClosedCandle(candle);
    }

    return this.candles.length;
  }

  getCandles(): readonly Candle[] {
    return [...this.candles];
  }

  reset(): void {
    this.candles = [];
  }

  evaluate(input: SupportResistanceRollingEvaluateInput): SupportResistanceSnapshot {
    const config = resolveRollingConfig(this.baseConfig, input.config);
    const evaluationInput = {
      symbol: this.symbol,
      timeframe: this.timeframe,
      candles: [...this.candles],
      currentPrice: input.currentPrice,
      priceSource: input.priceSource,
      timestamp: input.timestamp,
      ...(input.atr !== undefined ? { atr: input.atr } : {}),
      ...(input.tickSize !== undefined ? { tickSize: input.tickSize } : {}),
      ...(config !== undefined ? { config } : {}),
    };

    if (this.strict) {
      return this.strictEngine.evaluate(evaluationInput, {
        ...this.baseValidationOptions,
        ...input.validationOptions,
      });
    }

    return this.permissiveEngine.evaluate(evaluationInput);
  }

  private assertRollingCandle(candle: Candle): void {
    if (candle.symbol !== this.symbol) {
      throw SrErrors.invalidSymbol(candle.symbol);
    }
    if (candle.timeframe !== this.timeframe) {
      throw SrErrors.invalidTimeframe(candle.timeframe);
    }
    if (candle.closed !== true) {
      throw SrErrors.invalidCandle('Rolling engine accepts closed candles only.', {
        symbol: candle.symbol,
        timeframe: candle.timeframe,
        openTime: candle.openTime,
      });
    }

    const last = this.candles.at(-1);
    if (last !== undefined && candle.openTime.getTime() <= last.openTime.getTime()) {
      throw SrErrors.invalidCandle('Rolling engine candles must be pushed oldest-to-newest with unique timestamps.', {
        previousOpenTime: last.openTime,
        nextOpenTime: candle.openTime,
      });
    }
  }

  private trimToMaxCandles(): void {
    if (this.maxCandles === undefined || this.candles.length <= this.maxCandles) {
      return;
    }

    this.candles = this.candles.slice(this.candles.length - this.maxCandles);
  }
}

export function createSupportResistanceRollingEngine(
  options: SupportResistanceRollingEngineOptions,
): SupportResistanceRollingEngine {
  return new SupportResistanceRollingEngine(options);
}

function resolveRollingConfig(
  baseConfig?: Partial<SupportResistanceConfig>,
  overrideConfig?: Partial<SupportResistanceConfig>,
): SupportResistanceConfig | undefined {
  if (baseConfig === undefined && overrideConfig === undefined) {
    return undefined;
  }

  return resolveSupportResistanceConfig({
    ...baseConfig,
    ...overrideConfig,
  });
}
