## 1. Pure Add-Position Module

- [x] 1.1 Implement `src/addPosition.ts` with `calcAddPosition({curQty, curCost, addQty, addPrice})` returning `{newQty, newCost, diluteAbs, dilutePct, totalInvested, isAdd}`
- [x] 1.2 Implement `calcSharesForTargetCost({curQty, curCost, addPrice, target})` returning the required share count or `null`
- [x] 1.3 Implement `isLikelyCNMarket(code)` using `resolveCode` from `src/api.ts`
- [x] 1.4 Implement `isLotWarningCN(shareCount, isCN)` returning a boolean
- [x] 1.5 Validate non-negative currentQuantity/currentCost and positive addQty/addPrice; return `null` for invalid inputs
- [x] 1.6 Add a Node-side self-test script under `tools/verify-add-position.mjs` covering valid, invalid, empty, reverse, and edge cases

## 2. Calculator Modal

- [x] 2.1 Add `AddPositionCalculator` component in `src/App.tsx` using the existing modal pattern
- [x] 2.2 Add input fields for current quantity, current cost, add quantity or add amount, and add price
- [x] 2.3 Add a toggle between "按股数" and "按金额" modes
- [x] 2.4 Default the add price placeholder to the current market price when the modal is opened with a code
- [x] 2.5 Render newQty, newCost, diluteAbs, dilutePct, and totalInvested using `fmtPrice`
- [x] 2.6 Render the build-up title and behavior when both current quantity and current cost are zero
- [x] 2.7 Render the A 股 100 股/手 warning when the resolved market is CN and the share count is not a multiple of 100
- [x] 2.8 Render the reverse target-cost input and the required share count when a feasible target is entered
- [x] 2.9 Show the validity hint when the user enters an infeasible target
- [x] 2.10 Match existing theme, market-color, and compact layout

## 3. Toolbar Entry Point

- [x] 3.1 Add a "加仓测算" button in the existing toolbar
- [x] 3.2 Wire the button to open the modal with no pre-filled code
- [x] 3.3 Allow future per-row buttons to open the modal with a pre-filled code and current price (out of scope for this change, but the prop shape SHALL be compatible)

## 4. Verification

- [x] 4.1 Run `node tools/verify-add-position.mjs`
- [x] 4.2 Run `npx tsc --noEmit`
- [x] 4.3 Run `openspec validate add-position-calculator --strict`
- [x] 4.4 Verify the existing alert and AI flows remain unchanged
- [x] 4.5 Verify no new IPC and no new persistence
