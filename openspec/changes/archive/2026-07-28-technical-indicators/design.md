## Context

The existing K-line renderer in `src/App.tsx` reads bars from the main process and draws candles + volume. To add technical indicators, we need: (a) pure-TS indicator implementations, (b) a render layer that overlays lines and panels, and (c) per-indicator visibility state.

Constraints:

- Indicators must compute from the same bars the renderer already has; no extra fetch.
- Per-indicator visibility is per-user, persisted to localStorage.
- Indicator computation must be O(n) over bars so it stays snappy for typical lengths (60–500).

## Goals / Non-Goals

**Goals:**

- Implement MA(5,10,20,60), MACD(12,26,9), RSI(14), KDJ(9,3,3), BOLL(20,2).
- Render indicators on the existing canvas; per-indicator toggle in a small panel.
- Show indicator values at the hovered bar via tooltip.
- Persist toggle state.

**Non-Goals:**

- Trading signals, alerts on indicator events.
- Per-stock indicator settings.
- Server-side computation or caching.
- Multi-timeframe indicator overlays.

## Decisions

### 1. Pure TypeScript module, no React

`src/indicators.ts` exposes `ma`, `macd`, `rsi`, `kdj`, `boll`. Each returns an array of the same length as the input bars with `null` for the warm-up region.

### 2. Single canvas, layered draws

Continue using the existing K-line canvas. Draw candles first, then indicator lines on top. Sub-panels (MACD, RSI, KDJ) are drawn below the price pane in fixed-height regions.

### 3. Visibility state in localStorage

A single key `fish-pan:indicators` stores a JSON object like `{ ma: true, macd: true, rsi: false, kdj: true, boll: false }`.

### 4. Tooltip reuses the existing hover plumbing

We already have a hover marker for the K-line; the tooltip is a small DOM element overlaid on the canvas.

## Risks / Trade-offs

- **[Numerical edge cases]** RSI at the first bar is undefined; BOLL needs a rolling window. → Return `null` for the warm-up region; the renderer skips nulls.
- **[Canvas pixel budget]** Five indicators plus candles can crowd the chart. → Allow per-indicator toggle and a default that shows MA + MACD only.
- **[Performance]** Recomputing on every render is wasteful. → Memoize per-bar-set.

## Migration Plan

1. Add `src/indicators.ts` with unit tests in `tools/verify-indicators.mjs`.
2. Wire indicator computation into the K-line effect.
3. Add a small toggle panel in the K-line toolbar.
4. Extend the hover tooltip to show indicator values.
5. Persist toggle state to localStorage.

## Open Questions

- Should the warm-up region be visually dimmed? v1 keeps it blank; future iteration can add a subtle hatch.
- Should the indicator panel collapse on small windows? Yes, hide labels when the chart is narrow.
