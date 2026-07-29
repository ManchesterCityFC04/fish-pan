## Why

Fish Pan already has a basic one-shot alert implementation: a user can attach one price or percentage rule to a watchlist stock, the rule is checked during quote refresh, and a native notification is sent when it matches. The current implementation triggers whenever a quote is on the matching side, permanently marks the rule as triggered, has no cooldown or threshold-crossing state, and does not retain a user-visible trigger history. Notification clicks also have no stock-routing behavior.

This change hardens and completes the existing alert capability rather than creating a second alert system.

## What Changes

- Preserve the existing price-above, price-below, gain-percentage, and loss-percentage rule types.
- Change matching behavior to threshold-crossing behavior using the previous valid quote value.
- Add per-rule cooldown handling and safe first-quote priming after restart.
- Persist the previous observed value and last-triggered metadata.
- Add durable trigger-history records with bounded retention and clear-history behavior.
- Add explicit rule enable/disable and reset behavior without requiring deletion and recreation.
- Extend the existing native notification flow with stock/rule context and click-to-focus/select behavior.
- Add an in-app alert history surface and clarify that monitoring only works while Fish Pan is running.
- Do not add external push channels, background alerts while the app is fully closed, or automated trading in this change.

## Capabilities

### New Capabilities

- `price-alerts`: User-configurable local stock price and percentage alerts, desktop notifications, persistence, cooldowns, and trigger history.
- `alert-history`: A dedicated in-app surface for inspecting and clearing trigger records produced by `price-alerts`.

## Impact

- Existing alert types and editor in `src/App.tsx` and `src/types.ts`.
- Existing quote-refresh evaluation in `src/App.tsx`.
- Existing SQL.js alert schema and IPC methods in `electron/main.js` and `electron/preload.js`.
- Renderer notification handling for native notification activation.
- New local trigger-history storage and alert-history UI.
- No new remote service or external notification provider is required.
