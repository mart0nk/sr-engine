# Changelog

## Unreleased

### Changed

- Lifecycle reaction classification now uses ATR when ATR is provided to `SupportResistanceEngine.evaluate(...)`, including the `FRESH -> TESTED` promotion threshold via `trueTestMinReactionStrength`. This can change lifecycle, quality, and readiness outcomes for volatility-sensitive zones.
- The stable public `ZoneConstructionPolicy` surface now exposes only `WICK_TO_BODY`.
- `ready` is now documented as a legacy coarse readiness flag.

### Added

- `StrictSupportResistanceEngine` for fail-fast production/backtest integration.
- `validateSupportResistanceInput(...)` and a typed validation issue taxonomy.
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

### Notes

- This working tree is now versioned as `0.2.0`.
- If you consume `sr-engine` as a stable external API, treat the config-surface narrowing and changed ATR-sensitive lifecycle behavior as a contract-change release.
