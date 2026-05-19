# TradingView Visual Overlay

This folder contains a Pine Script visual companion for `sr-engine`.

It is intended for chart visualization and public visual review only. The TypeScript engine in `src/` remains the canonical implementation. This Pine Script is a lightweight visual projection of SR Engine v2.2 semantics and does not guarantee bar-for-bar parity with backend results.

## Included

- confirmed pivot-based support/resistance zones
- wick-to-body level zones
- context/wide-zone handling
- lightweight freshness, mitigation, true-test, and absorption hints
- S1/R1 no-clean-range visual guard

## Not included

- backend-grade scoring parity
- full lifecycle parity
- data fetching
- trade execution
- strategy signals

## File

- `gecko-sr-zones-v22-public-visual.pine`

