## Why

The current K-line view in Fish Pan only shows candles and volume. Users have to mentally compute moving averages, MACD crossovers, RSI overbought/oversold, and Bollinger band touches. Adding a standard, opt-in technical-indicator layer turns the existing K-line into a more useful chart without changing providers, persistence, or the AI path.

## What Changes

- Compute, in pure TypeScript, the following indicators from existing K-line bars: MA(5,10,20,60), MACD(12,26,9), RSI(14), KDJ(9,3,3), BOLL(20,2).
- Render indicators on the existing K-line canvas with per-indicator visibility toggles persisted in localStorage.
- Provide a tooltip that shows the value of every visible indicator at the hovered bar.
- Do not change the data source, the AI path, or the alert engine.

## Capabilities

### New Capabilities

- `technical-indicators`: Local computation and rendering of MA, MACD, RSI, KDJ, and Bollinger Bands on the existing K-line chart, with persisted visibility toggles.

## Impact

- `src/App.tsx` K-line rendering.
- `src/types.ts` (`KLineBar` stays the same).
- No changes to `electron/main.js` or `electron/preload.js`.
- No changes to the LLM or alert paths.
