## Context

Fish Pan is an Electron desktop application. The renderer already refreshes watched-stock quotes on a timer, evaluates a basic one-shot alert, and persists alert rules through a SQL.js-backed Electron IPC layer. The current alert editor and notification path are the baseline to extend: do not create a parallel alert model or polling loop. Native notifications are emitted by Electron's main process, while rule evaluation remains in the renderer because it owns the latest quote refresh cycle.

Constraints:

- This change must not require a remote backend or external notification provider.
- Existing watchlist and quote-refresh behavior must remain intact.
- API keys and other secrets must not be written to alert records or notification payloads.
- The app cannot promise alerts while it is fully closed; this change only covers the running Electron process.

## Goals / Non-Goals

**Goals:**

- Provide local, configurable price and percentage alert rules.
- Evaluate rules from the existing quote refresh loop.
- Trigger only on threshold crossings, with cooldown protection.
- Persist rules and trigger history across restarts.
- Use Windows desktop notifications and focus/select the relevant stock when clicked.
- Give users a dedicated management and history experience.

**Non-Goals:**

- External push channels such as Telegram, email, Bark, or webhooks.
- Alerts when the application is completely closed.
- Technical-indicator or volume-based conditions.
- Automated trading or AI-generated alert rules.
- Replacing the existing quote providers.

## Decisions

### 1. Evaluate in the existing refresh path

The renderer will pass each newly received quote through an alert evaluator after normal quote state updates. This avoids adding a second polling loop and keeps behavior consistent with the displayed price.

**Alternative considered:** a separate main-process polling service. Rejected for this change because it duplicates provider traffic and complicates lifecycle/error handling. It can be introduced later for closed-app/background alerts.

### 2. Use explicit rule and trigger-history records

Each rule will have a stable id, symbol, market, condition type, threshold, enabled state, cooldown, last-known value, last-triggered time, and timestamps. Each trigger record will store the rule id, quote snapshot needed for display, triggered condition, and timestamp.

**Alternative considered:** infer history from application logs. Rejected because logs are not a user-facing durable data model and would make deduplication difficult.

### 3. Extend the existing SQL.js persistence boundary

Alert rules already live behind the Electron database IPC methods. Extend that schema and bridge for previous-value metadata and trigger history, preserving existing rows and defaulting missing fields for existing users. Do not move alert data to a new storage system in this change.

**Alternative considered:** introduce SQLite or a second renderer store. Rejected because the project already has a SQL.js persistence boundary and a duplicate store would make migration and recovery harder.

### 4. Use a native notification IPC contract

The renderer will request a notification through a narrow preload API. Electron main will create the Windows notification and return the associated symbol/rule context on activation so the renderer can focus the window and select the stock.

**Alternative considered:** browser Notification API only. Rejected because Electron desktop behavior and click/focus handling are more reliable through the main process.

### 5. Trigger on crossings, not every matching quote

For `above` and `below` rules, a trigger requires the previous observed value to be on the opposite side of the threshold and the current value to be on the matching side. Percentage rules use the same crossing semantics. A cooldown is still enforced as a safety net for restarts or noisy data.

## Risks / Trade-offs

- **[Quote gaps]** A price may jump across a threshold between refreshes. → Treat any observed crossing as a valid trigger and show the current quote in history.
- **[Restart state]** The first quote after restart has no previous value. → Prime the rule with the first valid quote without notifying.
- **[Provider errors]** Failed or partial quote responses could create false alerts. → Evaluate only valid numeric quotes and preserve the last-known value on errors.
- **[Duplicate notifications]** Refreshes or repeated renderer events may trigger duplicates. → Persist last-triggered time and enforce cooldown before notification.
- **[Local storage growth]** Trigger history can grow indefinitely. → Add a retention limit and a clear-history action.
- **[App closed]** No renderer refresh occurs when the app is fully closed. → Document this limitation in the UI and keep background monitoring out of scope.

## Migration Plan

1. Extend the existing alert schema and IPC methods with backward-compatible fields and history records.
2. Replace the current matching-side check with a crossing/cooldown evaluator while preserving the existing quote-refresh path.
3. Extend the existing preload/main notification bridge with activation context.
4. Add rule state controls and alert history to the existing alert editor/watchlist experience.
5. Existing users require no manual migration; missing enhancement fields default safely.
6. Rollback is leaving the new metadata/history unused and restoring the prior one-shot evaluator; existing watchlist, quote, position, and alert rules remain intact.

## Open Questions

- Should percentage thresholds use the quote's current-day change, or calculate change from the rule creation price? The initial proposal assumes current-day percentage change because that value already comes from the quote provider.
- What default cooldown is most suitable for a 60-second refresh interval? The initial design assumes 10 minutes.
- Should notification clicks select the stock in the watchlist or open the stock detail modal? The initial design assumes selecting the stock and opening its detail view when available.
