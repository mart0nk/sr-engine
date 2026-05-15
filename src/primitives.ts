// Primitive types copied from src/market-data/market-data.types.ts
// The package must not import from the app src/ tree.

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export type Candle = {
  symbol: string;
  timeframe: Timeframe;
  openTime: Date;
  closeTime?: Date;
  lastTradeAt?: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;
  tradeCount?: number;
  closed: boolean;
};

export type PriceSource = 'MARKET_SNAPSHOT' | 'LAST_CLOSED_CANDLE';
