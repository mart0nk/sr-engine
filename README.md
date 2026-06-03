# sr-engine

Deterministic support/resistance engine for OHLCV candle streams.

`sr-engine` detects swing pivots, builds support/resistance zones, classifies zone lifecycle and quality, resolves overlapping opposite-role zones, and returns the nearest actionable S1/R1 structure around the current price.

The package is intentionally data-source agnostic. It does not fetch candles, live prices, ATR, tick size, instrument metadata, or exchange data. Callers provide those inputs and receive a pure `SupportResistanceSnapshot`.

For production/backtest integrations, prefer `SupportResistanceEngine` or `validateSupportResistanceInput(...)`. The old `StrictSupportResistanceEngine` name remains as a backward-compatible alias. For callers that explicitly want the pre-validation core, use `PermissiveSupportResistanceEngine`.

## Install

```bash
npm install sr-engine
```

## 5-minute integration

1. Normalize candles to the `Candle` contract.
2. Decide whether you want permissive mode or strict production validation.
3. Run the engine in batch mode or accumulate candles through the rolling wrapper.
4. Convert the snapshot into overlays or scanner facts if your app needs a simpler projection layer.

```ts
import { SupportResistanceEngine } from "sr-engine";
import { toChartOverlays } from "sr-engine/chart";
import { toScannerFacts } from "sr-engine/facts";

const engine = new SupportResistanceEngine({
  requireAtr: false,
  requireTickSize: false,
});

const snapshot = engine.evaluate({
  symbol: "BTCUSDT",
  timeframe: "15m",
  candles,
  currentPrice: 42100,
  priceSource: "MARKET_SNAPSHOT",
  timestamp: new Date(),
});

const overlays = toChartOverlays(snapshot);
const facts = toScannerFacts(snapshot);
```

## Recommended Usage

For production/backtest integrations, start with `SupportResistanceEngine`.
It enforces the candle/timeframe/ATR/tick-size contract before delegating into
the same deterministic SR pipeline as the permissive core engine.

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
```

## Permissive Core Usage

```ts
import {
  SupportResistanceEngine,
  PermissiveSupportResistanceEngine,
  type Candle,
  type SupportResistanceSnapshot,
} from "sr-engine";

const engine = new PermissiveSupportResistanceEngine();

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

const strictEngine = new SupportResistanceEngine();
strictEngine.evaluate({
  symbol: "BTCUSDT",
  timeframe: "15m",
  candles,
  currentPrice: 42100,
  priceSource: "MARKET_SNAPSHOT",
  timestamp: new Date(),
  atr: 180,
  tickSize: 0.1,
});
```

## Rolling / live usage

For live-like integrations where candles arrive one by one, use the rolling wrapper.
It keeps a closed-candle buffer and delegates to the same SR engine under the hood.

```ts
import { createSupportResistanceRollingEngine } from "sr-engine/rolling";

const rolling = createSupportResistanceRollingEngine({
  symbol: "BTCUSDT",
  timeframe: "5m",
  strict: true,
  validationOptions: {
    requireAtr: false,
    requireTickSize: false,
  },
});

rolling.pushClosedCandle(candle);

const snapshot = rolling.evaluate({
  currentPrice: 42100,
  priceSource: "MARKET_SNAPSHOT",
  timestamp: new Date(),
});
```

Rolling wrapper methods:

- `pushClosedCandle(candle)`
- `pushClosedCandles(candles)`
- `getCandles()`
- `reset()`
- `evaluate(...)`

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

Contract boundary:

- `candles` are the closed structure candles used for pivots, lifecycle, quality, and evidence.
- `currentPrice` is a separate location input and may come from a live market snapshot or the last closed candle.
- In-progress candles must not participate in structure logic. If you need that guarantee enforced, use the strict validator/strict engine path.

Supported timeframes:

```ts
type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";
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

`ready` is the legacy broad readiness flag. Newer consumers should prefer the additive readiness fields on `SupportResistanceSnapshot`:

