## Why

Today, AI analysis in Fish Pan is bound to a single news article. To answer “what should I think about this stock right now?”, a user has to scroll the news feed and click each item individually. There is no first-class, multi-source view. A one-click stock diagnosis aggregates quote, K-line summary, recent news, and current holding (if any) and produces a single structured brief, while remaining strictly an analysis feature — not a buy/sell signal.

## What Changes

- Add a "一键诊断" entry point on the existing per-stock surface.
- Bundle the inputs: current quote, recent K-line bar, recent news (up to N items), current holding state, and active alert rules.
- Send the bundle to the existing LLM using a dedicated prompt template; receive a structured brief.
- Persist the brief through the `ai-analysis-history` capability and link it back to the originating stock.
- Show progress, support cancel, and recover gracefully on LLM errors.

## Capabilities

### New Capabilities

- `one-click-diagnosis`: A per-stock analysis flow that aggregates quote, K-line, news, holdings, and alerts into a single LLM-driven brief, with progress and cancellation.

## Impact

- The existing news modal in `src/App.tsx`.
- The existing LLM bridge in `electron/main.js` (no new provider, only a new prompt template).
- The new `ai-analysis-history` capability provides persistence.
- The existing alert engine provides a read-only view of relevant rules.
