# Changelog

## Unreleased

### Changed

- Lifecycle reaction classification now uses ATR when ATR is provided to `SupportResistanceEngine.evaluate(...)`, including the `FRESH -> TESTED` promotion threshold via `trueTestMinReactionStrength`. This can change lifecycle, quality, and readiness outcomes for volatility-sensitive zones.
- The stable public `ZoneConstructionPolicy` surface now exposes only `WICK_TO_BODY`.
- `ready` is now documented as a legacy coarse readiness flag.
- `SupportResistanceRollingEngine` now defaults to `strict: true`, matching the strict-first public engine direction.

### Added

- `SupportResistanceEngine` is now the canonical fail-fast production/backtest wrapper name.
- `StrictSupportResistanceEngine` remains as a backward-compatible alias.
- `PermissiveSupportResistanceEngine` exposes the old pre-validation core evaluator for advanced/library use.
- `validateSupportResistanceInput(...)` and a typed validation issue taxonomy.
- `SupportResistanceRollingEngine` and `createSupportResistanceRollingEngine(...)` for live/incremental closed-candle integrations.
- `toChartOverlays(snapshot)` for chart-friendly zone projections.
- `toScannerFacts(snapshot)` for scanner-friendly market-structure facts.
- Additive readiness fields:
  - `legacyReady`
  - `engineReady`
  - `structureReady`
  - `actionableStructureReady`
  - `boundedRangeReady`
  - `locationContextUsable`
  - `readinessReasons`
- Replay/no-lookahead regression coverage with synthetic fixtures.
- Compact real-market regression fixtures with provenance and normalized golden checkpoints.
- Public integration-oriented subpath exports:
  - `sr-engine/config`
  - `sr-engine/types`
  - `sr-engine/rolling`
  - `sr-engine/chart`
  - `sr-engine/facts`

### Notes

- This working tree is now versioned as `0.2.0`.
- Breaking behavior change for consumers that already imported `SupportResistanceEngine`: it now performs strict validation before evaluation. Use `PermissiveSupportResistanceEngine` if you need the old permissive behavior.
- If you consume `sr-engine` as a stable external API, treat the config-surface narrowing and changed ATR-sensitive lifecycle behavior as a contract-change release.