- `legacyReady`
- `engineReady`
- `structureReady`
- `actionableStructureReady`
- `boundedRangeReady`
- `locationContextUsable`
- `readinessReasons`

These fields describe market-structure usability only. They are not trade signals and do not imply buy/sell permission.

## Integration adapters

Two projection helpers are available for app/chart/scanner integrations:

- `toChartOverlays(snapshot)` from `sr-engine/chart`
- `toScannerFacts(snapshot)` from `sr-engine/facts`

These helpers do not add new SR logic. They only reshape the engine snapshot into
consumer-friendly structures.

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

Pivot visibility is intentionally next-bar safe:

- `confirmedIndex = pivotIndex + rightBars`
- `availableFromIndex = confirmedIndex + 1`

This means a pivot or zone becomes visible only after the replay cursor has
advanced to the bar after the confirming candle. Confirming-candle visibility
is not part of the current `sr-engine` contract.

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

Stable zone construction policy:

- The stable public `ZoneConstructionPolicy` is `WICK_TO_BODY`.
- Historical unsupported policy strings are no longer part of the stable public API contract.

## Strict Validation

Use the strict validation boundary when the caller needs fail-fast guarantees before running the core engine. This is the recommended production/backtest path:

```ts
import {
  SupportResistanceEngine,
  validateSupportResistanceInput,
} from "sr-engine";

validateSupportResistanceInput({
  symbol: "ETHUSDT",
  timeframe: "1h",
  candles,
  currentPrice: 2500,
  priceSource: "MARKET_SNAPSHOT",
  timestamp: new Date(),
  atr: 35,
  tickSize: 0.01,
});

const strictEngine = new SupportResistanceEngine();
const snapshot = strictEngine.evaluate({
  symbol: "ETHUSDT",
  timeframe: "1h",
  candles,
  currentPrice: 2500,
  priceSource: "MARKET_SNAPSHOT",
  timestamp: new Date(),
  atr: 35,
  tickSize: 0.01,
});
```

`validateSupportResistanceInput(...)` reports issues. `SupportResistanceEngine` rejects `ERROR` issues before delegating to the permissive core engine.

The strict validation surface covers:

- empty, unsorted, duplicate, or open structure candles
- invalid OHLC or non-finite numeric fields
- invalid timeframe literals, symbol/timeframe mismatches, and invalid candle durations
- timeframe gaps depending on gap policy
- missing or invalid ATR when required
- missing or invalid tick size when required

Strict validation assumes inclusive candle close times:

- `closeTime = openTime + timeframeMs - 1`

If your data provider uses exclusive close boundaries such as `[openTime, closeTime)`, normalize candles before using `SupportResistanceEngine`.

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

These are useful for diagnostics, custom pipelines, or compatibility shims, but most consumers should start with `SupportResistanceEngine` or the rolling wrapper.

Public subpath exports:

- `sr-engine/config`
- `sr-engine/types`
- `sr-engine/rolling`
- `sr-engine/chart`
- `sr-engine/facts`

## TradingView Visual Overlay

A TradingView Pine Script visual companion is available in:

`examples/tradingview/sr-zones-v22-public-visual.pine`

This script is intended for chart visualization and public visual review. It is not the canonical SR Engine implementation and should not be used as a parity reference for backend results.

The TypeScript engine remains the source of truth.

## Testing and Determinism

The repo now includes:

- synthetic replay/no-lookahead fixtures
- strict-validation tests
- ATR-sensitive lifecycle regression tests
- compact real-market regression fixtures with provenance
- normalized golden snapshot checkpoints

Golden tests compare normalized business projections, not raw full snapshots, to keep regressions high-signal and deterministic.

## Design Constraints

- ESM-only package.
- No exchange, database, HTTP, WebSocket, or environment dependencies.
- No market-data fetching.
- No indicator calculation. ATR is an optional input.
- No trade execution logic.
- No clean-stop or 2R-path logic.

The caller owns data loading, live price selection, ATR calculation, and instrument metadata. Candle validation can remain caller-owned in permissive mode, or be enforced through the strict validation boundary.

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
