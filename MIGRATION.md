# Migration Notes

## Overview

This remediation changes behavior and expands the public contract in three important ways:

1. ATR-sensitive lifecycle classification is now correctly wired through the engine.
2. A strict validation boundary is available for production/backtest callers.
3. Readiness is now layered; `ready` remains for compatibility but is considered legacy/coarse.

## Behavioral Change: ATR Now Affects Lifecycle Classification

Previous behavior:

- `SupportResistanceEngine.evaluate(...)` accepted `atr`
- lifecycle classification did not pass `atr` into `evaluateReactionQuality(...)`
- some touches/rejections were interpreted with percentage-only logic even when ATR was available

Current behavior:

- when `atr` is provided, lifecycle reaction checks use ATR-aware thresholds
- `FRESH -> TESTED` now requires a reaction that meets `trueTestMinReactionStrength`, instead of promoting any geometric rejection
- this can change:
  - clean-vs-weak reaction interpretation
  - lifecycle credit
  - quality score
  - readiness outputs downstream

If you already provide ATR in production or backtests, expect some historical snapshots to change. This is an intentional correctness fix.

## New Strict Validation Boundary

New exports:

- `validateSupportResistanceInput(...)`
- `SupportResistanceEngine`
- `StrictSupportResistanceEngine` (backward-compatible alias)
- `PermissiveSupportResistanceEngine`

Use these when you want fail-fast guarantees for:

- sorted candles
- duplicate timestamp rejection
- closed structure candles
- valid OHLC invariants
- valid timeframe literals and inclusive candle duration
- finite numeric fields
- gap policy enforcement
- required ATR/tick size

`validateSupportResistanceInput(...)` reports issues. `SupportResistanceEngine` throws on `ERROR` issues and then evaluates the sanitized closed-candle structure series.

## Breaking Public Rename: SupportResistanceEngine Is Now Strict

Previous behavior:

- `SupportResistanceEngine` was the permissive core evaluator

Current behavior:

- `SupportResistanceEngine` is now the strict/fail-fast wrapper
- `StrictSupportResistanceEngine` remains as a backward-compatible alias
- `PermissiveSupportResistanceEngine` exposes the old raw evaluator

Migration guidance:

- if you want the new production/backtest default, keep using `SupportResistanceEngine`
- if you relied on permissive behavior, switch imports to `PermissiveSupportResistanceEngine`

Strict validation assumes inclusive candle close times:

- `closeTime = openTime + timeframeMs - 1`

If your data provider uses exclusive close boundaries, normalize the candle timestamps before using the strict path.

The old permissive `SupportResistanceEngine` is now exposed as `PermissiveSupportResistanceEngine` for library-style usage.

## Structure Candles vs Live Current Price

The contract is now documented explicitly:

- `candles` are the closed structure candles used for pivots, lifecycle, quality, and evidence
- `currentPrice` is a separate live/location input
- in-progress candles must not participate in structure logic

If your caller previously mixed open candles into the structure series, move to the strict path or sanitize the series before evaluation.

## Readiness Contract

`ready` remains on `SupportResistanceSnapshot` for backward compatibility, but it is now considered legacy/coarse readiness.

New additive readiness fields:

- `legacyReady`
- `engineReady`
- `structureReady`
- `actionableStructureReady`
- `boundedRangeReady`
- `locationContextUsable`
- `readinessReasons`

Migration guidance:

- existing callers can keep using `ready`
- new callers should gate decisions off the layered readiness fields instead
- treat readiness as market-structure usability only, not trade permission

## Zone Construction Policy

The stable public `ZoneConstructionPolicy` now exposes only:

- `WICK_TO_BODY`

Historical strings such as `FULL_CANDLE`, `BODY_TO_BODY`, and `ATR_AROUND_PIVOT` are no longer part of the stable public type contract because the engine did not implement them as working policies.

If you had code that referenced those strings, remove them and use `WICK_TO_BODY`.
