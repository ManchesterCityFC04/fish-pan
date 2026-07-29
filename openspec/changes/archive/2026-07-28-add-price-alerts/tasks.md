## 1. Extend the Existing Alert Model and Persistence

- [x] 1.1 Extend alert types with previous observed value, last-triggered timestamp, cooldown, and display metadata while preserving legacy fields
- [x] 1.2 Add a SQL.js migration/compatibility path for existing alert rows without requiring manual user migration
- [x] 1.3 Add a trigger-history table and Electron IPC methods for insert, list, bounded retention, and clear-history as the `alert-history` capability
- [x] 1.4 Add validation and normalization for cooldown, finite thresholds, and legacy/missing values
- [x] 1.5 Add persistence tests covering existing rows, restart restoration, history retention, and clearing

## 2. Replace One-Shot Matching with Safe Evaluation

- [x] 2.1 Implement price-above and price-below threshold-crossing evaluation using previous and current valid quote values
- [x] 2.2 Implement gain-percentage and loss-percentage threshold-crossing evaluation using current-day quote percentage
- [x] 2.3 Prime existing and newly created rules on the first valid quote without notifying
- [x] 2.4 Enforce enabled-state, per-rule cooldown, invalid-quote handling, and duplicate-trigger protection
- [x] 2.5 Persist triggered state, last-triggered time, and reset/re-arm metadata on the existing rule row
- [x] 2.6 Preserve the existing quote-refresh loop and existing alert types/editor entry point
- [x] 2.7 Add unit tests for crossings, non-crossing updates, restart priming, cooldown, invalid data, and repeated refreshes

## 3. Extend Native Notification Routing

- [x] 3.1 Extend the existing preload notification API with a narrow alert context payload
- [x] 3.2 Preserve the existing Windows notification appearance and add rule/stock context
- [x] 3.3 Handle notification activation by focusing the window and forwarding the stock context to the renderer
- [x] 3.4 Select the associated stock and open its detail view when a notification is clicked
- [x] 3.5 Record the trigger through the `alert-history` capability even if native notification creation or activation handling fails

## 4. Complete the Existing Alert UI

- [x] 4.1 Add explicit enable/disable controls to the existing alert editor with persisted state
- [x] 4.2 Add cooldown configuration while keeping a sensible default for the current refresh interval
- [x] 4.3 Add a reset/re-arm action that clears triggered state and last-triggered metadata
- [x] 4.4 Add the dedicated `alert-history` surface accessible from the main navigation
- [x] 4.5 Show reverse-chronological records with stock, condition, value, trigger time, and notification status
- [x] 4.6 Add clear-history confirmation and an empty state
- [x] 4.7 Explain that alerts work while Fish Pan is running and do not provide closed-app monitoring
- [x] 4.8 Match existing theme, market-color, compact-layout, and responsive behavior

## 5. Verification and Documentation

- [x] 5.1 Add end-to-end coverage for an existing rule crossing, history insertion, and notification routing
- [x] 5.2 Verify existing quote refresh, watchlist, position, news, and AI analysis flows remain unchanged
- [x] 5.3 Verify alert data does not expose or log LLM keys, proxy credentials, or unrelated settings
- [x] 5.4 Update user-facing documentation with supported conditions, crossing behavior, cooldown, retention, and app-running limitation
