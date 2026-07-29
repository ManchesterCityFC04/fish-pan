## Context

Fish Pan is a desktop Electron app focused on watchlist, alerts, and lightweight AI news interpretation. There is no `Position` model in `src/types.ts`, no positions table in `electron/main.js`, and no positions UI in `src/App.tsx`. PanWatch, by contrast, has a full multi-account position model and embeds an `add-position-calculator` directly on each position row.

We are not building a position model in this change. Instead we are building a self-contained calculator that the user can open from a toolbar entry. The calculator accepts the four numbers it needs (currentQuantity, currentCost, addQty, addPrice) and produces the same outputs as PanWatch's `calcAddPosition`—including dilution amount, dilution percentage, and total invested—plus a reverse calculation that PanWatch exposes under the name `calcSharesForTargetCost`.

Constraints:

- No new persistence. The calculator state is local to the modal.
- No new IPC. The calculator calls only existing renderer functions and `resolveCode` for market detection.
- The calculator must work for empty accounts: when both `currentQuantity` and `currentCost` are zero, the title and the dilution semantics change to a build-up.
- The existing `fmtPrice` formatter must be reused for all number rendering.
- The reverse calculator must reject impossible configurations and explain why.

## Goals / Non-Goals

**Goals:**

- Provide a calculator that takes (currentQuantity, currentCost, addQty, addPrice) and produces newQty, newCost, diluteAbs, dilutePct, totalInvested.
- Provide a reverse calculator that takes (currentQuantity, currentCost, addPrice, target) and returns the share count needed to reach the target blended cost.
- Accept either a share-count input or an amount input; convert amount to shares at the entered add price.
- Default the add price to the current market price.
- Show an A 股 100 股/手 warning when the resulting share count is not a multiple of 100.
- Match the existing modal pattern, theme, and market-color tokens.

**Non-Goals:**

- Persisting calculator inputs.
- Reading or writing positions.
- AI evaluation (the `ai-analysis-history` change will provide the bridge later).
- Risk metrics, scenario simulation, or currency conversion.
- Touching `electron/main.js` or `electron/preload.js`.

## Decisions

### 1. Pure functions, no React state outside the modal

`src/addPosition.ts` exposes `calcAddPosition`, `calcSharesForTargetCost`, and a small input validator. The modal calls these via `useMemo` and re-renders instantly. This makes the module testable in Node and reusable from future changes.

### 2. Re-use `fmtPrice` and market-color tokens

All number formatting uses the existing `fmtPrice` from `src/api.ts`. The modal uses the same `modal-mask` and `modal` classes as the existing alert and analysis modals.

### 3. Market-aware hand warning

A helper `isLikelyCNMarket(resolveCode)` runs once when the user opens the calculator for a specific stock (or once for the manual entry). For CN markets, we display a soft warning when the resulting share count is not a multiple of 100.

### 4. Read-only output, no side effects

The calculator must not mutate positions. Saving is intentionally out of scope. We do not introduce a `Position` data model in this change.

### 5. Reverse calculator validity check

`calcSharesForTargetCost` only returns a non-null value when `0 < addPrice < target < curCost`. When the user enters an impossible target, the UI shows the standard PanWatch hint: "需 加仓价 < 目标 < 现成本 才能降到该成本".

## Risks / Trade-offs

- **[Confusion with actual buy]** Users may mistake the calculator for a buy button. → Title is "加仓测算"; the button text is "试算"; the modal never mutates state.
- **[Currency mixing]** HK and US positions use different currencies; the calculator simply shows each in its own currency and does not convert. → Document the limitation in the modal hint.
- **[Reverse calculation misuse]** Users may enter targets that are higher than current cost. → The validity check + UI hint prevents silent miscalculations.
- **[Empty inputs]** All inputs default to empty strings, and the calculator renders a placeholder result when any input is missing or invalid.

## Migration Plan

1. Add `src/addPosition.ts` with `calcAddPosition`, `calcSharesForTargetCost`, and an `isLikelyCNMarket` helper.
2. Add a Node-side self-test script under `tools/verify-add-position.mjs`.
3. Add the `AddPositionCalculator` modal in `src/App.tsx`.
4. Add a toolbar entry point that opens the modal.
5. Use `resolveCode` from `src/api.ts` to detect market when the calculator is opened for a specific stock.

## Open Questions

- Should we keep the calculator state when the user closes and reopens the modal? No; the modal is stateless across opens.
- Should we also expose a per-stock quick calculator? Yes, the toolbar entry can be invoked with an optional `code` argument so a future per-row button on a watchlist card can pre-fill the code and current price.
