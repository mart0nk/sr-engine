# sr-engine

Deterministic support/resistance engine for OHLCV candle streams.

`sr-engine` detects swing pivots, builds support/resistance zones, classifies zone lifecycle and quality, resolves overlapping opposite-role zones, and returns the nearest actionable S1/R1 structure around the current price.

The package is intentionally data-source agnostic. It does not fetch candles, live prices, ATR, tick size, instrument metadata, or exchange data. Callers provide those inputs and receive a pure `SupportResistanceSnapshot`.

## Install

```bash
npm install sr-engine
```

## Basic Usage

```ts
import {
  SupportResistanceEngine,
  type Candle,
  type SupportResistanceSnapshot,
} from "sr-engine";

const engine = new SupportResistanceEngine();

const candles: Candle[] = [
  {
    symbol: "BTCUSDT",
    timeframe: "15m",
    openTime: new Date("2026-01-01T00:00:00.000Z"),
    closeTime: new Date("2026-01-01T00:15:00.000Z"),
    open: 42000,
    high: 42120,
    low: 41880,
    close: 42050,
    volume: 1200,
    closed: true,
  },
  // Provide enough closed candles for pivot confirmation.
];

const snapshot: SupportResistanceSnapshot = engine.evaluate({
  symbol: "BTCUSDT",
  timeframe: "15m",
  candles,
  currentPrice: 42100,
  priceSource: "MARKET_SNAPSHOT",
  timestamp: new Date(),
  atr: 180,
  tickSize: 0.1,
});

console.log(
  snapshot.s1?.mid,
  snapshot.r1?.mid,
  snapshot.structureState.rangeLocation,
);
```

## Input Contract

```ts
type SupportResistanceInput = {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  currentPrice: number;
  priceSource: "MARKET_SNAPSHOT" | "LAST_CLOSED_CANDLE";
  timestamp: Date;
  atr?: number;
  tickSize?: number;
  config?: SupportResistanceConfig;
};
```

The engine expects candles to be sorted oldest to newest. It can run without `atr` and `tickSize`, but some quality, width, freshness, and diagnostics signals become weaker and the snapshot will include missing/warning metadata.

Supported timeframes:

```ts
type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
```

## Output

`evaluate` returns a `SupportResistanceSnapshot` containing:

- `supportZones` and `resistanceZones`: accepted actionable level zones.
- `contextZones`: wide/context-only zones such as range boxes.
- `transitionZones` and `brokenZonesWaitingForRetest`: broken zones that may still matter for retest context.
- `s1`, `s2`, `r1`, `r2`: nearest selected support/resistance levels.
- `structureState`: price location relative to zones and range.
- `structureAvailability`: `ACTIONABLE`, `WATCHABLE`, `CONTEXT_ONLY`, or `NONE`.
- `diagnostics`: pivot counts, zone counts, bottleneck, conflict state, and warnings.
- `missing`, `warnings`, and `evidence`: machine-readable readiness and explanation metadata.

Snapshots can be not-ready. In that case `ready` is `false` and `notReadyReason` explains why:

- `MISSING_CURRENT_PRICE`
- `INSUFFICIENT_CANDLES`
- `NO_VALID_PIVOTS`
- `NO_PUBLIC_ACTIVE_ZONES`

## Zone Model

Zones are built from confirmed swing highs/lows and then processed through:

1. pivot detection
2. zone candidate construction
3. zone clustering
4. lifecycle classification
5. origin, touch, absorption, and freshness evidence
6. quality scoring and tiering
7. wide-zone/context-zone classification
8. opposite-role conflict resolution
9. nearest S1/R1 selection

Zone lifecycle values:

```ts
type ZoneLifecycle = "FRESH" | "TESTED" | "BROKEN" | "FLIPPED" | "INVALIDATED";
```

Zone tiers:

```ts
type ZoneTier = "ACTIONABLE" | "WATCHABLE" | "CONTEXT" | "DROP";
```

## Configuration

Use defaults for normal operation:

```ts
import {
  DEFAULT_SUPPORT_RESISTANCE_CONFIG,
  resolveSupportResistanceConfig,
} from "sr-engine";
```

Override only the fields you need:

```ts
const config = resolveSupportResistanceConfig({
  pivotLeftBars: 3,
  pivotRightBars: 3,
  zoneTierActionableMinScore: 80,
});

const snapshot = engine.evaluate({
  symbol: "ETHUSDT",
  timeframe: "1h",
  candles,
  currentPrice: 2500,
  priceSource: "LAST_CLOSED_CANDLE",
  timestamp: new Date(),
  atr: 35,
  tickSize: 0.01,
  config,
});
```

## Advanced Exports

The package also exports the lower-level building blocks used by the engine:

- `detectPivots`
- `buildZoneCandidates`
- `clusterZones`
- `classifyZoneLifecycle`
- `evaluateZoneQuality`
- `resolveClosestZones`
- `resolveOppositeRoleConflicts`
- `evaluateReactionQuality`
- `evaluateZoneTouchAccountingV2`
- `evaluateZoneOriginEvidence`
- `classifyFreshnessState`
- `evaluateLiquidityRebuildEvidence`
- `evaluateAbsorptionRisk`

These are useful for diagnostics, custom pipelines, or compatibility shims, but most consumers should start with `SupportResistanceEngine`.

## TradingView Visual Overlay

A TradingView Pine Script visual companion is available in:

`examples/tradingview/sr-zones-v22-public-visual.pine`

This script is intended for chart visualization and public visual review. It is not the canonical SR Engine implementation and should not be used as a parity reference for backend results.

The TypeScript engine remains the source of truth.

## Design Constraints

- ESM-only package.
- No exchange, database, HTTP, WebSocket, or environment dependencies.
- No market-data fetching.
- No indicator calculation. ATR is an optional input.
- No trade execution logic.
- No clean-stop or 2R-path logic.

The caller owns data loading, candle validation, live price selection, ATR calculation, and instrument metadata.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

Before publishing, the package runs:

```bash
npm run prepublishOnly
```
