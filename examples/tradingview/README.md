# TradingView Visual Overlay

This folder contains a Pine Script visual companion for `sr-engine`.

It is intended for chart visualization and public visual review only. The TypeScript engine in `src/` remains the canonical implementation. The Pine script is a standalone current-chart-timeframe overlay and does not guarantee bar-for-bar parity with backend results.

## Included

- current-chart-timeframe swing structure
- BOS / CHoCH-style context labels
- FVG zones with primitive quality filters
- order blocks
- liquidity pools and sweeps
- midpoint / mitigation / invalidation lifecycle hints
- context-only alerts

## Not included

- backend-grade scoring parity
- full lifecycle parity
- API sync
- data fetching
- trade execution
- strategy signals

## File

- `sr-zones-v22-public-visual.pine`
