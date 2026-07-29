## 1. Pure Indicator Module

- [x] 1.1 Implement `src/indicators.ts` with `ma(closes, n)`, `macd(closes)`, `rsi(closes, n=14)`, `kdj(high, low, close)`, `boll(closes, n=20, k=2)`
- [x] 1.2 Each function returns an array of the same length as the input, with `null` for the warm-up region
- [x] 1.3 Avoid mutating the input arrays
- [x] 1.4 Add a Node-side self-test script `tools/verify-indicators.mjs` covering known-value test cases

## 2. K-Line Renderer

- [x] 2.1 Compute indicators when the bar set changes; cache the result
- [x] 2.2 Draw MA lines on the price pane with distinct colors
- [x] 2.3 Draw BOLL upper/middle/lower bands on the price pane
- [x] 2.4 Draw MACD, RSI, and KDJ sub-panels below the price pane
- [x] 2.5 Add a toggle panel in the K-line toolbar
- [x] 2.6 Persist toggle state under the `fish-pan:indicators` localStorage key

## 3. Tooltip

- [x] 3.1 Extend the existing hover marker to expose the current bar index
- [x] 3.2 Render indicator values at the hovered bar
- [x] 3.3 Skip indicators whose value is `null`
- [x] 3.4 Hide the tooltip when no bar is hovered

## 4. Verification

- [x] 4.1 Run `node tools/verify-indicators.mjs`
- [x] 4.2 Run `npx tsc --noEmit`
- [x] 4.3 Run `openspec validate technical-indicators --strict`
- [x] 4.4 Verify K-line performance remains smooth at 500 bars
- [x] 4.5 Verify the existing AI and alert paths remain unchanged
