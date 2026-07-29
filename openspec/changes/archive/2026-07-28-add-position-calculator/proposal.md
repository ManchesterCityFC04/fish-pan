## Why

Fish Pan currently has no position management: a user can watch a stock, set price alerts, and read AI news interpretations, but cannot plan an add to an existing position or a fresh build-up. A pure-renderer add-position calculator reuses the existing quote stream and the existing `fmtPrice` formatter, requires no new IPC, and is safe to ship behind a toolbar entry point.

This change copies the interaction model proven by PanWatch's `add-position-calculator`: it works for held positions and for empty accounts, supports both share-count and amount inputs, and can reverse-calculate the share count required to reach a target cost. We deliberately scope out persistence and AI evaluation so the calculator is self-contained and does not depend on positions or the upcoming `ai-analysis-history` change.

## What Changes

- Add an in-app "加仓测算" entry point accessible from the existing toolbar.
- Reuse the existing `fmtPrice` formatter and market-color tokens.
- Compute, for any (currentQuantity, currentCost, addQty, addPrice) tuple: new total shares, blended average cost, dilution amount, dilution percentage, and total invested.
- Support both share-count input and amount input; amount mode converts to shares using the entered add price.
- Default the add price to the current market price when the user does not enter one.
- Detect market via `resolveCode` and warn when the resulting share count is not a multiple of 100 in CN markets (A 股 100 股/手).
- Support a reverse calculation: given a target blended cost, compute the share count needed to reach that target.
- Match existing theme, market-color, and compact layout.
- Do not persist calculator inputs, do not introduce new IPC, do not introduce AI evaluation in this change, and do not introduce a position-management data model.

## Capabilities

### New Capabilities

- `add-position-calculator`: Pure-renderer helper for projecting total shares, blended average cost, dilution, and break-even upside; supports both share-count and amount inputs, an empty-account build-up mode, and a reverse target-cost calculator.

## Impact

- Existing `positions` are not required; the calculator works on inputs entered by the user.
- Existing market-color and theme tokens.
- `src/api.ts` for `fmtPrice` and `resolveCode`; no new dependencies.
- No changes to `electron/main.js`, `electron/preload.js`, `src/types.ts`, the AI path, or the alert engine.
